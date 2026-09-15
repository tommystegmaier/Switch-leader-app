// Cloudflare Pages Function: POST /api/student-signup
//
// Creates a student account from the link a Youth Pastor hands out. A student
// gives their name, graduation year, birthday, phone number and a password —
// no email address, because students don't reliably have one they check.
//
// Supabase hangs every account off an email address, so one is derived from
// the phone number and never shown to anyone. It is deliberately at a
// subdomain that receives no mail: nothing should ever be sent there, and
// treating it as a real inbox is the mistake to avoid. That is also why a
// Coach can reset a student's password from inside the app (see
// /api/student-password) — there is nowhere to send a reset link.
//
// Runs with the SERVICE ROLE because creating an account is an admin
// operation. The only thing that authorises the call is the invite code, so it
// is checked properly: it must exist, must not have expired, and must be a
// STUDENT invite. Without that last check a leaked leader invite code would
// mint accounts, and the org is taken from the invite rather than the request
// body so a valid code for one church can't create a student in another.

import { createClient } from '@supabase/supabase-js';

interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

/**
 * Where the derived addresses live. No mail is ever sent to or from it, and it
 * needs no MX record; it exists so the addresses are unambiguously ours and
 * can never collide with somebody's real inbox.
 */
const STUDENT_EMAIL_DOMAIN = 'students.switchleaderapp.com';

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}

/** Under 13 today. Mirrors is_under_13() in migration 0077. */
function isUnder13(birthday: string): boolean {
  const b = new Date(`${birthday}T00:00:00Z`);
  if (Number.isNaN(b.getTime())) return true;
  const thirteenth = new Date(Date.UTC(b.getUTCFullYear() + 13, b.getUTCMonth(), b.getUTCDate()));
  return Date.now() < thirteenth.getTime();
}

/** Digits only, last ten. Mirrors normalize_phone() in migration 0064. */
function normalizePhone(raw: string): string | null {
  const d = (raw || '').replace(/[^0-9]/g, '');
  if (!d) return null;
  return d.length > 10 ? d.slice(-10) : d;
}

/**
 * The address for a phone number. Derived from the number alone, with no
 * church mixed in, because the sign-in page has only a phone number to work
 * from — it cannot know which Switch location someone belongs to before it has
 * signed them in. One phone number is therefore one account.
 */
export function studentEmail(phoneKey: string): string {
  return `s${phoneKey}@${STUDENT_EMAIL_DOMAIN}`;
}

export const onRequestPost = async (context: { request: Request; env: Env }): Promise<Response> => {
  const { request, env } = context;
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: 'Student sign-up is not configured on the server.' }, 500);
  }

  const body = (await request.json().catch(() => ({}))) as {
    code?: string; name?: string; gradYear?: number | string;
    birthday?: string; phone?: string; password?: string;
    parentName?: string; parentPhone?: string; parentEmail?: string;
  };

  // Lower-cased to match invite_info(), which looks codes up that way. A link
  // that works when the app checks it must work when the server checks it.
  const code = (body.code || '').trim().toLowerCase();
  const name = (body.name || '').trim();
  const password = body.password || '';
  const phoneRaw = (body.phone || '').trim();
  const birthday = (body.birthday || '').trim();
  const gradYear = Number(body.gradYear);

  if (!code) return json({ error: 'This sign-up link is missing its code. Ask your leader for a new one.' }, 400);
  if (name.length < 2) return json({ error: 'Please enter your first and last name.' }, 400);
  if (password.length < 8) return json({ error: 'Your password needs to be at least 8 characters.' }, 400);

  const phoneKey = normalizePhone(phoneRaw);
  if (!phoneKey || phoneKey.length < 10) {
    return json({ error: 'Please enter a full 10-digit phone number, like (555) 555-5555.' }, 400);
  }

  // A graduation year is what everything else is worked out from, so a typo
  // here quietly puts someone in the wrong group for years. Bound it to a
  // range a current student could actually have.
  const thisYear = new Date().getUTCFullYear();
  if (!Number.isInteger(gradYear) || gradYear < thisYear - 1 || gradYear > thisYear + 8) {
    return json({ error: 'Please choose your graduation year from the list.' }, 400);
  }
  // Required. It drives the birthday feature, and it is what decides whether
  // to ask for a parent's contact details.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthday)) {
    return json({ error: 'Please enter your birthday.' }, 400);
  }

  const under13 = isUnder13(birthday);
  const parentName = (body.parentName || '').trim();
  const parentPhone = (body.parentPhone || '').trim();
  const parentEmail = (body.parentEmail || '').trim();
  // Collected for under-13s so a leader has a way to reach a parent. This is
  // contact information, not permission — the in-app permission workflow was
  // removed in migration 0082 and is handled outside the app.
  if (under13) {
    if (parentName.length < 2) {
      return json({ error: 'Please enter a parent or guardian’s name.' }, 400);
    }
    if (!parentPhone && !parentEmail) {
      return json({ error: 'Please enter a phone number or email for your parent or guardian.' }, 400);
    }
  }

  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // --- the invite is the only thing authorising this, so check it fully ---
  const { data: invite, error: inviteErr } = await admin
    .from('invites')
    .select('org_id, role, expires_at')
    .eq('code', code)
    .maybeSingle();
  if (inviteErr) return json({ error: 'Could not check that sign-up link.' }, 500);
  if (!invite) return json({ error: 'That sign-up link isn’t valid. Ask your leader for a new one.' }, 400);
  if (invite.role !== 'student') {
    return json({ error: 'That link isn’t a student sign-up link.' }, 400);
  }
  if (invite.expires_at && new Date(invite.expires_at as string).getTime() < Date.now()) {
    return json({ error: 'That sign-up link has expired. Ask your leader for a new one.' }, 400);
  }
  const orgId = invite.org_id as string;

  // The link is meant to be sent to a whole group, so it is NOT consumed here.
  // A Youth Pastor revokes it when they want it to stop working.

  const email = studentEmail(phoneKey);

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    // Nothing can be sent to this address, so there is no confirmation step to
    // wait on. Without this the account would sit unconfirmed forever.
    email_confirm: true,
    user_metadata: {
      full_name: name,
      phone: phoneRaw,
      birthday,
      grad_year: gradYear,
      is_student: true,
    },
  });

  if (createErr || !created?.user) {
    const msg = (createErr?.message || '').toLowerCase();
    if (msg.includes('already') || msg.includes('registered') || msg.includes('exists')) {
      return json({
        error: 'That phone number already has an account. Try signing in instead — '
             + 'or ask your leader to reset your password.',
      }, 409);
    }
    return json({ error: createErr?.message || 'Could not create that account.' }, 500);
  }
  const uid = created.user.id;

  // From here on, a failure leaves a half-made account behind, so each step
  // cleans up after itself. A student who hit a network blip must be able to
  // try again rather than be permanently locked out by their own first attempt.
  const undo = async (message: string, status = 500) => {
    await admin.auth.admin.deleteUser(uid).catch(() => {});
    return json({ error: message }, status);
  };

  const { error: memErr } = await admin
    .from('memberships')
    .insert({ user_id: uid, org_id: orgId, role: 'student' });
  if (memErr) return undo('Could not finish setting up that account. Please try again.');

  const { error: profErr } = await admin.from('student_profiles').insert({
    user_id: uid,
    org_id: orgId,
    full_name: name,
    grad_year: gradYear,
    birthday,
    phone: phoneRaw,
    phone_key: phoneKey,
    parent_name: parentName || null,
    parent_phone: parentPhone || null,
    parent_email: parentEmail || null,
  });
  if (profErr) {
    // The unique index on (org_id, phone_key) is the likely cause: this phone
    // is already a student here.
    const dup = (profErr.message || '').toLowerCase().includes('duplicate');
    return undo(
      dup
        ? 'That phone number is already signed up here. Try signing in instead.'
        : 'Could not finish setting up that account. Please try again.',
      dup ? 409 : 500,
    );
  }

  // The app signs in with this; it is not something the student ever types.
  return json({ email });
};

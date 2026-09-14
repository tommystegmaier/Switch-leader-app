// Cloudflare Pages Function: POST /api/delete-student
//
// A Youth Pastor or Coach deletes a student's account for good.
//
// This matters more here than it would elsewhere, because a student account is
// keyed to their phone number: while the account exists that number is taken,
// so a student who left and came back could never sign up again. Deleting
// frees the number, and they re-join by using the same student sign-up link.
// That is the whole "remove and re-add" path — there is no separate re-add
// step to build, and nothing for a leader to remember.
//
// Everything of theirs goes with it. Their membership, roster rows, messages,
// reactions, votes and push subscriptions all reference auth.users with
// ON DELETE CASCADE, and student_profiles does too. For a minor that is the
// right default: if a family asks for a child's information to be removed,
// the answer should be that it is actually gone.
//
// Runs with the SERVICE ROLE, so the authorisation is the point:
//   - the caller's role is read from the database, never from the request;
//   - the org comes from the STUDENT's own record, so a Coach at one church
//     cannot aim this at a student somewhere else;
//   - the target must hold the student role. This cannot be pointed at the
//     Youth Pastor's account, or another Coach's.

import { createClient } from '@supabase/supabase-js';

interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}

export const onRequestPost = async (context: { request: Request; env: Env }): Promise<Response> => {
  const { request, env } = context;
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: 'Removing a student is not configured on the server.' }, 500);
  }

  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Not signed in.' }, 401);

  const body = (await request.json().catch(() => ({}))) as { userId?: string };
  const targetId = (body.userId || '').trim();
  if (!targetId) return json({ error: 'Which student?' }, 400);

  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) return json({ error: 'Not signed in.' }, 401);
  const callerId = userData.user.id;

  if (callerId === targetId) {
    // There is a separate route for deleting your own account, and it doesn't
    // require being a student.
    return json({ error: 'Use Delete my account in settings to remove your own.' }, 400);
  }

  const { data: student, error: studentErr } = await admin
    .from('student_profiles')
    .select('org_id, full_name')
    .eq('user_id', targetId)
    .maybeSingle();
  if (studentErr) return json({ error: 'Could not look that student up.' }, 500);
  if (!student) return json({ error: 'That isn’t a student account.' }, 404);

  const { data: caller, error: roleErr } = await admin
    .from('memberships')
    .select('role')
    .eq('org_id', student.org_id as string)
    .eq('user_id', callerId)
    .maybeSingle();
  if (roleErr) return json({ error: 'Could not check your access.' }, 500);
  if (!caller || !['owner', 'admin'].includes(caller.role as string)) {
    return json({ error: 'Only a Youth Pastor or Coach can remove a student.' }, 403);
  }

  // The target must actually hold the student role in that same org. A stale
  // student_profiles row left behind by a role change must not become a way to
  // delete a leader's account.
  const { data: target } = await admin
    .from('memberships')
    .select('role')
    .eq('org_id', student.org_id as string)
    .eq('user_id', targetId)
    .maybeSingle();
  if (!target || target.role !== 'student') {
    return json({ error: 'That isn’t a student account.' }, 403);
  }

  const { error: delErr } = await admin.auth.admin.deleteUser(targetId);
  if (delErr) return json({ error: delErr.message || 'Could not remove that student.' }, 500);

  return json({ ok: true, name: student.full_name });
};

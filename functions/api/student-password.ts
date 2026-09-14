// Cloudflare Pages Function: POST /api/student-password
//
// A Youth Pastor or Coach sets a new password for a student.
//
// This exists because a student account has no real email address behind it,
// so "forgot password" cannot send anyone anything. Somebody has to be able to
// hand a student their way back in, and in a youth ministry that somebody is
// the leader standing in front of them.
//
// Runs with the SERVICE ROLE, so the authorisation is the whole point:
//   - the caller's access token is verified, and their role is read from the
//     database rather than taken from the request;
//   - the org is read from the STUDENT's own record, so a Coach at one church
//     cannot aim this at a student somewhere else;
//   - the target must actually be a student. A Coach cannot use this to take
//     over the Youth Pastor's account, or another Coach's.

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
    return json({ error: 'Password reset is not configured on the server.' }, 500);
  }

  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Not signed in.' }, 401);

  const body = (await request.json().catch(() => ({}))) as { userId?: string; password?: string };
  const targetId = (body.userId || '').trim();
  const password = body.password || '';
  if (!targetId) return json({ error: 'Which student?' }, 400);
  if (password.length < 8) return json({ error: 'The new password needs to be at least 8 characters.' }, 400);

  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) return json({ error: 'Not signed in.' }, 401);
  const callerId = userData.user.id;

  // Which church is this student in? Taken from their record, never the request.
  const { data: student, error: studentErr } = await admin
    .from('student_profiles')
    .select('org_id, full_name')
    .eq('user_id', targetId)
    .maybeSingle();
  if (studentErr) return json({ error: 'Could not look that student up.' }, 500);
  if (!student) return json({ error: 'That isn’t a student account.' }, 404);

  // Is the caller a Youth Pastor or Coach *of that same church*?
  const { data: callerMembership, error: roleErr } = await admin
    .from('memberships')
    .select('role')
    .eq('org_id', student.org_id as string)
    .eq('user_id', callerId)
    .maybeSingle();
  if (roleErr) return json({ error: 'Could not check your access.' }, 500);
  if (!callerMembership || !['owner', 'admin'].includes(callerMembership.role as string)) {
    return json({ error: 'Only a Youth Pastor or Coach can reset a student’s password.' }, 403);
  }

  // Belt and braces: the target must hold the student role in that same org.
  // student_profiles alone would be enough today, but a stale row left behind
  // by a role change should not become a way to seize a leader's account.
  const { data: targetMembership } = await admin
    .from('memberships')
    .select('role')
    .eq('org_id', student.org_id as string)
    .eq('user_id', targetId)
    .maybeSingle();
  if (!targetMembership || targetMembership.role !== 'student') {
    return json({ error: 'That isn’t a student account.' }, 403);
  }

  const { error: updErr } = await admin.auth.admin.updateUserById(targetId, { password });
  if (updErr) return json({ error: updErr.message || 'Could not set that password.' }, 500);

  return json({ ok: true, name: student.full_name });
};

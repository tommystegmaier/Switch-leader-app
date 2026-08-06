// Cloudflare Pages Function: POST /api/platform-user
//
// Platform-admin only: disable ("ban") or re-enable a user account, cutting off
// (or restoring) their access to the whole platform. Uses the service-role
// Supabase Auth admin API. The caller's token is verified AND checked against
// the platform_admins allowlist before anything happens. A platform admin can
// never disable themselves or another platform admin (avoids lockout).

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
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: 'Not configured.' }, 500);

  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Not signed in.' }, 401);

  let payload: { userId?: string; disable?: boolean };
  try { payload = await request.json(); } catch { return json({ error: 'Bad request.' }, 400); }
  const { userId, disable } = payload;
  if (!userId || typeof disable !== 'boolean') return json({ error: 'Missing user or action.' }, 400);

  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Who is calling, and are they a platform admin?
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) return json({ error: 'Not signed in.' }, 401);
  const callerId = userData.user.id;

  const { data: callerAdmin } = await admin.from('platform_admins').select('user_id').eq('user_id', callerId).maybeSingle();
  if (!callerAdmin) return json({ error: 'Not authorized.' }, 403);

  // Never disable yourself or another platform admin.
  if (userId === callerId) return json({ error: 'You can’t disable your own account.' }, 400);
  const { data: targetAdmin } = await admin.from('platform_admins').select('user_id').eq('user_id', userId).maybeSingle();
  if (targetAdmin) return json({ error: 'That account is a platform admin and can’t be disabled here.' }, 400);

  // Ban for ~100 years (effectively permanent) or lift the ban.
  const ban_duration = disable ? '876000h' : 'none';
  const { error } = await admin.auth.admin.updateUserById(userId, { ban_duration });
  if (error) return json({ error: error.message }, 500);

  return json({ ok: true, disabled: disable });
};

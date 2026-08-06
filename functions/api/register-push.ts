// Cloudflare Pages Function: POST /api/register-push
//
// Saves (or updates) this device's Web Push subscription for a workspace,
// linked to the signed-in user. The browser sends its subscription here with
// the user's access token; we verify the token and write the row with the
// SERVICE ROLE key, which bypasses row-level security entirely. That sidesteps
// the RLS pitfalls that blocked the client from writing push_subscriptions
// directly, and it's more secure: the user_id is taken from the verified token,
// never trusted from the client, so nobody can register a device under someone
// else's account.

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
    return json({ error: 'Notifications are not configured on the server.' }, 500);
  }

  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Not signed in.' }, 401);

  let payload: { orgId?: string; subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } } };
  try { payload = await request.json(); } catch { return json({ error: 'Bad request.' }, 400); }
  const { orgId, subscription } = payload;
  const endpoint = subscription?.endpoint;
  const p256dh = subscription?.keys?.p256dh;
  const auth = subscription?.keys?.auth;
  if (!orgId || !endpoint || !p256dh || !auth) return json({ error: 'Missing subscription details.' }, 400);

  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) return json({ error: 'Not signed in.' }, 401);
  const uid = userData.user.id;

  // Upsert on the endpoint (a device keeps the same endpoint across
  // re-subscribes), rewriting the row with the current user_id.
  const { error } = await admin
    .from('push_subscriptions')
    .upsert({ org_id: orgId, endpoint, p256dh, auth, user_id: uid }, { onConflict: 'endpoint' });
  if (error) {
    return json({ error: error.message || 'Could not save subscription.' }, 500);
  }

  return json({ ok: true });
};

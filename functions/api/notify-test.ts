// Cloudflare Pages Function: POST /api/notify-test
//
// A self-test: sends a push to the CALLER'S OWN devices for a workspace. This
// is the missing diagnostic — a normal chat message never notifies its own
// sender (like iMessage), so testing by messaging yourself always looks
// "broken." This endpoint deliberately DOES target you, so you can prove the
// whole pipe (subscription → VAPID → Apple/Google → your locked phone) works.
//
// It also reports how healthy the workspace's subscriptions are, which tells us
// whether the real problem is delivery or targeting.

import { createClient } from '@supabase/supabase-js';
import { buildPushPayload } from '@block65/webcrypto-web-push';

interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
  VAPID_SUBJECT?: string;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}

export const onRequestPost = async (context: { request: Request; env: Env }): Promise<Response> => {
  const { request, env } = context;
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.VAPID_PRIVATE_KEY) {
    return json({ error: 'Notifications are not configured on the server.' }, 500);
  }

  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Not signed in.' }, 401);

  let payload: { orgId?: string };
  try { payload = await request.json(); } catch { return json({ error: 'Bad request.' }, 400); }
  const { orgId } = payload;
  if (!orgId) return json({ error: 'Missing workspace.' }, 400);

  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) return json({ error: 'Not signed in.' }, 401);
  const uid = userData.user.id;

  // Is the caller a manager? Managers get the workspace-wide health numbers.
  const { data: membership } = await admin
    .from('memberships').select('role').eq('org_id', orgId).eq('user_id', uid).maybeSingle();
  const isManager = membership && ['owner', 'admin', 'editor'].includes(membership.role);

  // Workspace subscription health (helps diagnose targeting problems).
  const { data: orgSubs } = await admin
    .from('push_subscriptions').select('user_id').eq('org_id', orgId);
  const orgTotal = (orgSubs ?? []).length;
  const orgWithUser = (orgSubs ?? []).filter((s: { user_id: string | null }) => s.user_id).length;

  // The caller's OWN devices in this workspace.
  const { data: mySubs } = await admin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('org_id', orgId)
    .eq('user_id', uid);
  const myDevices = (mySubs ?? []).length;

  const vapid = {
    subject: env.VAPID_SUBJECT || 'mailto:notify@example.com',
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
  };
  const data = {
    title: 'Test notification ✅',
    body: 'If you can see this on your phone, notifications are working!',
    url: '/',
  };

  let sent = 0;
  await Promise.all(
    (mySubs ?? []).map(async (s: { endpoint: string; p256dh: string; auth: string }) => {
      const subscription = { endpoint: s.endpoint, expirationTime: null, keys: { p256dh: s.p256dh, auth: s.auth } };
      try {
        const req = await buildPushPayload({ data, options: { ttl: 3600 } }, subscription, vapid);
        const res = await fetch(s.endpoint, { method: req.method, headers: req.headers, body: req.body });
        if (res.status === 404 || res.status === 410) {
          await admin.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
        } else if (res.ok) {
          sent += 1;
        }
      } catch { /* skip one bad endpoint */ }
    }),
  );

  return json({
    sent,
    myDevices,
    ...(isManager ? { orgTotal, orgWithUser, orgMissingUser: orgTotal - orgWithUser } : {}),
  });
};

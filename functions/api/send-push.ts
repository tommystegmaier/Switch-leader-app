// Cloudflare Pages Function: POST /api/send-push
//
// Broadcasts a push notification to every device subscribed to a workspace.
// Deploys automatically with the Pages project (no separate service).
//
// Auth: the caller sends their Supabase access token (Bearer). We verify they
// are an owner/admin/editor of the workspace before sending. Reads of the
// subscription table use the SERVICE ROLE key (server-only secret).
//
// Required Pages environment variables (Settings → Variables and secrets):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (e.g. mailto:you@church.org)

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
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export const onRequestPost = async (context: { request: Request; env: Env }): Promise<Response> => {
  const { request, env } = context;

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.VAPID_PRIVATE_KEY) {
    return json({ error: 'Notifications are not configured on the server.' }, 500);
  }

  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Not signed in.' }, 401);

  let payload: { orgId?: string; title?: string; message?: string; url?: string };
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Bad request.' }, 400);
  }
  const { orgId, title, message, url } = payload;
  if (!orgId || !title) return json({ error: 'Missing workspace or title.' }, 400);

  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Verify the caller and their role in this workspace.
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) return json({ error: 'Not signed in.' }, 401);
  const { data: membership } = await admin
    .from('memberships')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', userData.user.id)
    .maybeSingle();
  if (!membership || !['owner', 'admin', 'editor'].includes(membership.role)) {
    return json({ error: 'You do not have permission to send notifications for this workspace.' }, 403);
  }

  const { data: subs, error: subErr } = await admin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('org_id', orgId);
  if (subErr) return json({ error: subErr.message }, 500);

  const vapid = {
    subject: env.VAPID_SUBJECT || 'mailto:notify@example.com',
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
  };
  const data = { title, body: message || '', url: url || '/' };

  let sent = 0;
  let removed = 0;
  await Promise.all(
    (subs || []).map(async (s: { endpoint: string; p256dh: string; auth: string }) => {
      const subscription = {
        endpoint: s.endpoint,
        expirationTime: null,
        keys: { p256dh: s.p256dh, auth: s.auth },
      };
      try {
        const req = await buildPushPayload({ data, options: { ttl: 3600 } }, subscription, vapid);
        const res = await fetch(s.endpoint, { method: req.method, headers: req.headers, body: req.body });
        if (res.status === 404 || res.status === 410) {
          // Subscription expired/invalid — clean it up.
          await admin.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
          removed += 1;
        } else if (res.ok) {
          sent += 1;
        }
      } catch {
        /* skip a single failed endpoint */
      }
    }),
  );

  return json({ sent, removed, total: (subs || []).length });
};

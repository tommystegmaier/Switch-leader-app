// Cloudflare Pages Function: POST /api/notify-roster
//
// A manager posts the weekly schedule and notifies every volunteer who is on
// the roster ("you're scheduled — confirm or decline"). Verifies the caller is
// a manager (owner/admin/editor), then sends a push to the devices of everyone
// currently on the roster. Reuses the same VAPID / service-role setup.

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

  let payload: { orgId?: string; title?: string; message?: string; url?: string };
  try { payload = await request.json(); } catch { return json({ error: 'Bad request.' }, 400); }
  const { orgId, title, message, url } = payload;
  if (!orgId || !title) return json({ error: 'Missing workspace or title.' }, 400);

  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) return json({ error: 'Not signed in.' }, 401);

  const { data: membership } = await admin
    .from('memberships')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', userData.user.id)
    .maybeSingle();
  if (!membership || !['owner', 'admin', 'editor'].includes(membership.role)) {
    return json({ error: 'You do not have permission to send this.' }, 403);
  }

  // Everyone currently on the roster.
  const { data: roster } = await admin.from('schedule_roster').select('user_id').eq('org_id', orgId);
  const rosterIds = [...new Set((roster ?? []).map((r: { user_id: string }) => r.user_id))];
  if (rosterIds.length === 0) return json({ sent: 0, total: 0 });

  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('org_id', orgId)
    .in('user_id', rosterIds);

  const vapid = {
    subject: env.VAPID_SUBJECT || 'mailto:notify@example.com',
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
  };
  const data = { title, body: message || '', url: url || '/' };

  let sent = 0;
  await Promise.all(
    (subs || []).map(async (s: { endpoint: string; p256dh: string; auth: string }) => {
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

  return json({ sent, total: (subs || []).length });
};

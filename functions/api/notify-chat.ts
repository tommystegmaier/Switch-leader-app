// Cloudflare Pages Function: POST /api/notify-chat
//
// When someone posts a group-chat message, push a notification to the OTHER
// people assigned to that Roster group (only). This is separate from the
// owner's main broadcast. Verifies the caller actually authored the message,
// then sends to the group's members minus the sender. Reuses the VAPID /
// service-role setup shared with the other notify functions.

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

  let payload: { orgId?: string; groupId?: string; messageId?: string; url?: string };
  try { payload = await request.json(); } catch { return json({ error: 'Bad request.' }, 400); }
  const { orgId, groupId, messageId, url } = payload;
  if (!orgId || !groupId || !messageId) return json({ error: 'Missing message.' }, 400);

  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) return json({ error: 'Not signed in.' }, 401);
  const senderId = userData.user.id;

  // The message must exist, be in this org/group, and belong to the caller.
  const { data: msg } = await admin
    .from('chat_messages')
    .select('org_id, group_id, user_id, author_name, body, image_url, video_url')
    .eq('id', messageId)
    .maybeSingle();
  if (!msg || msg.org_id !== orgId || msg.group_id !== groupId || msg.user_id !== senderId) {
    return json({ error: 'Message not found.' }, 403);
  }

  const { data: grp } = await admin.from('roster_groups').select('name, auto_role').eq('id', groupId).maybeSingle();
  const groupName = (grp?.name as string) || 'Group chat';

  // Recipients: an auto group (e.g. Coaches) = everyone in the org with that
  // title; a normal group = its assigned people. Minus the sender and anyone
  // who muted this channel.
  const peopleQuery = grp?.auto_role
    ? admin.from('roster_people').select('user_id').eq('org_id', orgId).eq('role', grp.auto_role).not('user_id', 'is', null)
    : admin.from('roster_people').select('user_id').eq('group_id', groupId).not('user_id', 'is', null);
  const { data: people } = await peopleQuery;
  const { data: muted } = await admin.from('chat_mutes').select('user_id').eq('group_id', groupId);
  const mutedSet = new Set((muted ?? []).map((m: { user_id: string }) => m.user_id));
  const recipientIds = [...new Set((people ?? []).map((p: { user_id: string }) => p.user_id))]
    .filter((id) => id && id !== senderId && !mutedSet.has(id));
  if (recipientIds.length === 0) return json({ sent: 0, total: 0 });

  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('org_id', orgId)
    .in('user_id', recipientIds);

  const snippet = (msg.body as string | null)?.trim()
    || (msg.video_url ? '🎥 Video' : msg.image_url ? '📷 Photo' : 'New message');
  const author = (msg.author_name as string | null) || 'Someone';
  const data = {
    title: groupName,
    body: `${author}: ${snippet.length > 140 ? snippet.slice(0, 140) + '…' : snippet}`,
    url: url || '/',
  };

  const vapid = {
    subject: env.VAPID_SUBJECT || 'mailto:notify@example.com',
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
  };

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

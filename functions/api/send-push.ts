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

  let payload: { orgId?: string; title?: string; message?: string; url?: string; offset?: number };
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Bad request.' }, 400);
  }
  const { orgId, title, message, url } = payload;
  const offset = Math.max(0, Number(payload.offset) || 0);
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

  // How many devices this invocation will handle.
  //
  // A Cloudflare Function is capped on how many outbound requests it may make,
  // and every device is one. Sending to 104 people in a single call blew
  // straight through that ceiling, which is why a broadcast reported reaching
  // nobody: the sends weren't refused by Apple or Google, they never left. So
  // the work is sliced, and the browser walks through the slices.
  const BATCH = 30;

  const { count: total, error: countErr } = await admin
    .from('push_subscriptions')
    .select('endpoint', { count: 'exact', head: true })
    .eq('org_id', orgId);
  if (countErr) return json({ error: countErr.message }, 500);

  const { data: subs, error: subErr } = await admin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth, user_id')
    .eq('org_id', orgId)
    .order('endpoint')          // stable order, so slices don't overlap or skip
    .range(offset, offset + BATCH - 1);
  if (subErr) return json({ error: subErr.message }, 500);

  // Work out the number to put on each person's app icon.
  //
  // This announcement has to be ADDED to whatever they already had unread,
  // not replace it: someone sitting on three unread messages who then gets a
  // broadcast should see four, not one. Sending no number at all — which is
  // what this did before — left the service worker calling setAppBadge() with
  // no argument, and iOS doesn't render that dot form, so a broadcast produced
  // no badge whatsoever while a chat message produced one.
  // ONE call for the whole batch. Asking per-person cost a round trip each,
  // which on its own could exhaust the request budget before any notification
  // was sent.
  const recipients = [...new Set((subs || []).map((s: { user_id: string | null }) => s.user_id).filter(Boolean))] as string[];
  const badges = new Map<string, number>();
  if (recipients.length > 0) {
    try {
      const { data: rows } = await admin.rpc('chat_unread_totals_for', { p_org: orgId, p_users: recipients });
      for (const r of (rows ?? []) as { user_id: string; total: number }[]) {
        badges.set(r.user_id, (r.total ?? 0) + 1);
      }
    } catch { /* fall back to the announcement on its own */ }
  }

  const vapid = {
    subject: env.VAPID_SUBJECT || 'mailto:notify@example.com',
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
  };
  const base = { title, body: message || '', url: url || '/' };

  let sent = 0;
  let removed = 0;
  // Why sends failed, counted by reason. Without this a broadcast could report
  // reaching nobody and give no clue whether that was bad keys, a rejection
  // upstream, or requests that never got made — which is exactly the hole this
  // was debugged in.
  const failures: Record<string, number> = {};
  const note = (reason: string) => { failures[reason] = (failures[reason] ?? 0) + 1; };
  await Promise.all(
    (subs || []).map(async (s: { endpoint: string; p256dh: string; auth: string; user_id: string | null }) => {
      const subscription = {
        endpoint: s.endpoint,
        expirationTime: null,
        keys: { p256dh: s.p256dh, auth: s.auth },
      };
      // A device we never linked to an account (an old subscription) still
      // gets a badge — just the announcement's own 1, since there's no unread
      // count to add it to.
      const data = { ...base, badge: (s.user_id && badges.get(s.user_id)) || 1 };
      try {
        const req = await buildPushPayload({ data, options: { ttl: 3600 } }, subscription, vapid);
        const res = await fetch(s.endpoint, { method: req.method, headers: req.headers, body: req.body });
        if (res.status === 404 || res.status === 410) {
          // Subscription expired/invalid — clean it up.
          await admin.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
          removed += 1;
        } else if (res.ok) {
          sent += 1;
        } else {
          note(`http_${res.status}`);
        }
      } catch (e) {
        note(e instanceof Error ? e.message.slice(0, 80) : 'unknown');
      }
    }),
  );

  const done = offset + (subs || []).length;
  return json({
    sent,
    removed,
    failures,
    batch: (subs || []).length,
    total: total ?? done,
    // Present until every device has been attempted; the caller keeps going.
    nextOffset: done < (total ?? done) ? done : null,
  });
};

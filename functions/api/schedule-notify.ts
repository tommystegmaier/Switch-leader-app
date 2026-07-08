// Cloudflare Pages Function: POST /api/schedule-notify
//
// Called (best-effort) right after a volunteer confirms/declines an assignment.
// Verifies the caller is the assignee, then push-notifies every manager
// (owner/admin/editor) of the workspace who hasn't muted schedule notifications.
//
// Reuses the same VAPID / service-role setup as /api/send-push.

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

  let body: { assignmentId?: string };
  try { body = await request.json(); } catch { return json({ error: 'Bad request.' }, 400); }
  const { assignmentId } = body;
  if (!assignmentId) return json({ error: 'Missing assignment.' }, 400);

  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) return json({ error: 'Not signed in.' }, 401);
  const caller = userData.user;

  // Load the assignment; only the assignee may trigger this.
  const { data: a } = await admin
    .from('schedule_assignments')
    .select('id, org_id, role_id, user_id, status, serve_date')
    .eq('id', assignmentId)
    .maybeSingle();
  if (!a) return json({ error: 'Assignment not found.' }, 404);
  if (a.user_id !== caller.id) return json({ error: 'Not your assignment.' }, 403);

  // Role + team names for the message.
  const { data: role } = await admin.from('schedule_roles').select('name, team_id').eq('id', a.role_id).maybeSingle();
  let teamName = '';
  if (role?.team_id) {
    const { data: team } = await admin.from('schedule_teams').select('name').eq('id', role.team_id).maybeSingle();
    teamName = team?.name ?? '';
  }
  const { data: org } = await admin.from('organizations').select('slug').eq('id', a.org_id).maybeSingle();

  const responderName =
    (caller.user_metadata?.full_name as string | undefined) ||
    (caller.user_metadata?.name as string | undefined) ||
    caller.email ||
    'A volunteer';
  const verb = a.status === 'confirmed' ? 'confirmed' : a.status === 'declined' ? 'declined' : 'updated';

  // Managers of this workspace, minus anyone who muted, minus the responder.
  const { data: managers } = await admin
    .from('memberships')
    .select('user_id, role')
    .eq('org_id', a.org_id)
    .in('role', ['owner', 'admin', 'editor']);
  const { data: mutes } = await admin.from('schedule_mute').select('user_id').eq('org_id', a.org_id);
  const mutedSet = new Set((mutes ?? []).map((m: { user_id: string }) => m.user_id));
  const recipientIds = (managers ?? [])
    .map((m: { user_id: string }) => m.user_id)
    .filter((id: string) => id !== caller.id && !mutedSet.has(id));

  if (recipientIds.length === 0) return json({ notified: 0 });

  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('org_id', a.org_id)
    .in('user_id', recipientIds);

  const vapid = {
    subject: env.VAPID_SUBJECT || 'mailto:notify@example.com',
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
  };
  const roleLabel = [teamName, role?.name].filter(Boolean).join(' · ') || 'their role';
  const data = {
    title: `${responderName} ${verb}`,
    body: `${roleLabel} — ${a.serve_date}`,
    url: org?.slug ? `/o/${org.slug}` : '/',
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

  return json({ notified: sent });
};

// Cloudflare Pages Function: POST /api/birthday-cron
//
// A scheduled sweep (call it every ~30 min from pg_cron or an external cron).
// For each workspace with birthday alerts on, once its chosen local time has
// passed for the day, it pushes "🎂 birthdays today" to the managers and marks
// the day done. Protected by a shared secret header so only the scheduler can
// trigger it.

import { createClient } from '@supabase/supabase-js';
import { buildPushPayload } from '@block65/webcrypto-web-push';

interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
  VAPID_SUBJECT?: string;
  CRON_SECRET?: string;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}

/** Local YYYY-MM-DD and HH:MM in a given IANA timezone. */
function localParts(tz: string): { date: string; hm: string } {
  try {
    const p = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).formatToParts(new Date());
    const get = (t: string) => p.find((x) => x.type === t)?.value ?? '';
    let hour = get('hour'); if (hour === '24') hour = '00';
    return { date: `${get('year')}-${get('month')}-${get('day')}`, hm: `${hour}:${get('minute')}` };
  } catch {
    const d = new Date();
    return { date: d.toISOString().slice(0, 10), hm: d.toISOString().slice(11, 16) };
  }
}

export const onRequestPost = async (context: { request: Request; env: Env }): Promise<Response> => {
  const { request, env } = context;
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.VAPID_PRIVATE_KEY) {
    return json({ error: 'Not configured.' }, 500);
  }
  if (env.CRON_SECRET && request.headers.get('x-cron-secret') !== env.CRON_SECRET) {
    return json({ error: 'Forbidden.' }, 403);
  }

  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const vapid = {
    subject: env.VAPID_SUBJECT || 'mailto:notify@example.com',
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
  };

  const { data: configs } = await admin.from('birthday_config').select('*').eq('enabled', true);
  let orgsSent = 0;

  for (const cfg of configs ?? []) {
    const { date, hm } = localParts(cfg.timezone || 'UTC');
    if (cfg.last_sent_on === date) continue;         // already handled today
    if (hm < (cfg.notify_time || '08:00')) continue; // not time yet

    // Who has a birthday today (this workspace, this tz's date)?
    const mmdd = date.slice(5);
    const { data: people } = await admin.rpc('org_birthdays_all', { p_org: cfg.org_id });
    const todays = (people ?? [])
      .filter((p: { birthday: string }) => (p.birthday || '').slice(5) === mmdd)
      .map((p: { name: string | null }) => p.name || 'A teammate');

    // Mark the day done regardless, so we don't recheck all day.
    await admin.from('birthday_config').update({ last_sent_on: date }).eq('org_id', cfg.org_id);
    if (todays.length === 0) continue;

    const { data: managers } = await admin
      .from('memberships').select('user_id').eq('org_id', cfg.org_id).in('role', ['owner', 'admin', 'editor']);
    const ids = [...new Set((managers ?? []).map((m: { user_id: string }) => m.user_id))];
    if (ids.length === 0) continue;

    const { data: subs } = await admin
      .from('push_subscriptions').select('endpoint, p256dh, auth').eq('org_id', cfg.org_id).in('user_id', ids);
    const { data: org } = await admin.from('organizations').select('slug').eq('id', cfg.org_id).maybeSingle();

    const data = {
      title: todays.length === 1 ? `🎂 ${todays[0]}'s birthday today` : `🎂 ${todays.length} birthdays today`,
      body: todays.join(', '),
      url: org?.slug ? `/o/${org.slug}` : '/',
    };
    await Promise.all((subs ?? []).map(async (s: { endpoint: string; p256dh: string; auth: string }) => {
      const subscription = { endpoint: s.endpoint, expirationTime: null, keys: { p256dh: s.p256dh, auth: s.auth } };
      try {
        const req = await buildPushPayload({ data, options: { ttl: 3600 } }, subscription, vapid);
        const res = await fetch(s.endpoint, { method: req.method, headers: req.headers, body: req.body });
        if (res.status === 404 || res.status === 410) await admin.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
      } catch { /* skip */ }
    }));
    orgsSent += 1;
  }

  return json({ orgsSent });
};

// Cloudflare Pages Function: POST /api/media-cleanup
//
// Scheduled sweep (call once a day from cron). Removes old chat media so the
// app's storage doesn't pile up as more photos/audio/videos/gifs get shared:
//   • videos  older than 14 days  (legacy — no longer sent, but old ones expire)
//   • gifs    older than 30 days
//   • audio   older than 30 days
//   • photos  older than 60 days
// For uploaded media (photos + audio + videos) it also deletes the underlying
// file in Supabase Storage to actually reclaim space; gifs are hotlinked from
// GIPHY so only the message is removed. Protected by a shared secret header.

import { createClient } from '@supabase/supabase-js';

interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  CRON_SECRET?: string;
}

const BUCKET = 'media';
const PUBLIC_MARKER = `/storage/v1/object/public/${BUCKET}/`;

const WINDOWS: { kind: string; days: number }[] = [
  { kind: 'video', days: 14 },
  { kind: 'gif', days: 30 },
  { kind: 'audio', days: 30 },
  { kind: 'photo', days: 60 },
];

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}

/** The path inside the `media` bucket for one of our public URLs, or null. */
function bucketPath(url: string | null): string | null {
  if (!url) return null;
  const i = url.indexOf(PUBLIC_MARKER);
  return i === -1 ? null : decodeURIComponent(url.slice(i + PUBLIC_MARKER.length));
}

export const onRequestPost = async (context: { request: Request; env: Env }): Promise<Response> => {
  const { request, env } = context;
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: 'Not configured.' }, 500);
  if (env.CRON_SECRET && request.headers.get('x-cron-secret') !== env.CRON_SECRET) {
    return json({ error: 'Forbidden.' }, 403);
  }

  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const now = Date.now();
  const result: Record<string, number> = {};

  for (const { kind, days } of WINDOWS) {
    const cutoff = new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
    // Page through matches so a big backlog gets cleared over successive runs.
    const { data: rows } = await admin
      .from('chat_messages')
      .select('id, image_url, video_url, audio_url')
      .eq('media_kind', kind)
      .lt('created_at', cutoff)
      .limit(500);

    const list = rows ?? [];
    if (list.length === 0) { result[kind] = 0; continue; }

    // Delete the underlying storage files (photos + audio + videos we host).
    const paths = list
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((r: any) => bucketPath(r.video_url) || bucketPath(r.audio_url) || bucketPath(r.image_url))
      .filter((p): p is string => Boolean(p));
    if (paths.length > 0) {
      try { await admin.storage.from(BUCKET).remove(paths); } catch { /* keep going */ }
    }

    // Remove the messages (reactions / poll votes cascade off the FK).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ids = list.map((r: any) => r.id);
    await admin.from('chat_messages').delete().in('id', ids);
    result[kind] = ids.length;
  }

  return json({ removed: result });
};

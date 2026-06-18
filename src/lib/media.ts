import { getSupabase } from './supabase';

/**
 * Media (images, logos, app icons, PDFs) in Supabase Storage.
 *
 * Objects are pathed under the org id (`{orgId}/…`), which the storage RLS
 * policies require for writes (editor+ only). The `media` bucket is public-read
 * (migration 0004), so we return stable public URLs that the viewer renders
 * directly. Uploading/replacing a file instantly changes what all viewers see.
 */

const BUCKET = 'media';

export interface MediaObject {
  name: string; // full path within the bucket, e.g. "{orgId}/123-file.png"
  url: string; // public URL
  updatedAt?: string;
}

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
}

export async function uploadMedia(orgId: string, file: File): Promise<MediaObject> {
  const s = getSupabase();
  if (!s) throw new Error('Uploads require a configured Supabase backend.');
  const path = `${orgId}/${Date.now()}-${sanitizeName(file.name)}`;
  const { error } = await s.storage.from(BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || undefined,
  });
  if (error) throw error;
  const { data } = s.storage.from(BUCKET).getPublicUrl(path);
  return { name: path, url: data.publicUrl };
}

/** List media uploaded under a workspace, newest first. */
export async function listMedia(orgId: string): Promise<MediaObject[]> {
  const s = getSupabase();
  if (!s) return [];
  const { data, error } = await s.storage.from(BUCKET).list(orgId, {
    sortBy: { column: 'created_at', order: 'desc' },
    limit: 100,
  });
  if (error) throw error;
  return (data ?? [])
    .filter((o) => o.name && o.id) // skip folder placeholders
    .map((o) => {
      const path = `${orgId}/${o.name}`;
      const { data: pub } = s.storage.from(BUCKET).getPublicUrl(path);
      return { name: path, url: pub.publicUrl, updatedAt: o.updated_at ?? undefined };
    });
}

export async function deleteMedia(path: string): Promise<void> {
  const s = getSupabase();
  if (!s) return;
  const { error } = await s.storage.from(BUCKET).remove([path]);
  if (error) throw error;
}

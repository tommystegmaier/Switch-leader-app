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

/**
 * Downscale + re-encode a photo before upload so it doesn't eat storage.
 *
 * Phone photos are often 3–8 MB. We draw the image onto a canvas capped at
 * `maxDim` on its longest side and re-encode as JPEG at ~0.8 quality, which
 * typically lands under a few hundred KB with no visible loss on a phone
 * screen. Only touches raster photos — GIFs (animation would be flattened),
 * SVGs, and non-images are returned unchanged. Best-effort: if anything fails
 * (unreadable image, no canvas), the original file is returned.
 */
export async function compressImage(file: File, maxDim = 1600, quality = 0.8): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.type === 'image/svg+xml') {
    return file;
  }
  try {
    const url = URL.createObjectURL(file);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('decode failed'));
      el.src = url;
    });
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const cx = canvas.getContext('2d');
    if (!cx) { URL.revokeObjectURL(url); return file; }
    cx.drawImage(img, 0, 0, w, h);
    URL.revokeObjectURL(url);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob || blob.size >= file.size) return file; // no win — keep the original
    const base = file.name.replace(/\.[^.]+$/, '');
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg' });
  } catch {
    return file;
  }
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

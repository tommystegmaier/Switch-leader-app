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

/**
 * Convert a recording to 16 kHz mono WAV.
 *
 * Why: what MediaRecorder produces varies by device (iOS gives an MP4/AAC
 * container, Chrome gives WebM/Opus), and each platform refuses to play some of
 * the others — iOS Safari in particular often can't play back its OWN recording
 * from a plain URL, which showed up as "Error" in the player. WAV is plain PCM
 * that every browser decodes, so a note recorded anywhere plays everywhere.
 *
 * 16 kHz mono is voice-grade: clear speech at ~32 KB/s (≈2 MB/minute), which is
 * still far smaller than video and well under the upload cap.
 *
 * Best-effort: if decoding fails we return the original recording unchanged.
 */
export async function toWavFile(blob: Blob, baseName = 'voice'): Promise<File> {
  const AC: typeof AudioContext | undefined =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  const OAC: typeof OfflineAudioContext | undefined =
    window.OfflineAudioContext ?? (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  if (!AC || !OAC) return new File([blob], `${baseName}.webm`, { type: blob.type || 'audio/webm' });

  try {
    const bytes = await blob.arrayBuffer();
    const ctx = new AC();
    // Safari only reliably supports the callback form of decodeAudioData.
    const decoded = await new Promise<AudioBuffer>((resolve, reject) => {
      const p = ctx.decodeAudioData(bytes, resolve, reject) as unknown as Promise<AudioBuffer> | undefined;
      if (p && typeof p.then === 'function') p.then(resolve, reject);
    });
    void ctx.close();

    const rate = 16000;
    const frames = Math.max(1, Math.ceil(decoded.duration * rate));
    const off = new OAC(1, frames, rate); // 1 channel → mono downmix
    const src = off.createBufferSource();
    src.buffer = decoded;
    src.connect(off.destination);
    src.start();
    const rendered = await off.startRendering();
    return new File([encodeWav(rendered.getChannelData(0), rate)], `${baseName}.wav`, { type: 'audio/wav' });
  } catch {
    // Couldn't decode — send what we recorded rather than losing the message.
    const ext = (blob.type || '').includes('mp4') ? 'm4a' : (blob.type || '').includes('ogg') ? 'ogg' : 'webm';
    return new File([blob], `${baseName}.${ext}`, { type: blob.type || 'audio/webm' });
  }
}

/** 16-bit PCM WAV from mono float samples. */
function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const text = (at: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(at + i, s.charCodeAt(i)); };
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);       // PCM chunk size
  view.setUint16(20, 1, true);        // format: PCM
  view.setUint16(22, 1, true);        // channels: mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true);        // block align
  view.setUint16(34, 16, true);       // bits per sample
  text(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  let at = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(at, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    at += 2;
  }
  return new Blob([view], { type: 'audio/wav' });
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

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
 * Record microphone audio as raw PCM and write a WAV ourselves.
 *
 * Why not MediaRecorder: what it produces depends on the device (iOS gives an
 * MP4/AAC container, Chrome gives WebM/Opus) and platforms refuse each other's
 * output — iOS Safari often can't even play back, or decode, its OWN recording,
 * which is what surfaced as "Error" in the player. Capturing samples straight
 * off the audio graph skips containers and codecs completely, so the file is
 * always a plain WAV every browser can play.
 *
 * 16 kHz mono is voice-grade: ~32 KB/s (≈2 MB/minute).
 */
export interface PcmRecorder { stop: () => Promise<File> }

/**
 * Create + resume an AudioContext. MUST be called synchronously inside the tap
 * that starts recording: iOS refuses to start a context once the user gesture
 * has expired (e.g. after awaiting the mic permission prompt), and a suspended
 * context never fires onaudioprocess — which silently produced empty
 * recordings.
 */
export function createAudioContext(): AudioContext {
  const AC: typeof AudioContext =
    window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AC();
  void ctx.resume().catch(() => { /* best effort */ });
  return ctx;
}

export async function startPcmRecorder(stream: MediaStream, baseName = 'voice', existing?: AudioContext): Promise<PcmRecorder> {
  const ctx = existing ?? createAudioContext();
  if (ctx.state === 'suspended') { try { await ctx.resume(); } catch { /* keep going */ } }

  const source = ctx.createMediaStreamSource(stream);
  const proc = ctx.createScriptProcessor(4096, 1, 1);
  const chunks: Float32Array[] = [];
  let total = 0;

  proc.onaudioprocess = (e) => {
    const d = e.inputBuffer.getChannelData(0);
    const copy = new Float32Array(d.length);
    copy.set(d);
    chunks.push(copy);
    total += copy.length;
  };

  // A ScriptProcessor only runs while connected to the destination, so route it
  // through a silent gain node — otherwise the mic would echo out the speaker.
  const silent = ctx.createGain();
  silent.gain.value = 0;
  source.connect(proc);
  proc.connect(silent);
  silent.connect(ctx.destination);

  return {
    async stop(): Promise<File> {
      proc.onaudioprocess = null;
      try { source.disconnect(); proc.disconnect(); silent.disconnect(); } catch { /* already torn down */ }
      const merged = new Float32Array(total);
      let at = 0;
      for (const c of chunks) { merged.set(c, at); at += c.length; }
      const srcRate = ctx.sampleRate;
      try { await ctx.close(); } catch { /* ignore */ }
      const out = normalize(resample(merged, srcRate, VOICE_RATE));
      return new File([encodeWav(out, VOICE_RATE)], `${baseName}.wav`, { type: 'audio/wav' });
    },
  };
}

/**
 * Sample rate for voice messages, in Hz.
 *
 * WAV is uncompressed, so this rate IS the file size: 16-bit mono works out at
 * exactly 2 bytes per sample, so 12 kHz is 24 KB per second — about 1.4 MB a
 * minute. Every listener downloads that, so a single long voice note in a busy
 * channel is a meaningful share of a month's bandwidth.
 *
 * 12 kHz carries frequencies up to 6 kHz, comfortably above the ~3.4 kHz a
 * phone call gives you, so speech is unaffected; it's a quarter smaller than
 * the 16 kHz we used to write. Raising it is safe (any browser plays PCM WAV at
 * any rate) — it just costs proportionally more to send.
 */
const VOICE_RATE = 12000;

/**
 * Resample down to the voice rate, filtering first so it doesn't alias.
 *
 * This used to be plain linear interpolation — read the input at the new
 * spacing and move on. That is the classic way to wreck a recording. A phone
 * captures at 48 kHz; anything in it above half the NEW rate has nowhere to go
 * and gets MIRRORED back down into the middle of the voice, at full volume. An
 * 8 kHz hiss came out as a 4 kHz tone sitting on top of the speech. Measured on
 * the old code: every frequency from 7 to 11 kHz folded back at 0 dB — the same
 * level as the speech itself. Sibilance, room hiss and handling noise all
 * landed in the worst possible place, which is what made recordings sound
 * metallic and underwater.
 *
 * So the high end has to be removed BEFORE the rate drops. Each output sample
 * is a windowed-sinc weighted average of the input around it, which low-passes
 * and resamples in one pass. Measured on the new code: 44-76 dB of rejection
 * above the cutoff (inaudible) with speech below 4 kHz untouched.
 *
 * Costs nothing in file size — the output is the same number of samples. Costs
 * about two seconds of maths on a phone for a full-length recording, which is
 * what the "Preparing your recording…" screen is already there for.
 */
const KERNEL_RES = 2048;   // how finely the kernel is sampled into the lookup
const TAPS_PER_SIDE = 8;   // output samples either side; more = steeper filter

function buildKernel(ratio: number): { table: Float32Array; halfWidth: number } {
  const halfWidth = Math.max(2, Math.ceil(ratio * TAPS_PER_SIDE));
  // Cutoff in cycles per INPUT sample, a little under the new Nyquist to leave
  // the filter room to roll off.
  const fc = Math.min(0.5 / ratio, 0.5) * 0.9;
  const table = new Float32Array(KERNEL_RES + 1);
  for (let i = 0; i <= KERNEL_RES; i++) {
    const u = i / KERNEL_RES;              // 0 at the centre, 1 at the edge
    const x = 2 * Math.PI * fc * (u * halfWidth);
    const sinc = x === 0 ? 1 : Math.sin(x) / x;
    // Blackman window: tapers the kernel to zero at the edge, which is what
    // buys the deep stopband instead of a ringing mess.
    const v = (1 - u) / 2;
    const w = 0.42 - 0.5 * Math.cos(2 * Math.PI * v) + 0.08 * Math.cos(4 * Math.PI * v);
    table[i] = sinc * w;
  }
  return { table, halfWidth };
}

function resample(input: Float32Array, from: number, to: number): Float32Array {
  if (from === to || input.length === 0) return input;
  const ratio = from / to;
  const outLen = Math.max(1, Math.floor(input.length / ratio));
  const out = new Float32Array(outLen);
  const { table, halfWidth } = buildKernel(ratio);
  const last = input.length - 1;
  for (let i = 0; i < outLen; i++) {
    const x = i * ratio;
    const lo = Math.max(0, Math.ceil(x - halfWidth));
    const hi = Math.min(last, Math.floor(x + halfWidth));
    let acc = 0;
    let wsum = 0;
    for (let j = lo; j <= hi; j++) {
      const w = table[((Math.abs(j - x) / halfWidth) * KERNEL_RES) | 0];
      acc += input[j] * w;
      wsum += w;
    }
    // Dividing by the weight total keeps the level flat rather than letting it
    // dip at the very start and end, where the kernel runs off the edge.
    out[i] = wsum !== 0 ? acc / wsum : 0;
  }
  return out;
}

/**
 * Bring a quiet recording up to a normal listening level.
 *
 * Phones vary enormously in how hot their microphone runs, and someone holding
 * the phone at arm's length in a noisy youth room records very quietly. Played
 * back in a chat next to everyone else's, it sounds broken rather than quiet.
 *
 * Aimed at a sensible speaking level by RMS (average loudness) rather than by
 * the single loudest sample, so one door slam doesn't decide the level for the
 * whole recording — but the gain is also held below whatever would clip that
 * loudest sample, so nothing ever distorts. Near-silence is left alone: there
 * is nothing in it to bring up except hiss.
 */
const TARGET_RMS = 0.1;    // a comfortable speech level
const MAX_GAIN = 6;        // don't haul up the room noise chasing a whisper

function normalize(samples: Float32Array): Float32Array {
  if (samples.length === 0) return samples;
  let sumSq = 0;
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i];
    sumSq += v * v;
    const a = Math.abs(v);
    if (a > peak) peak = a;
  }
  const rms = Math.sqrt(sumSq / samples.length);
  if (rms < 0.0005 || peak <= 0) return samples;   // effectively silent
  const gain = Math.min(TARGET_RMS / rms, 0.95 / peak, MAX_GAIN);
  if (gain <= 1.01) return samples;                 // already loud enough
  for (let i = 0; i < samples.length; i++) samples[i] *= gain;
  return samples;
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
  return new Blob([buffer], { type: 'audio/wav' });
}

/**
 * How long an audio file runs, in seconds — or null if we can't tell.
 *
 * Reads it off a throwaway <audio> element's metadata, which is the only way to
 * get at it without parsing container formats ourselves. Null on anything
 * unexpected (a format the browser won't open, or metadata that never arrives),
 * so callers can decide what an unknown length means rather than getting a
 * wrong number: never block someone on a question we couldn't answer.
 */
export function audioDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement('audio');
    let settled = false;
    const done = (seconds: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      el.removeAttribute('src');
      URL.revokeObjectURL(url);
      resolve(seconds);
    };
    // iOS in particular can open a file and then fire neither event, which
    // would leave the picker hanging with no feedback at all.
    const timer = setTimeout(() => done(null), 5000);
    el.preload = 'metadata';
    el.onloadedmetadata = () => done(Number.isFinite(el.duration) && el.duration > 0 ? el.duration : null);
    el.onerror = () => done(null);
    el.src = url;
  });
}

export async function uploadMedia(orgId: string, file: File): Promise<MediaObject> {
  const s = getSupabase();
  if (!s) throw new Error('Uploads require a configured Supabase backend.');
  const path = `${orgId}/${Date.now()}-${sanitizeName(file.name)}`;
  const { error } = await s.storage.from(BUCKET).upload(path, file, {
    // One year: every path is timestamped and therefore immutable, so a short
    // TTL just forced every viewer to re-download the same photo hourly — the
    // single biggest driver of CDN egress.
    cacheControl: '31536000',
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

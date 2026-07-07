import { getSupabase } from './supabase';

/**
 * Web Push subscription on the viewer side.
 *
 * A device registers a push subscription (browser → push service) and we store
 * it in Supabase keyed by workspace. The creator's "send" action (a Cloudflare
 * Function) later delivers to every stored subscription. On iOS this only works
 * once the app has been added to the Home Screen (Apple's rule).
 */

const VAPID_PUBLIC = (import.meta.env.VITE_VAPID_PUBLIC_KEY ?? '').trim();

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function pushConfigured(): boolean {
  return VAPID_PUBLIC.length > 0;
}

/** Current permission: 'granted' | 'denied' | 'default' | 'unsupported'. */
export function pushPermission(): string {
  if (!pushSupported()) return 'unsupported';
  return Notification.permission;
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Ask permission, subscribe this device, and save the subscription for `orgId`.
 * Throws a friendly Error on any failure so callers can show the message.
 */
export async function enablePush(orgId: string): Promise<void> {
  if (!pushSupported()) {
    throw new Error("This device or browser doesn't support notifications. On iPhone, add the app to your Home Screen first.");
  }
  if (!pushConfigured()) {
    throw new Error('Notifications are not set up for this app yet.');
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notifications were not allowed. You can enable them in your browser/site settings.');
  }
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC) as BufferSource,
  });
  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error('Could not create a notification subscription.');
  }
  const supabase = getSupabase();
  if (!supabase) throw new Error('Backend not configured.');
  const { data: userRes } = await supabase.auth.getUser();
  // Delete any existing row for this endpoint, then insert a fresh one.
  // We intentionally do NOT upsert: an upsert becomes INSERT ... ON CONFLICT
  // DO UPDATE, and the table has no UPDATE policy (by design — see 0007), so
  // the update branch would fail with an RLS violation whenever the device
  // re-subscribes with an endpoint it already registered. Delete-then-insert
  // only needs the delete + insert policies, which every viewer has.
  await supabase.from('push_subscriptions').delete().eq('endpoint', json.endpoint);
  const { error } = await supabase.from('push_subscriptions').insert({
    org_id: orgId,
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
    user_id: userRes?.user?.id ?? null,
  });
  if (error) {
    // Surface a readable message (Supabase errors are plain objects, not Error).
    const detail = error.message || (error as { hint?: string }).hint || 'could not save subscription';
    if (/relation .*push_subscriptions.* does not exist|could not find the table/i.test(detail)) {
      throw new Error('Notifications aren’t set up yet (missing database table). Ask the admin to run migration 0007.');
    }
    throw new Error(`Couldn’t save your notification subscription: ${detail}`);
  }
}

/** Unsubscribe this device and remove its stored subscription. */
export async function disablePush(): Promise<void> {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  const supabase = getSupabase();
  if (supabase) await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
}

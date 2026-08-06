import { useState } from 'react';

import { getSupabase } from '@/lib/supabase';
import { enablePush, pushConfigured, pushPermission, pushSupported, registerPushDevice } from '@/lib/push';

/**
 * Viewer-facing "Turn on notifications" control. Requests permission and
 * registers this device for the workspace's push notifications. Once on, it
 * also offers a self-test that sends a push to THIS device — the reliable way
 * to confirm banners actually reach a locked phone (a normal chat message never
 * notifies its own sender, so messaging yourself always looks broken).
 */
export function NotifyButton({ orgId, className }: { orgId: string; className?: string }) {
  const [state, setState] = useState<string>(pushPermission());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!pushConfigured() || !pushSupported()) return null;

  if (state === 'granted') {
    return (
      <div className={className}>
        <span className="text-sm text-green-700">🔔 Notifications on</span>
        <TestNotification orgId={orgId} />
      </div>
    );
  }

  return (
    <div className={className}>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await enablePush(orgId);
            setState('granted');
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          } finally {
            setBusy(false);
          }
        }}
        className="rounded-full px-4 py-2 text-sm font-semibold"
        style={{ backgroundColor: 'var(--th-primary)', color: 'var(--th-primary-text)' }}
      >
        {busy ? 'Enabling…' : '🔔 Turn on notifications'}
      </button>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

/** Sends a push to the current device and reports what happened. */
function TestNotification({ orgId }: { orgId: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setMsg(null);
    try {
      // Register THIS device now, inside the tap (a real user gesture iOS
      // trusts). This creates/repairs the subscription row linked to the
      // signed-in user — the exact link the chat push needs and that the
      // background self-heal was failing to create. Best-effort: if it throws,
      // the test below will still report "not registered."
      try { await registerPushDevice(orgId); } catch { /* fall through to test */ }
      const s = getSupabase();
      const { data: sess } = (await s?.auth.getSession()) ?? { data: { session: null } };
      const token = sess.session?.access_token;
      if (!token) { setMsg('Please sign in again to test.'); setBusy(false); return; }
      const r = await fetch('/api/notify-test', {
        method: 'POST',
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ orgId }),
      });
      const d = await r.json();
      if (!r.ok) { setMsg(d.error || 'Test failed.'); setBusy(false); return; }
      if (d.myDevices === 0) {
        setMsg("This device isn't registered yet. Fully close and reopen the app from your Home Screen, then try again.");
      } else if (d.sent > 0) {
        setMsg(`Sent to ${d.sent} of your device${d.sent === 1 ? '' : 's'}. Lock your phone — the banner should appear within a few seconds.`);
      } else {
        setMsg('Your device is registered but the push didn’t go through. Tell your admin so we can look at the subscription.');
      }
    } catch {
      setMsg('Could not run the test. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => void run()}
        disabled={busy}
        className="rounded-full border px-4 py-2 text-sm font-semibold disabled:opacity-50"
        style={{ borderColor: 'var(--th-hairline-strong)' }}
      >
        {busy ? 'Sending…' : '📲 Send me a test notification'}
      </button>
      {msg && <p className="mt-1 text-xs text-gray-600">{msg}</p>}
    </div>
  );
}

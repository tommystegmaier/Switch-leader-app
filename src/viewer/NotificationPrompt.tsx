import { useEffect, useState } from 'react';

import { enablePush, pushConfigured, pushPermission, pushSupported } from '@/lib/push';

/**
 * Prompt that appears when the app is opened from the Home Screen (installed /
 * standalone) and notifications haven't been enabled yet. Works on Android and
 * iOS — and on iOS this is the only place push can be enabled, since Apple only
 * allows it for the installed app. Shows once permission is still "default".
 */
function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function NotificationPrompt({ appName, orgId }: { appName: string; orgId: string }) {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!pushSupported() || !pushConfigured()) return;
    if (!isStandalone()) return; // only inside the installed (Home Screen) app
    if (pushPermission() !== 'default') return; // already granted or denied
    // Small delay so it doesn't fight the first paint.
    const t = setTimeout(() => setShow(true), 800);
    return () => clearTimeout(t);
  }, []);

  if (!show) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 p-3" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}>
      <div className="mx-auto max-w-screen-sm rounded-2xl border bg-white p-4 shadow-xl" style={{ borderColor: 'rgba(0,0,0,0.12)' }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold" style={{ color: 'var(--th-heading)' }}>🔔 Turn on notifications</p>
            <p className="mt-1 text-sm text-gray-600">
              Get updates from {appName} right on your phone.
            </p>
          </div>
          <button type="button" onClick={() => setShow(false)} aria-label="Not now" className="rounded-full px-2 text-xl leading-none text-gray-400 hover:bg-black/5">×</button>
        </div>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await enablePush(orgId);
              setShow(false);
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            } finally {
              setBusy(false);
            }
          }}
          className="mt-3 w-full rounded-full px-6 py-3 font-semibold disabled:opacity-50"
          style={{ backgroundColor: 'var(--th-primary)', color: 'var(--th-primary-text)' }}
        >
          {busy ? 'Enabling…' : 'Allow notifications'}
        </button>
      </div>
    </div>
  );
}

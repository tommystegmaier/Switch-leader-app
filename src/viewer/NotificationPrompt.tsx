import { useEffect, useState } from 'react';

import { enablePush, ensurePushSubscribed, pushConfigured, pushPermission, pushSupported } from '@/lib/push';

/**
 * Nudge to turn on notifications. Shows on EVERY app open until notifications
 * are actually on (permission granted + subscribed), then never again. Covers
 * people who tapped "Not now" before or previously blocked it.
 *
 * On iOS push only works inside the installed (Home Screen) app, so there we
 * wait until it's launched standalone (the InstallPrompt handles the install
 * nudge). On Android/desktop it can be enabled straight from the browser.
 */
function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}
function isIOS(): boolean {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent || '');
}

export function NotificationPrompt({ appName, orgId }: { appName: string; orgId: string }) {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    if (!pushSupported() || !pushConfigured()) return;
    // iOS: notifications only work once added to the Home Screen.
    if (isIOS() && !isStandalone()) return;

    const perm = pushPermission();
    if (perm === 'granted') {
      // Already on — make sure this device is subscribed (keeps the tag right)
      // and never show the prompt.
      void ensurePushSubscribed(orgId);
      return;
    }
    setBlocked(perm === 'denied');
    const t = setTimeout(() => setShow(true), 800);
    return () => clearTimeout(t);
  }, [orgId]);

  if (!show) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 p-3" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}>
      <div className="mx-auto max-w-screen-sm rounded-2xl border bg-white p-4 shadow-xl" style={{ borderColor: 'rgba(0,0,0,0.12)' }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold" style={{ color: 'var(--th-heading)' }}>🔔 Turn on notifications</p>
            <p className="mt-1 text-sm text-gray-600">
              {blocked
                ? `Notifications are blocked right now. Turn them on in your device/browser settings to get updates and group messages from ${appName}.`
                : `Get updates and group messages from ${appName} right on your phone.`}
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

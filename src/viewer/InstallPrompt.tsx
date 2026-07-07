import { useEffect, useState } from 'react';

/**
 * A friendly, platform-aware "Add to Home Screen" prompt.
 *
 * - Android/Chrome: captures the browser's `beforeinstallprompt` event and shows
 *   a one-tap Install button.
 * - iOS Safari: has no programmatic install, so we show the manual steps
 *   (Share → Add to Home Screen).
 * - Hidden when already installed (running standalone) and after the user
 *   dismisses it (remembered per workspace).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<any> };

function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // iOS Safari
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function InstallPrompt({ appName, slug }: { appName: string; slug: string }) {
  const storageKey = `install-dismissed:${slug}`;
  const [visible, setVisible] = useState(false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

  useEffect(() => {
    if (isStandalone()) return; // already installed
    if (localStorage.getItem(storageKey)) return; // dismissed before

    const onBIP = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', onBIP);

    // iOS never fires beforeinstallprompt — show manual instructions after a beat.
    let t: ReturnType<typeof setTimeout> | undefined;
    if (isIOS) t = setTimeout(() => setVisible(true), 1200);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBIP);
      if (t) clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  function dismiss() {
    localStorage.setItem(storageKey, '1');
    setVisible(false);
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    dismiss();
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 p-3" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}>
      <div className="mx-auto max-w-screen-sm rounded-2xl border bg-white p-4 shadow-xl" style={{ borderColor: 'rgba(0,0,0,0.12)' }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold" style={{ color: 'var(--th-heading)' }}>
              Add {appName} to your home screen
            </p>
            <p className="mt-1 text-sm text-gray-600">
              Get an app icon and full-screen experience — no app store needed.
            </p>
          </div>
          <button type="button" onClick={dismiss} aria-label="Dismiss" className="rounded-full px-2 text-xl leading-none text-gray-400 hover:bg-black/5">×</button>
        </div>

        {isIOS ? (
          <ol className="mt-3 space-y-1 text-sm text-gray-700">
            <li>1. Tap the <strong>Share</strong> button <span aria-hidden>􀈂</span> (the square with an up-arrow) at the bottom of Safari.</li>
            <li>2. Scroll down and tap <strong>“Add to Home Screen.”</strong></li>
            <li>3. Tap <strong>Add</strong> — the {appName} icon appears on your home screen.</li>
          </ol>
        ) : deferred ? (
          <button
            type="button"
            onClick={install}
            className="mt-3 w-full rounded-full px-6 py-3 font-semibold"
            style={{ backgroundColor: 'var(--th-primary)', color: 'var(--th-primary-text)' }}
          >
            Add to Home Screen
          </button>
        ) : (
          <p className="mt-3 text-sm text-gray-600">
            In your browser menu, choose <strong>“Install app”</strong> or <strong>“Add to Home screen.”</strong>
          </p>
        )}
      </div>
    </div>
  );
}

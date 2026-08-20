import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { installPlatform, isStandalone, type InstallPlatform } from '@/lib/platform';
import { ShareIcon } from '@/onboarding/ShareIcon';

/**
 * "Add this to your Home Screen" — for people who aren't confident with their
 * phones, which is most of the audience.
 *
 * Three things this gets right that the previous version didn't:
 *
 * 1. The Share glyph is drawn, not typed. It used to be Apple's private-use
 *    character, which renders as an empty box wherever SF Pro isn't available —
 *    so the one cue that matters most was often simply missing.
 * 2. It says why. "Get an app icon and full-screen experience" sounds optional.
 *    On iPhone it isn't: notifications are not delivered to a web page, only to
 *    an installed app, so skipping this means silently receiving nothing.
 * 3. Dismissing it is temporary. It used to be remembered forever, so one
 *    accidental tap on the × removed the guidance permanently. Now it comes
 *    back tomorrow — and stops for good on its own once they've succeeded,
 *    because an installed app never renders this at all.
 */

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void> };

/** Hidden for a day at a time — long enough not to nag, short enough to help. */
const SNOOZE_MS = 24 * 60 * 60 * 1000;

export function InstallPrompt({ appName, slug }: { appName: string; slug: string; orgId: string }) {
  const storageKey = `install-snoozed:${slug}`;
  const [visible, setVisible] = useState(false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [platform, setPlatform] = useState<InstallPlatform>('other');

  useEffect(() => {
    if (isStandalone()) return; // nothing to ask for — they've done it
    const until = Number(localStorage.getItem(storageKey) || 0);
    if (until && Date.now() < until) return;

    setPlatform(installPlatform());

    // Android/Chrome offers a real one-tap install; grab the event if it fires.
    const onBIP = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', onBIP);

    // iOS has no such event, and Chrome sometimes doesn't fire it either, so
    // show unprompted after a beat rather than waiting for something that may
    // never arrive.
    const t = setTimeout(() => setVisible(true), 1500);
    return () => { window.removeEventListener('beforeinstallprompt', onBIP); clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  function snooze() {
    try { localStorage.setItem(storageKey, String(Date.now() + SNOOZE_MS)); } catch { /* private mode */ }
    setVisible(false);
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    snooze();
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 p-3" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}>
      <div className="mx-auto max-w-screen-sm rounded-2xl border p-4 shadow-xl" style={{ backgroundColor: 'var(--th-surface)', borderColor: 'var(--th-hairline-strong)' }}>
        <p className="pr-6 text-base font-bold" style={{ color: 'var(--th-heading)' }}>
          Add {appName} to your Home Screen
        </p>
        <p className="mt-1 text-sm" style={{ color: 'var(--th-text)' }}>
          You won&apos;t get message notifications until you do — your phone only sends them to
          installed apps.
        </p>

        {platform === 'ios-other' ? (
          <p className="mt-3 text-sm" style={{ color: 'var(--th-text)' }}>
            This page needs to be open in <strong>Safari</strong> first.{' '}
            <Link to="/install" className="font-semibold underline">Show me how</Link>
          </p>
        ) : deferred ? (
          <button
            type="button"
            onClick={() => void install()}
            className="mt-3 w-full rounded-full px-6 py-3.5 text-base font-semibold"
            style={{ backgroundColor: 'var(--th-primary)', color: 'var(--th-primary-text)' }}
          >
            Install {appName}
          </button>
        ) : platform === 'ios-safari' ? (
          <>
            <ol className="mt-3 space-y-2 text-sm" style={{ color: 'var(--th-text)' }}>
              <li className="flex items-center gap-2">
                <span>1. Tap</span>
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border-2" style={{ borderColor: 'var(--th-primary)', color: 'var(--th-primary)' }}>
                  <ShareIcon className="h-5 w-5" title="Share" />
                </span>
                <span>at the bottom of Safari</span>
              </li>
              <li>2. Scroll down, tap <strong>Add to Home Screen</strong></li>
              <li>3. Tap <strong>Add</strong>, then open the new icon</li>
            </ol>
            {/* Points at the real Share button, which sits in Safari's bottom
                toolbar just below this card. A sentence describing a location is
                much easier to miss than something moving toward it. */}
            <div className="mt-1 flex justify-center">
              <span className="animate-bounce text-2xl leading-none" style={{ color: 'var(--th-primary)' }} aria-hidden>↓</span>
            </div>
          </>
        ) : (
          <p className="mt-3 text-sm" style={{ color: 'var(--th-text)' }}>
            In your browser menu, choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.
          </p>
        )}

        <div className="mt-3 flex items-center justify-between gap-3 border-t pt-3" style={{ borderColor: 'var(--th-hairline)' }}>
          <Link to="/install" className="text-sm font-semibold underline" style={{ color: 'var(--th-text)' }}>
            Step-by-step help
          </Link>
          <button type="button" onClick={snooze} className="text-sm" style={{ color: 'var(--th-text)', opacity: 0.6 }}>
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';

import { PLATFORM_NAME } from '@/lib/appMetadata';
import { installPlatform, isStandalone, type InstallPlatform } from '@/lib/platform';
import { ShareIcon } from './ShareIcon';

/**
 * A page whose only job is getting the app onto someone's Home Screen.
 *
 * Public, and separate from the app, so it can be TEXTED. The install guidance
 * used to live only inside the app people hadn't installed yet, which meant a
 * leader had no way to help someone who was stuck except to describe it over
 * the phone.
 *
 * Written for someone who is not confident with their phone: one platform's
 * steps at a time (never "if you're on Android…"), a numbered list, big type,
 * and the reason it matters stated once at the top. It detects the browser and
 * leads with the only instruction that helps there — which for anyone who
 * arrived from a link inside Facebook or Gmail is "open this in Safari," not
 * "tap Share," because Share genuinely isn't there.
 */
export function InstallPage() {
  const [platform, setPlatform] = useState<InstallPlatform>('other');
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    setPlatform(installPlatform());
    setInstalled(isStandalone());
  }, []);

  return (
    <div className="mx-auto max-w-md px-5 pb-16" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 2rem)' }}>
      <div className="text-center">
        <img src="/pwa-512.png" alt="" className="mx-auto h-20 w-20 rounded-2xl" />
        <h1 className="mt-4 text-2xl font-extrabold tracking-tight" style={{ color: 'var(--th-heading)' }}>
          Put {PLATFORM_NAME} on your phone
        </h1>
      </div>

      {installed ? (
        <p className="mt-6 rounded-xl p-4 text-center text-base font-semibold" style={{ backgroundColor: 'rgba(22,163,74,0.12)', color: '#15803d' }}>
          You&apos;re all set — you&apos;re using the installed app right now. Nothing else to do.
        </p>
      ) : (
        <>
          {/* Said once, plainly, at the top. On iPhone this is not a nicety: the
              phone will not deliver notifications to a web page, only to an
              installed app. Someone who skips this step silently receives
              nothing, which they experience as the app being broken. */}
          <p className="mt-5 rounded-xl p-4 text-[0.95rem] leading-relaxed" style={{ backgroundColor: 'var(--th-hairline)', color: 'var(--th-text)' }}>
            This takes about 30 seconds. <strong>You need to do it to get messages</strong> — your
            phone won&apos;t send notifications until the app is on your Home Screen.
          </p>

          {platform === 'ios-other' && <OpenInSafari />}
          {platform === 'ios-safari' && <IOSSteps />}
          {platform === 'android' && <AndroidSteps />}
          {platform === 'other' && <DesktopNote />}
        </>
      )}
    </div>
  );
}

/** Numbered step with a big, legible number. */
function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base font-bold"
        style={{ backgroundColor: 'var(--th-primary)', color: 'var(--th-primary-text)' }}
      >
        {n}
      </span>
      <span className="pt-1 text-[1.05rem] leading-relaxed" style={{ color: 'var(--th-text)' }}>{children}</span>
    </li>
  );
}

function IOSSteps() {
  return (
    <ol className="mt-6 flex flex-col gap-5">
      <Step n={1}>
        Tap the <strong>Share</strong> button at the bottom of the screen. It looks like this:
        <span className="mt-2 flex items-center gap-2">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl border-2" style={{ borderColor: 'var(--th-primary)', color: 'var(--th-primary)' }}>
            <ShareIcon className="h-7 w-7" title="Share" />
          </span>
          <span className="text-sm text-gray-500">a box with an arrow pointing up</span>
        </span>
      </Step>
      <Step n={2}>
        A list slides up. <strong>Scroll down</strong> in that list — it&apos;s further down than you expect.
      </Step>
      <Step n={3}>
        Tap <strong>Add to Home Screen</strong>.
      </Step>
      <Step n={4}>
        Tap <strong>Add</strong> in the top corner. The icon appears with your other apps.
      </Step>
      <Step n={5}>
        <strong>Open it from that new icon</strong> — not from Safari. Then say <strong>Allow</strong> when it
        asks about notifications.
      </Step>
    </ol>
  );
}

function AndroidSteps() {
  return (
    <ol className="mt-6 flex flex-col gap-5">
      <Step n={1}>
        Look for an <strong>Install</strong> button at the bottom of the screen and tap it. If you see one,
        that&apos;s all you need to do.
      </Step>
      <Step n={2}>
        No button? Tap the <strong>⋮</strong> menu in the top-right corner of Chrome.
      </Step>
      <Step n={3}>
        Tap <strong>Install app</strong> (it may say <strong>Add to Home screen</strong>).
      </Step>
      <Step n={4}>
        <strong>Open it from the new icon</strong>, then say <strong>Allow</strong> when it asks about
        notifications.
      </Step>
    </ol>
  );
}

/**
 * The dead end worth catching. Links opened from Facebook, Instagram, Gmail and
 * the like run in an embedded browser with no install option anywhere, and
 * Chrome on iOS can make a shortcut that cannot receive notifications. Either
 * way the fix is the same and nothing else will work until they do it.
 */
function OpenInSafari() {
  const [copied, setCopied] = useState(false);
  const url = typeof window === 'undefined' ? '' : window.location.origin;

  async function copy() {
    try { await navigator.clipboard?.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2500); }
    catch { /* clipboard unavailable — the steps below still work */ }
  }

  return (
    <div className="mt-6">
      <p className="rounded-xl p-4 text-[1.05rem] font-semibold leading-relaxed" style={{ backgroundColor: 'rgba(234,179,8,0.15)', color: 'var(--th-text)' }}>
        First you need to open this page in <strong>Safari</strong>. The app can&apos;t be added to your
        Home Screen from here.
      </p>
      <ol className="mt-5 flex flex-col gap-5">
        <Step n={1}>
          Tap <strong>Copy link</strong> below.
          <button
            type="button"
            onClick={() => void copy()}
            className="mt-2 block w-full rounded-full px-5 py-3 text-base font-semibold"
            style={{ backgroundColor: 'var(--th-primary)', color: 'var(--th-primary-text)' }}
          >
            {copied ? 'Copied ✓' : 'Copy link'}
          </button>
        </Step>
        <Step n={2}>
          Open the <strong>Safari</strong> app — the blue compass on your Home Screen.
        </Step>
        <Step n={3}>
          Tap the address bar, <strong>paste</strong>, and go. Then follow the steps that appear.
        </Step>
      </ol>
      <p className="mt-5 text-sm text-gray-500">
        If there&apos;s an <strong>Open in Safari</strong> option in this app&apos;s menu, that works too.
      </p>
    </div>
  );
}

function DesktopNote() {
  return (
    <p className="mt-6 text-[1.05rem] leading-relaxed" style={{ color: 'var(--th-text)' }}>
      You&apos;re on a computer. To put {PLATFORM_NAME} on a phone, open{' '}
      <strong>switchleaderapp.com</strong> on the phone itself and this page will show the right steps
      for it.
    </p>
  );
}

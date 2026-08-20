import { useEffect, useState } from 'react';

import { CURRENT_BUILD, fetchDeployedBuild, forceAppUpdate } from '@/lib/appUpdate';

/**
 * Keeps every device on the current build without anyone being asked to do
 * anything.
 *
 * The service worker answers navigations from its precached app shell, so
 * reloading cannot fetch new code — only the worker updating can, and browsers
 * choose when to check for that. Safari on a long-lived tab, and iOS with a
 * suspended home-screen app, can both sit on old code indefinitely. With a few
 * hundred volunteers on their own phones, "quit it twice" and "clear your
 * cache" are not instructions that can be given.
 *
 * So we ask the server directly what's deployed, and act on the answer.
 *
 * WHEN it acts matters as much as whether. Reloading someone mid-sentence in
 * chat would be its own bug, so it only reloads by itself at moments when
 * nothing can be in flight — first load, and returning to a backgrounded app.
 * A stale build noticed while somebody is actively using the app gets a banner
 * they can tap when they're ready.
 */
export function UpdateGate() {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function check(auto: boolean) {
      if (document.visibilityState !== 'visible') return;
      const deployed = await fetchDeployedBuild();
      if (cancelled || !deployed || deployed === CURRENT_BUILD) return;

      // Only ever try a given build once per session. Without this, a rollout
      // still propagating across the CDN — version.json already new, JS still
      // old on this edge — would reload in a loop. Failing over to the banner
      // leaves the person in control instead of stuck.
      const key = 'th-update-attempted';
      if (auto && sessionStorage.getItem(key) !== deployed) {
        try { sessionStorage.setItem(key, deployed); } catch { /* private mode */ }
        void forceAppUpdate();
        return;
      }
      setStale(true);
    }

    void check(true);
    const onVisible = () => { if (document.visibilityState === 'visible') void check(true); };
    const onShow = () => { void check(true); };
    // Polling is the only path that can catch someone in the middle of using
    // the app, so it never reloads on its own — it just raises the banner.
    const timer = setInterval(() => { void check(false); }, 5 * 60_000);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', onShow);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', onShow);
    };
  }, []);

  if (!stale) return null;

  return (
    <button
      type="button"
      onClick={() => void forceAppUpdate()}
      className="fixed inset-x-0 bottom-0 z-[60] w-full px-4 py-3 text-center text-sm font-semibold shadow-lg"
      style={{
        backgroundColor: 'var(--th-primary, #0f1420)',
        color: 'var(--th-primary-text, #ffffff)',
        paddingBottom: 'max(env(safe-area-inset-bottom), 0.75rem)',
      }}
    >
      A new version is ready — tap to update
    </button>
  );
}

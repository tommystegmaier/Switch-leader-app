/**
 * Force this device onto the newest build.
 *
 * The service worker already checks for updates whenever the app comes to the
 * foreground and once a minute after that, and normally that's enough. But a
 * long-lived desktop tab, or an iOS home-screen app the system has suspended,
 * can sit on an old build for hours — and from the inside it just looks like a
 * feature that was never shipped. With a few hundred people spread across a lot
 * of devices, "quit it twice, then hard-reload" is not an instruction that can
 * be given at scale, so there needs to be a button.
 *
 * Deliberately thorough rather than clever: unregister every worker, drop the
 * caches holding the app shell, then reload with nothing left to serve a stale
 * copy. The page re-registers the worker on the way back up.
 */
/** The build this running copy came from. */
export const CURRENT_BUILD = __BUILD_TIME__;

/**
 * Which build is actually deployed, or null if we couldn't find out.
 *
 * Fetched with `cache: 'no-store'` and as a plain request rather than a
 * navigation, so neither the browser cache nor the service worker's precached
 * app shell can answer it with something stale — which is the entire point.
 * Null on any failure: offline is not the same as out of date, and treating it
 * that way would reload people's phones every time they lost signal.
 */
export async function fetchDeployedBuild(): Promise<string | null> {
  try {
    const res = await fetch('/version.json', { cache: 'no-store' });
    if (!res.ok) return null;
    const body = await res.json();
    return typeof body?.build === 'string' ? body.build : null;
  } catch {
    return null;
  }
}

export async function forceAppUpdate(): Promise<void> {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister().catch(() => false)));
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(
        keys
          // Keep the media cache. It holds photos already downloaded to this
          // device, every one of which would otherwise be re-fetched from the
          // CDN — the exact repeat egress the caching was added to stop. It
          // never holds app code, so it can't be what's stale.
          .filter((k) => !k.startsWith('supabase-media'))
          .map((k) => caches.delete(k).catch(() => false)),
      );
    }
  } catch {
    // Whatever went wrong, the navigation below is still the best move left.
  }

  // Navigate to a URL this device has never requested, rather than calling
  // reload(). A reload can legitimately be answered from cache — which is
  // exactly what kept happening — whereas a URL with an unseen query string
  // has nothing to be answered from and must go to the network. The parameter
  // is stripped again on the way back up, so nobody ever sees it.
  const url = new URL(window.location.href);
  url.searchParams.set(BUST_PARAM, String(Date.now()));
  window.location.replace(url.toString());
}

const BUST_PARAM = 'fresh';

/**
 * Remove the cache-busting parameter after a forced update, so it doesn't end
 * up bookmarked, shared, or sitting in the address bar looking like a mistake.
 */
export function tidyUpdateParam(): void {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(BUST_PARAM)) return;
    url.searchParams.delete(BUST_PARAM);
    window.history.replaceState({}, '', url.pathname + url.search + url.hash);
  } catch { /* history unavailable — a visible query param is harmless */ }
}

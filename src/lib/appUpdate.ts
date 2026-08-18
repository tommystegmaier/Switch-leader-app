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
    // Whatever went wrong, the reload below is still the best move available.
  }
  window.location.reload();
}

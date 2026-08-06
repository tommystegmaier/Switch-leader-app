/**
 * Home-screen app-icon badge (the red number on the installed PWA icon), via
 * the Badging API. No-ops where unsupported (e.g. a plain browser tab). On iOS
 * this only works for an app added to the Home Screen.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const nav: any = typeof navigator !== 'undefined' ? navigator : undefined;

export function setAppBadge(count: number): void {
  try {
    if (!nav) return;
    if (count > 0 && typeof nav.setAppBadge === 'function') nav.setAppBadge(count);
    else if (typeof nav.clearAppBadge === 'function') nav.clearAppBadge();
  } catch { /* unsupported — ignore */ }
}

export function clearAppBadge(): void {
  try { if (nav && typeof nav.clearAppBadge === 'function') nav.clearAppBadge(); } catch { /* ignore */ }
}

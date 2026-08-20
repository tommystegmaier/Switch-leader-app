/**
 * What kind of browser is this, for the purpose of installing the app?
 *
 * This matters more than it looks. On iPhone, ONLY Safari can add a web app to
 * the Home Screen in a way that can receive notifications. Someone who opens
 * the invite link from inside Facebook, Instagram, or Gmail is in an embedded
 * browser that cannot install anything at all — and there is no menu item to
 * find, no matter how carefully they look. Telling that person to "tap Share"
 * is asking them to do something impossible, which is exactly how someone
 * decides the app is broken and gives up.
 *
 * So we detect the situation and give the one instruction that helps: open it
 * in Safari first.
 */

export type InstallPlatform =
  /** iPhone/iPad in Safari — can install, needs the manual Share steps. */
  | 'ios-safari'
  /** iPhone/iPad in something else — must move to Safari before anything else. */
  | 'ios-other'
  /** Android — Chrome can usually install in one tap. */
  | 'android'
  /** A desktop browser, or anything we can't place. */
  | 'other';

function ua(): string {
  return typeof navigator === 'undefined' ? '' : navigator.userAgent;
}

/** True once the app is running from a Home Screen icon rather than a tab. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    // iOS Safari predates display-mode and reports it here instead.
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function isIOS(): boolean {
  const s = ua();
  // iPadOS 13+ reports itself as a Mac, so a Mac with touch is really an iPad.
  return /iphone|ipad|ipod/i.test(s)
    || (/Macintosh/.test(s) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1);
}

/**
 * The embedded browsers that can't install. Deliberately a list of what we
 * recognise rather than "anything that isn't Safari": misfiring here would tell
 * a Safari user to open Safari, which is worse than saying nothing.
 */
function isEmbeddedOrOtherIOSBrowser(): boolean {
  const s = ua();
  return /FBAN|FBAV|FB_IAB|Instagram|Line\/|Twitter|MicroMessenger|LinkedInApp|Snapchat|Pinterest|GSA\//i.test(s)
    // Chrome, Firefox and Edge on iOS: real browsers, but their Home Screen
    // shortcuts don't produce an installed web app that can be notified.
    || /CriOS|FxiOS|EdgiOS|OPiOS/i.test(s);
}

export function installPlatform(): InstallPlatform {
  if (isIOS()) return isEmbeddedOrOtherIOSBrowser() ? 'ios-other' : 'ios-safari';
  if (/android/i.test(ua())) return 'android';
  return 'other';
}

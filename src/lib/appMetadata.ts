import type { AppSettings, Organization } from '@/types';

/**
 * Makes each workspace install to the home screen as ITS OWN app — its name and
 * logo, not the generic platform identity.
 *
 * - iOS captures the home-screen icon from <link rel="apple-touch-icon"> and the
 *   name from the document title at "Add to Home Screen" time, so we set both.
 * - Android/Chrome use the web app manifest; we swap in a per-workspace manifest
 *   (name + icon + scoped start_url) generated on the fly as a blob.
 * - theme-color tints the status bar to the workspace's primary color.
 *
 * The icon should be a square image the creator uploads in Settings → App icon
 * (falls back to the logo, then the platform default).
 */
export function applyWorkspaceMetadata(org: Organization, settings: AppSettings | undefined) {
  if (typeof document === 'undefined') return;
  const name = settings?.appName || org.name;
  const icon = settings?.iconUrl || settings?.logoUrl || null;
  const themeColor = settings?.theme?.primary || '#0f1420';
  const bgColor = settings?.theme?.background || '#ffffff';

  document.title = name;
  setMeta('theme-color', themeColor);
  setMeta('apple-mobile-web-app-title', name);

  if (icon) {
    setLink('apple-touch-icon', icon);
  }

  // Per-workspace manifest (drives the home-screen name/icon on iOS + Android).
  // We point at a REAL same-origin endpoint (/app-manifest) rather than a
  // blob:/data: URL, because iOS ignores those and falls back to the build-time
  // name. The workspace's details ride along in the query string.
  const params = new URLSearchParams({ slug: org.slug, name });
  if (icon) params.set('icon', icon);
  if (themeColor) params.set('theme', themeColor);
  if (bgColor) params.set('bg', bgColor);
  ensureLink('manifest').href = `/app-manifest?${params.toString()}`;
}

/**
 * The product this platform is. Every workspace on it is a Switch Leader app
 * for a particular location, not a generic hub other ministries build on, so
 * platform-level screens say so by name. One constant, so if that ever changes
 * there's a single place to change it.
 */
export const PLATFORM_NAME = 'Switch Leader App';

/** The platform hub's name — shown at the root, outside any workspace. */
export const HUB_TITLE = 'Create an app';

/**
 * Reset the tab/home-screen identity to the platform hub. Called on the root
 * pages (sign-in, "My workspaces", create) so they don't inherit a workspace's
 * name (or the baked build title) after you back out of an app.
 */
export function applyHubMetadata() {
  if (typeof document === 'undefined') return;
  document.title = HUB_TITLE;
  setMeta('apple-mobile-web-app-title', HUB_TITLE);
  // Keep the installable name in sync too (see applyWorkspaceMetadata).
  ensureLink('manifest').href = `/app-manifest?${new URLSearchParams({ name: HUB_TITLE }).toString()}`;
}

function setMeta(name: string, content: string) {
  let el = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('name', name);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function ensureLink(rel: string): HTMLLinkElement {
  let el = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  return el;
}

function setLink(rel: string, href: string) {
  ensureLink(rel).href = href;
}

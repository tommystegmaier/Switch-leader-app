import type { AppSettings, Organization } from '@/types';

/**
 * Reflect the workspace you're in, WITHOUT changing what the app installs as.
 *
 * Every workspace is a Switch Leader team at a particular location, not its own
 * product — so the home-screen name, the icon, and the manifest are fixed for
 * the whole platform (set in index.html and vite.config.ts) and nothing here
 * touches them. Someone in two locations gets one icon on their phone, and the
 * store listing is one app rather than one per location.
 *
 * What still varies is the browser tab title and the status-bar tint, because
 * those describe the page you're looking at rather than the app you installed.
 */
export function applyWorkspaceMetadata(org: Organization, settings: AppSettings | undefined) {
  if (typeof document === 'undefined') return;
  const name = settings?.appName || org.name;
  // "Omaha Switch Leader · Switch Leader App" — useful on a desktop tab strip,
  // and irrelevant to the install, which iOS took from the static markup at
  // "Add to Home Screen" time.
  document.title = name ? `${name} · ${PLATFORM_NAME}` : PLATFORM_NAME;
  setMeta('theme-color', settings?.theme?.primary || '#0f1420');
}

/**
 * The product this platform is. Every workspace on it is a Switch Leader app
 * for a particular location, not a generic hub other ministries build on, so
 * platform-level screens say so by name. One constant, so if that ever changes
 * there's a single place to change it.
 */
export const PLATFORM_NAME = 'Switch Leader App';

/**
 * Put the tab title back to the product when you're outside any workspace
 * (sign-in, My apps, create), so it doesn't keep showing the location you were
 * last in. The install identity isn't touched — it's fixed for the platform.
 */
export function applyHubMetadata() {
  if (typeof document === 'undefined') return;
  document.title = PLATFORM_NAME;
  setMeta('theme-color', '#0f1420');
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

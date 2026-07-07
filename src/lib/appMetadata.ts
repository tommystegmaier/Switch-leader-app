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

  // Per-workspace manifest (Android/Chrome installs).
  const manifest = {
    name,
    short_name: name.slice(0, 12),
    start_url: `/o/${org.slug}`,
    scope: `/o/${org.slug}`,
    display: 'standalone',
    background_color: bgColor,
    theme_color: themeColor,
    icons: icon
      ? [
          { src: icon, sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: icon, sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ]
      : [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
        ],
  };
  try {
    const blob = new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' });
    const url = URL.createObjectURL(blob);
    const link = ensureLink('manifest');
    // Revoke any previous blob URL we created to avoid leaks.
    const prev = link.getAttribute('data-blob');
    if (prev) URL.revokeObjectURL(prev);
    link.href = url;
    link.setAttribute('data-blob', url);
  } catch {
    /* manifest swap is best-effort */
  }
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

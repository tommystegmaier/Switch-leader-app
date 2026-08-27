import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// The product name, baked into the static HTML at build time — iOS reads the
// home-screen name from <title>/apple-mobile-web-app-title, not from later JS.
//
// EVERY workspace installs under this one name and icon. The platform is still
// multi-tenant, but each workspace is a Switch Leader team at a particular
// location, not a separate product: one icon on the phone, one entry in the
// stores, and the location's own name shown inside the app once you're in it.
// Keep in step with PLATFORM_NAME in src/lib/appMetadata.ts.
const APP_TITLE = process.env.VITE_APP_TITLE || 'Switch Leader App';

// Replaces the placeholder title + apple title in index.html so the installed
// app name is correct on iOS.
const injectAppTitle = {
  name: 'inject-app-title',
  transformIndexHtml(html: string) {
    return html
      .replace(/<title>[^<]*<\/title>/, `<title>${APP_TITLE}</title>`)
      .replace(
        /(<meta name="apple-mobile-web-app-title" content=")[^"]*(")/,
        `$1${APP_TITLE}$2`,
      );
  },
};

// Identifies this build. Baked into the bundle AND written to /version.json, so
// a running copy can compare the two and know it's out of date.
const BUILD_ID = new Date().toISOString();

/**
 * Emit /version.json — the whole update mechanism turns on this file.
 *
 * Navigations are network-first now, so a device that reopens the app while
 * online lands on the current build by itself. This is the belt to that
 * braces: it catches the copy that has been sitting open for hours, and it
 * answers "am I current?" without depending on the service worker at all.
 *
 * A few dozen bytes, served uncached, fetched as a plain request rather than a
 * navigation — so it always reflects what is actually deployed.
 */
const emitVersion = {
  name: 'emit-version',
  generateBundle() {
    // @ts-expect-error — rollup plugin context, not typed here
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD_ID }) });
  },
};

// https://vitejs.dev/config/
export default defineConfig({
  // Surfaced in the menu so a user can read back which build they're on —
  // an installed PWA can silently serve a cached version for a long time.
  define: { __BUILD_TIME__: JSON.stringify(BUILD_ID) },
  plugins: [
    react(),
    tailwindcss(),
    injectAppTitle,
    emitVersion,
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png'],
      // A real, static manifest at a fixed URL — not the per-workspace one this
      // used to generate at request time. Every install is "Switch Leader App",
      // and the Play Store's TWA tooling needs a manifest file it can fetch and
      // read at build time; a dynamic endpoint that varies by referer can't
      // serve that purpose.
      manifest: {
        name: APP_TITLE,
        short_name: APP_TITLE,
        description: 'The app for Switch leaders — schedules, roster, and team chat.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#0f1420',
        background_color: '#ffffff',
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          // Android crops icons to whatever shape the launcher uses, so the
          // maskable copy needs its artwork inside the safe circle or the edges
          // get shaved off.
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Cache the built app shell for offline use; runtime-cache published
        // content (Supabase reads) so a viewer can reopen the app offline.
        // HTML is deliberately NOT precached — see the navigation rule below.
        globPatterns: ['**/*.{js,css,svg,png,woff2}'],
        // Web Push handlers (push + notificationclick) folded into the SW.
        importScripts: ['/push-sw.js'],
        // Explicitly off, and it must stay that way.
        //
        // A navigateFallback serves the PRECACHED index.html for every
        // navigation, which is what made stale builds so hard to shift: opening
        // the app could not fetch new HTML — and therefore never new JavaScript
        // — however many times someone reloaded. The only way out was the
        // service worker updating itself, which an installed iOS app does not
        // do reliably, so devices sat on old code for days.
        //
        // Left unset the plugin supplies index.html as its own default, and
        // because Workbox matches routes in registration order that fallback
        // wins over the network-first rule below. Undefined is load-bearing.
        //
        // Nothing is lost: Cloudflare rewrites every unknown path to index.html
        // (see _redirects), so a navigation to any deep link returns the shell
        // from the server regardless.
        navigateFallback: undefined,
        runtimeCaching: [
          {
            // The app shell, network-first. Online, every launch gets the
            // current HTML and therefore the current build — no service-worker
            // update required, which is the whole point. Offline (or on a dead
            // connection, after 4s) it falls back to the last copy, so the app
            // still opens on a plane or in a basement.
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'app-shell',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 32 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: ({ url }) => url.pathname.includes('/rest/v1/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-content',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
          {
            // Audio/video must NOT be served from the service-worker cache.
            // Safari only plays media when the server answers HTTP Range
            // requests with 206 Partial Content; a cached full 200 response
            // makes playback fail outright — which is why a voice message
            // played fine as a local preview but not once uploaded, while
            // images (no range requests) were unaffected. Rule order matters:
            // Workbox uses the first match, so this precedes the media cache.
            urlPattern: ({ url }) =>
              url.pathname.includes('/storage/v1/object/public/') &&
              /\.(wav|m4a|mp3|aac|ogg|oga|webm|mp4|mov)$/i.test(url.pathname),
            handler: 'NetworkOnly',
          },
          {
            // CacheFirst, not StaleWhileRevalidate: SWR re-fetched every image
            // in the background on every view, so a cached photo still cost
            // full CDN egress each time it appeared. Uploaded paths are
            // timestamped and never change, so serving from cache without
            // revalidating is safe — and cuts repeat egress to zero.
            urlPattern: ({ url }) => url.pathname.includes('/storage/v1/object/public/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'supabase-media',
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
  },
});

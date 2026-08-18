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

// https://vitejs.dev/config/
export default defineConfig({
  // Surfaced in the menu so a user can read back which build they're on —
  // an installed PWA can silently serve a cached version for a long time.
  define: { __BUILD_TIME__: JSON.stringify(new Date().toISOString()) },
  plugins: [
    react(),
    tailwindcss(),
    injectAppTitle,
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
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Web Push handlers (push + notificationclick) folded into the SW.
        importScripts: ['/push-sw.js'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/o\/[^/]+\/settings/],
        runtimeCaching: [
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

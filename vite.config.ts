import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// Baked into the static HTML at build time. iOS reads the home-screen name
// from the built-in <title>/apple-mobile-web-app-title, not from later JS —
// so set VITE_APP_TITLE (e.g. "Switch Leader App") for single-workspace apps.
const APP_TITLE = process.env.VITE_APP_TITLE || 'Team Hub';

// Replaces the placeholder title + apple title in index.html so the installed
// app name is correct on iOS. (The manifest <link> is hardcoded in index.html
// pointing at our dynamic /app-manifest endpoint — see that file — so each
// workspace on this multi-tenant build installs under its own name.)
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
  plugins: [
    react(),
    tailwindcss(),
    injectAppTitle,
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png'],
      // The install manifest is served dynamically per-workspace from the
      // /app-manifest Pages Function, and index.html links to it directly, so we
      // disable the plugin's own static manifest (one build serves many
      // workspaces, so a baked name would be wrong for all but one).
      manifest: false,
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

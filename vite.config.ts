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
  plugins: [
    react(),
    tailwindcss(),
    injectAppTitle,
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png'],
      // Installable shell identity. For a single-workspace deployment set
      // VITE_APP_TITLE so the installed name matches (Android reads the manifest).
      manifest: {
        name: APP_TITLE,
        short_name: APP_TITLE.slice(0, 30),
        description: 'Your team’s resources, weekly info, links and documents.',
        theme_color: '#0f1420',
        background_color: '#0f1420',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
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
            urlPattern: ({ url }) => url.pathname.includes('/storage/v1/object/public/'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'supabase-media',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 },
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

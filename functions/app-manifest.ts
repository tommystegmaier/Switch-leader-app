// Cloudflare Pages Function: GET /app-manifest
//
// Serves a per-workspace Web App Manifest so each workspace installs to the
// home screen under ITS OWN name and icon — not the build-time platform name.
//
// Why this exists: iOS reads the "Add to Home Screen" name from the manifest
// (when "Open as Web App" is on), and it IGNORES blob:/data: manifest URLs — so
// a client-generated blob manifest silently falls back to the baked-in name.
// This endpoint is a real, same-origin URL; the app points the <link
// rel="manifest"> at it with the workspace's details in the query string, so
// iOS/Android fetch it and pick up the correct name every time.

function esc(v: string): string {
  return v.slice(0, 200);
}

export const onRequestGet = async (context: { request: Request }): Promise<Response> => {
  const url = new URL(context.request.url);
  const q = url.searchParams;

  const name = esc(q.get('name') || 'Team Hub');
  const slug = (q.get('slug') || '').replace(/[^a-z0-9-]/gi, '');
  const icon = q.get('icon');
  const theme = esc(q.get('theme') || '#0f1420');
  const bg = esc(q.get('bg') || '#ffffff');
  const scope = slug ? `/o/${slug}` : '/';

  const icons = icon
    ? [
        { src: icon, sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: icon, sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
      ]
    : [
        { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
      ];

  const manifest = {
    name,
    // Don't hard-truncate mid-word; the OS shortens if it must.
    short_name: name.slice(0, 30),
    start_url: scope,
    scope,
    display: 'standalone',
    theme_color: theme,
    background_color: bg,
    icons,
  };

  return new Response(JSON.stringify(manifest), {
    headers: {
      'content-type': 'application/manifest+json; charset=utf-8',
      // Per-workspace URL varies by query string; keep it fresh after renames.
      'cache-control': 'no-cache',
      'access-control-allow-origin': '*',
    },
  });
};

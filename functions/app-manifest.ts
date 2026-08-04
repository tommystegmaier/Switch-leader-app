// Cloudflare Pages Function: GET /app-manifest
//
// Serves a per-workspace Web App Manifest so each workspace installs to the
// home screen under ITS OWN name and icon — not the build-time platform name.
//
// Why this exists: on a multi-tenant deployment ONE build serves every
// workspace, so the manifest baked at build time can't carry each workspace's
// name. iOS reads the "Add to Home Screen" name from the manifest (when "Open
// as Web App" is on) at page-load time, and ignores blob:/data: URLs and (in
// practice) late JS edits — so index.html links <rel="manifest"> straight at
// this endpoint and we resolve the right workspace here, server-side.
//
// The workspace is identified by (in priority order): an explicit ?slug=, the
// page's Referer path (/o/<slug>), or a client-supplied ?name=. Name + icon are
// looked up from the published snapshot so viewers get exactly what's live.

import { createClient } from '@supabase/supabase-js';

interface Env {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

function slugFromReferer(referer: string | null): string | null {
  if (!referer) return null;
  try {
    const m = /\/o\/([a-z0-9-]+)/i.exec(new URL(referer).pathname);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/** Look up a workspace's published app name + icon by slug. Best-effort. */
async function lookupWorkspace(
  env: Env,
  slug: string,
): Promise<{ name: string; icon: string | null } | null> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return null;
  try {
    const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
    const { data: org } = await admin
      .from('organizations')
      .select('id, name')
      .eq('slug', slug)
      .maybeSingle();
    if (!org) return null;
    let name = (org.name || '').toString().trim();
    let icon: string | null = null;
    // Prefer the published (live-to-viewers) name/icon over the raw org name.
    const { data: pc } = await admin
      .from('published_content')
      .select('settings')
      .eq('org_id', org.id)
      .maybeSingle();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const settings: any = pc?.settings ?? {};
    if (settings.app_name) name = String(settings.app_name).trim();
    icon = settings.icon_url || settings.logo_url || null;
    return name ? { name, icon } : null;
  } catch {
    return null;
  }
}

export const onRequestGet = async (context: { request: Request; env: Env }): Promise<Response> => {
  const { request, env } = context;
  const url = new URL(request.url);
  const q = url.searchParams;

  const slug = (q.get('slug') || slugFromReferer(request.headers.get('referer')) || '').replace(/[^a-z0-9-]/gi, '');

  // Prefer the live published name/icon; fall back to whatever the client sent,
  // then to the neutral platform name.
  let name = (q.get('name') || '').slice(0, 200);
  let icon = q.get('icon');
  if (slug) {
    const found = await lookupWorkspace(env, slug);
    if (found) {
      name = found.name.slice(0, 200);
      icon = found.icon || icon;
    }
  }
  if (!name) name = 'Team Hub';

  const theme = (q.get('theme') || '#0f1420').slice(0, 32);
  const bg = (q.get('bg') || '#ffffff').slice(0, 32);
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
      // Resolve fresh each add so a rename is reflected; vary by the page that
      // requested it since the same URL can serve different workspaces.
      'cache-control': 'no-store',
      'vary': 'Referer',
      'access-control-allow-origin': '*',
    },
  });
};

// Cloudflare Pages Function: GET /api/gif-search?q=...&offset=...
//
// Proxies GIPHY search/trending so the API key stays server-side (never shipped
// to the browser) and CORS is handled. Set GIPHY_API_KEY in the Pages project's
// environment variables. Without it, this returns an empty, "not configured"
// result so the picker can show a friendly message instead of breaking.

interface Env {
  GIPHY_API_KEY?: string;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}

export const onRequestGet = async (context: { request: Request; env: Env }): Promise<Response> => {
  const { request, env } = context;
  if (!env.GIPHY_API_KEY) {
    return json({ configured: false, gifs: [] });
  }
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') || '').trim().slice(0, 100);
  const offset = Math.max(0, Math.min(200, parseInt(url.searchParams.get('offset') || '0', 10) || 0));

  const base = q
    ? `https://api.giphy.com/v1/gifs/search?q=${encodeURIComponent(q)}&`
    : 'https://api.giphy.com/v1/gifs/trending?';
  const endpoint = `${base}api_key=${env.GIPHY_API_KEY}&limit=24&offset=${offset}&rating=pg-13&bundle=messaging_non_clips`;

  try {
    const r = await fetch(endpoint);
    const data = await r.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gifs = ((data as any)?.data ?? []).map((g: any) => ({
      id: g.id,
      preview: g.images?.fixed_width_small?.url || g.images?.fixed_width?.url || null,
      url: g.images?.fixed_height?.url || g.images?.downsized?.url || g.images?.original?.url || null,
    })).filter((g: { url: string | null }) => Boolean(g.url));
    return json({ configured: true, gifs });
  } catch {
    return json({ configured: true, gifs: [], error: 'GIF search failed. Try again.' });
  }
};

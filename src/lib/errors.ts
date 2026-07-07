/**
 * Turn any thrown value into a human-readable string.
 *
 * Supabase / PostgREST errors are plain objects ({ message, details, hint,
 * code }), NOT Error instances — so `String(e)` on them yields the useless
 * "[object Object]". This pulls out the most useful text instead.
 */
export function errorMessage(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === 'string') return e;
  if (e && typeof e === 'object') {
    const o = e as { message?: string; hint?: string; details?: string; code?: string; error_description?: string };
    const parts = [o.message, o.details, o.hint].filter(Boolean);
    if (parts.length) return o.code ? `${parts.join(' — ')} (${o.code})` : parts.join(' — ');
    if (o.error_description) return o.error_description;
    try {
      const j = JSON.stringify(e);
      if (j && j !== '{}') return j;
    } catch { /* fall through */ }
  }
  return 'Something went wrong.';
}

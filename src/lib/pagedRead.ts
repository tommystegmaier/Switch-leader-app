/**
 * Read every row of something, in pages.
 *
 * PostgREST caps how many rows a single request may return — Supabase ships
 * that at 1000 — and it does so SILENTLY. The request succeeds, the list is
 * just short. No error, nothing logged.
 *
 * That already cost us a real bug: a leader stayed in her group's chat (which
 * is decided in the database) while vanishing from the roster board (which
 * reads a list), and the roster is the screen you'd check to find out who is
 * in the group. Anything that reads a whole table or a whole set-returning
 * function needs to page, or it works fine right up until a ministry grows.
 *
 * Applies to RPC calls as well as table reads — a set-returning function is
 * capped the same way.
 */
export async function readAllPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 1000,
): Promise<T[]> {
  const rows: T[] = [];
  // A ceiling on requests, so a server that ignored the range and kept
  // returning a full page couldn't spin here forever.
  const MAX_PAGES = 200;
  for (let i = 0; i < MAX_PAGES; i++) {
    const from = i * pageSize;
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) throw error;
    const batch = data ?? [];
    rows.push(...batch);
    // A short page means that was the last one.
    if (batch.length < pageSize) return rows;
  }
  return rows;
}

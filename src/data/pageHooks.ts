import { useQuery } from '@tanstack/react-query';

import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import type { Page } from '@/types';

/**
 * Reads ALL pages of a workspace (including unpublished drafts), for editors.
 * RLS already lets members read drafts; anonymous viewers never can. Falls back
 * to empty when no backend is configured (editing is a Supabase-only flow).
 */
export function useAllPages(orgId: string | undefined) {
  return useQuery({
    queryKey: ['org', orgId, 'all-pages'],
    enabled: Boolean(orgId) && isSupabaseConfigured,
    queryFn: async (): Promise<Page[]> => {
      const s = getSupabase();
      if (!s || !orgId) return [];
      const { data, error } = await s
        .from('pages')
        .select('*')
        .eq('org_id', orgId)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((row: any) => ({
        id: row.id,
        orgId: row.org_id,
        name: row.name,
        icon: row.icon ?? null,
        slug: row.slug,
        sortOrder: row.sort_order,
        isPublished: row.is_published,
        visibility: row.visibility,
      }));
    },
  });
}

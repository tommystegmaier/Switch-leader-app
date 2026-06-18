import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';

/**
 * Draft → publish workflow.
 *
 * - usePublishStatus: whether the draft has unpublished changes, and when it was
 *   last published.
 * - usePublishWorkspace: copies the current draft into the published snapshot
 *   that viewers read, then refreshes all of this workspace's queries.
 */

export interface PublishStatus {
  publishedAt: string | null;
  dirty: boolean;
}

export function usePublishStatus(orgId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['org', orgId, 'publish-status'],
    enabled: Boolean(orgId) && enabled && isSupabaseConfigured,
    queryFn: async (): Promise<PublishStatus> => {
      const s = getSupabase();
      if (!s || !orgId) return { publishedAt: null, dirty: false };
      const { data, error } = await s.rpc('get_publish_status', { p_org: orgId });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = data as any;
      return { publishedAt: d?.publishedAt ?? null, dirty: Boolean(d?.dirty) };
    },
    // Keep the indicator fresh as the editor makes changes.
    refetchInterval: 15000,
  });
}

export function usePublishWorkspace(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const s = getSupabase();
      if (!s) throw new Error('Publishing requires a configured backend.');
      const { error } = await s.rpc('publish_workspace', { p_org: orgId });
      if (error) throw error;
    },
    // Refresh both the published snapshot reads and the publish-status badge.
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org', orgId] }),
  });
}

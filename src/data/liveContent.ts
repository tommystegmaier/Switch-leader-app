import { useQuery } from '@tanstack/react-query';

import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import type { AppSettings, Block } from '@/types';

/**
 * "Live" reads for EDIT MODE — straight from the draft tables (app_settings,
 * blocks), as opposed to the published snapshot the viewer reads. Editors work
 * against these; viewers never do.
 */

/** Stable query key for a page's live (draft) blocks. Shared with mutations. */
export const liveBlocksKey = (orgId: string | undefined, pageId: string | undefined) =>
  ['org', orgId, 'live-blocks', pageId] as const;

export const liveSettingsKey = (orgId: string | undefined) =>
  ['org', orgId, 'live-settings'] as const;

export function useLiveAppSettings(orgId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: liveSettingsKey(orgId),
    enabled: Boolean(orgId) && enabled && isSupabaseConfigured,
    queryFn: async (): Promise<AppSettings | null> => {
      const s = getSupabase();
      if (!s || !orgId) return null;
      const { data, error } = await s.from('app_settings').select('*').eq('org_id', orgId).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        orgId: data.org_id,
        appName: data.app_name,
        logoUrl: data.logo_url ?? null,
        iconUrl: data.icon_url ?? null,
        theme: data.theme,
        fontFamily: data.font_family,
        splash: data.splash,
        navStyle: data.nav_style,
        viewerAccess: data.viewer_access,
        tabs: data.tabs ?? [],
      };
    },
  });
}

export function useLivePageBlocks(orgId: string | undefined, pageId: string | undefined) {
  return useQuery({
    queryKey: liveBlocksKey(orgId, pageId),
    enabled: Boolean(orgId) && Boolean(pageId) && isSupabaseConfigured,
    queryFn: async (): Promise<Block[]> => {
      const s = getSupabase();
      if (!s || !orgId || !pageId) return [];
      const { data, error } = await s
        .from('blocks')
        .select('*')
        .eq('org_id', orgId)
        .eq('page_id', pageId)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((row: any) => ({
        id: row.id,
        orgId: row.org_id,
        pageId: row.page_id,
        sectionId: row.section_id ?? null,
        type: row.type,
        sortOrder: row.sort_order,
        props: row.props ?? {},
        visibility: row.visibility,
      }));
    },
  });
}

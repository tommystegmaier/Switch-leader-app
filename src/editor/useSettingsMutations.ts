import { useMutation, useQueryClient } from '@tanstack/react-query';

import { getSupabase } from '@/lib/supabase';
import { liveSettingsKey } from '@/data/liveContent';
import type { AppSettings } from '@/types';

/**
 * Persists workspace settings (app_settings). RLS allows editor+ only.
 * Invalidates the settings query so the live app (title, theme, nav) updates.
 */
export function useSettingsMutations(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<AppSettings>) => {
      const s = getSupabase();
      if (!s) throw new Error('Editing requires a configured Supabase backend.');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const row: any = {};
      if (patch.appName !== undefined) row.app_name = patch.appName;
      if (patch.logoUrl !== undefined) row.logo_url = patch.logoUrl;
      if (patch.iconUrl !== undefined) row.icon_url = patch.iconUrl;
      if (patch.theme !== undefined) row.theme = patch.theme;
      if (patch.fontFamily !== undefined) row.font_family = patch.fontFamily;
      if (patch.splash !== undefined) row.splash = patch.splash;
      if (patch.navStyle !== undefined) row.nav_style = patch.navStyle;
      if (patch.viewerAccess !== undefined) row.viewer_access = patch.viewerAccess;
      if (patch.tabs !== undefined) row.tabs = patch.tabs;
      const { error } = await s.from('app_settings').update(row).eq('org_id', orgId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: liveSettingsKey(orgId) });
      qc.invalidateQueries({ queryKey: ['org', orgId, 'publish-status'] });
    },
  });
}

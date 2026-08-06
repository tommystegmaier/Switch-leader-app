import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';

/**
 * Platform command center (super-admin). All of this is gated server-side by
 * the platform_admins allowlist; these hooks just surface it. A normal user
 * calling the RPCs gets a "not authorized" error.
 */

export interface PlatformAppOwner { user_id: string; email: string | null; banned: boolean }
export interface PlatformApp {
  orgId: string;
  name: string;
  slug: string;
  appName: string;
  createdAt: string;
  memberCount: number;
  owners: PlatformAppOwner[];
}

/** Is the signed-in user a platform admin? */
export function useIsPlatformAdmin(enabled = true) {
  return useQuery({
    queryKey: ['platform', 'is-admin'],
    enabled: enabled && isSupabaseConfigured,
    queryFn: async (): Promise<boolean> => {
      const s = getSupabase(); if (!s) return false;
      const { data, error } = await s.rpc('is_platform_admin');
      if (error) return false;
      return Boolean(data);
    },
  });
}

/** Every app on the platform (newest first). */
export function usePlatformApps(enabled = true) {
  return useQuery({
    queryKey: ['platform', 'apps'],
    enabled: enabled && isSupabaseConfigured,
    queryFn: async (): Promise<PlatformApp[]> => {
      const s = getSupabase(); if (!s) return [];
      const { data, error } = await s.rpc('platform_list_apps');
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((r: any) => ({
        orgId: r.org_id,
        name: r.name,
        slug: r.slug,
        appName: r.app_name || r.name,
        createdAt: r.created_at,
        memberCount: r.member_count ?? 0,
        owners: Array.isArray(r.owners) ? r.owners : [],
      }));
    },
  });
}

export interface PlatformAdmin { user_id: string; email: string | null }

/** Current platform admins. */
export function usePlatformAdmins(enabled = true) {
  return useQuery({
    queryKey: ['platform', 'admins'],
    enabled: enabled && isSupabaseConfigured,
    queryFn: async (): Promise<PlatformAdmin[]> => {
      const s = getSupabase(); if (!s) return [];
      const { data, error } = await s.rpc('platform_list_admins');
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((r: any) => ({ user_id: r.user_id, email: r.email ?? null }));
    },
  });
}

export function usePlatformAddAdmin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (email: string) => {
      const s = getSupabase(); if (!s) throw new Error('Backend not configured.');
      const { error } = await s.rpc('platform_add_admin', { p_email: email.trim() });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['platform', 'admins'] }),
  });
}

export function usePlatformRemoveAdmin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const s = getSupabase(); if (!s) throw new Error('Backend not configured.');
      const { error } = await s.rpc('platform_remove_admin', { p_user: userId });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['platform', 'admins'] }),
  });
}

export function usePlatformDeleteApp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (orgId: string) => {
      const s = getSupabase(); if (!s) throw new Error('Backend not configured.');
      const { error } = await s.rpc('platform_delete_app', { p_org: orgId });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['platform', 'apps'] }),
  });
}

/** Join an app as owner (to open and troubleshoot it). Returns its slug. */
export function usePlatformJoinApp() {
  return useMutation({
    mutationFn: async (orgId: string): Promise<string> => {
      const s = getSupabase(); if (!s) throw new Error('Backend not configured.');
      const { data, error } = await s.rpc('platform_join_app', { p_org: orgId });
      if (error) throw error;
      return data as string;
    },
  });
}

/** Disable or re-enable a user account (cuts off / restores platform access). */
export function usePlatformSetUserDisabled() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, disable }: { userId: string; disable: boolean }) => {
      const s = getSupabase(); if (!s) throw new Error('Backend not configured.');
      const { data: sess } = await s.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error('Please sign in again.');
      const res = await fetch('/api/platform-user', {
        method: 'POST',
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId, disable }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Could not update the account.');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['platform', 'apps'] }),
  });
}

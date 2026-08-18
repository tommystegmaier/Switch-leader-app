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
  chatMediaEnabled: boolean;
  iconUrl: string | null;
  logoUrl: string | null;
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
        chatMediaEnabled: r.chat_media_enabled !== false,
        iconUrl: r.icon_url ?? null,
        logoUrl: r.logo_url ?? null,
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

/** Mark an app as a template others can start from (platform admin only). */
export function usePlatformAddTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ orgId, name, tagline }: { orgId: string; name: string; tagline?: string }) => {
      const s = getSupabase(); if (!s) throw new Error('Backend not configured.');
      const { error } = await s.rpc('platform_add_template', { p_org: orgId, p_name: name, p_tagline: tagline ?? null, p_icon: null });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['app-templates'] }); },
  });
}

export function usePlatformRemoveTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (orgId: string) => {
      const s = getSupabase(); if (!s) throw new Error('Backend not configured.');
      const { error } = await s.rpc('platform_remove_template', { p_org: orgId });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['app-templates'] }); },
  });
}

/** Turn chat photos + voice messages on/off for an app (platform admin only). */
export function usePlatformSetChatMedia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ orgId, enabled }: { orgId: string; enabled: boolean }) => {
      const s = getSupabase(); if (!s) throw new Error('Backend not configured.');
      const { error } = await s.rpc('platform_set_chat_media', { p_org: orgId, p_enabled: enabled });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['platform', 'apps'] }),
  });
}

/**
 * Set an app's logo and icon from the command center. Both are sent every
 * time — the caller holds the current values — so clearing one is just sending
 * null for it, with no separate "clear" call to get out of step.
 */
export function usePlatformSetBranding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ orgId, logoUrl, iconUrl }: { orgId: string; logoUrl: string | null; iconUrl: string | null }) => {
      const s = getSupabase(); if (!s) throw new Error('Backend not configured.');
      const { error } = await s.rpc('platform_set_app_branding', { p_org: orgId, p_logo_url: logoUrl, p_icon_url: iconUrl });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['platform', 'apps'] }),
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

export interface ContentReport {
  id: string;
  orgId: string;
  appName: string;
  messageId: string | null;
  stillPosted: boolean;
  reporterName: string | null;
  authorName: string | null;
  bodyExcerpt: string | null;
  mediaUrl: string | null;
  reason: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

/** Reported messages awaiting review (platform admins). */
export function usePlatformReports(enabled = true, includeResolved = false) {
  return useQuery({
    queryKey: ['platform', 'reports', includeResolved],
    enabled: enabled && isSupabaseConfigured,
    queryFn: async (): Promise<ContentReport[]> => {
      const s = getSupabase(); if (!s) return [];
      const { data, error } = await s.rpc('platform_list_reports', { p_include_resolved: includeResolved });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((r: any) => ({
        id: r.id,
        orgId: r.org_id,
        appName: r.app_name,
        messageId: r.message_id ?? null,
        stillPosted: Boolean(r.still_posted),
        reporterName: r.reporter_name ?? null,
        authorName: r.author_name ?? null,
        bodyExcerpt: r.body_excerpt ?? null,
        mediaUrl: r.media_url ?? null,
        reason: r.reason ?? null,
        createdAt: r.created_at,
        resolvedAt: r.resolved_at ?? null,
      }));
    },
  });
}

/** Close a report, optionally deleting the offending message in the same step. */
export function usePlatformResolveReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ reportId, deleteMessage }: { reportId: string; deleteMessage: boolean }) => {
      const s = getSupabase(); if (!s) throw new Error('Backend not configured.');
      const { error } = await s.rpc('platform_resolve_report', { p_report: reportId, p_delete_message: deleteMessage });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['platform', 'reports'] }),
  });
}

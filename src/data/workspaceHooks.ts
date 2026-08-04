import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/auth/AuthProvider';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import type { Organization, Role } from '@/types';

/**
 * Creator-facing hooks: list the workspaces a user belongs to, and create new
 * ones. Creating a workspace calls the `create_organization` RPC, which (as a
 * SECURITY DEFINER function) atomically makes the caller the OWNER — this is
 * what powers self-service, Jotform-style sign-up → build-your-own-app.
 */

export interface WorkspaceMembership {
  role: Role;
  org: Organization;
  /** The app's icon (or logo) so the card can show its brand. */
  iconUrl: string | null;
}

export function useMyWorkspaces() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['my-workspaces', user?.id],
    enabled: Boolean(user) && isSupabaseConfigured,
    queryFn: async (): Promise<WorkspaceMembership[]> => {
      const s = getSupabase();
      if (!s || !user) return [];
      const { data, error } = await s
        .from('memberships')
        .select('role, organizations(id, name, slug, created_at, app_settings(icon_url, logo_url))')
        .eq('user_id', user.id);
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).flatMap((row: any) => {
        const o = row.organizations;
        if (!o) return [];
        const set = Array.isArray(o.app_settings) ? o.app_settings[0] : o.app_settings;
        return [{
          role: row.role as Role,
          org: { id: o.id, name: o.name, slug: o.slug, createdAt: o.created_at },
          iconUrl: set?.icon_url || set?.logo_url || null,
        }];
      });
    },
  });
}

/** Turn a free-text name into a safe URL slug. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/** Rename a workspace's display name (owner/admin). */
export function useRenameWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ orgId, name }: { orgId: string; name: string }) => {
      const s = getSupabase();
      if (!s) throw new Error('Backend not configured.');
      const { error } = await s.rpc('rename_workspace', { p_org: orgId, p_name: name });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-workspaces'] }),
  });
}

/** Permanently delete a workspace and everything in it (owner only). */
export function useDeleteWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (orgId: string): Promise<void> => {
      const s = getSupabase();
      if (!s) throw new Error('Backend not configured.');
      const { error } = await s.rpc('delete_workspace', { p_org: orgId });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-workspaces'] }),
  });
}

/** Duplicate a workspace's structure into a new one (only the owner carries over). */
export function useDuplicateWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ orgId, name, slug }: { orgId: string; name: string; slug: string }): Promise<string> => {
      const s = getSupabase();
      if (!s) throw new Error('Backend not configured.');
      const { data, error } = await s.rpc('duplicate_workspace', { p_org: orgId, p_name: name, p_slug: slug });
      if (error) throw error;
      return data as string; // new slug
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-workspaces'] }),
  });
}

/** Create a workspace pre-built from a template (pages/blocks/theme + owner). */
export function useCreateWorkspaceFromTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { name: string; slug: string; settings: unknown; pages: unknown }): Promise<Organization> => {
      const s = getSupabase();
      if (!s) throw new Error('Creating a workspace requires a configured backend.');
      const { data, error } = await s.rpc('create_workspace_from_template', {
        p_name: args.name,
        p_slug: args.slug,
        p_settings: args.settings,
        p_pages: args.pages,
      });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const o = data as any;
      return { id: o.id, name: o.name, slug: o.slug, createdAt: o.created_at };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-workspaces'] }),
  });
}

export function useCreateWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, slug }: { name: string; slug: string }): Promise<Organization> => {
      const s = getSupabase();
      if (!s) throw new Error('Creating a workspace requires a configured backend.');
      const { data, error } = await s.rpc('create_organization', {
        p_name: name,
        p_slug: slug,
      });
      if (error) throw error;
      // The RPC returns the new organizations row.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const o = data as any;
      return { id: o.id, name: o.name, slug: o.slug, createdAt: o.created_at };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-workspaces'] }),
  });
}

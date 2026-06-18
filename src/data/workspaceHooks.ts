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
        .select('role, organizations(id, name, slug, created_at)')
        .eq('user_id', user.id);
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).flatMap((row: any) => {
        const o = row.organizations;
        if (!o) return [];
        return [{
          role: row.role as Role,
          org: { id: o.id, name: o.name, slug: o.slug, createdAt: o.created_at },
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

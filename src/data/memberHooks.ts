import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import type { Role } from '@/types';

export interface OrgMember {
  userId: string;
  email: string;
  name: string | null;
  role: Role;
  joinedAt: string | null;
}

/** List members (email + role) of a workspace. Owner/admin only, per RPC. */
export function useOrgMembers(orgId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['org', orgId, 'members'],
    enabled: Boolean(orgId) && enabled && isSupabaseConfigured,
    queryFn: async (): Promise<OrgMember[]> => {
      const s = getSupabase();
      if (!s || !orgId) return [];
      const { data, error } = await s.rpc('list_org_members', { p_org: orgId });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((r: any) => ({
        userId: r.user_id,
        email: r.email,
        name: r.name ?? null,
        role: r.role,
        joinedAt: r.created_at ?? null,
      }));
    },
  });
}

export function useSetMemberRole(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: Role }) => {
      const s = getSupabase();
      if (!s) throw new Error('Backend not configured.');
      const { error } = await s.rpc('set_member_role', { p_org: orgId, p_user: userId, p_role: role });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org', orgId, 'members'] }),
  });
}

export function useRemoveMember(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const s = getSupabase();
      if (!s) throw new Error('Backend not configured.');
      const { error } = await s.rpc('remove_member', { p_org: orgId, p_user: userId });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org', orgId, 'members'] }),
  });
}

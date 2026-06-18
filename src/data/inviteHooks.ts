import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import type { Role } from '@/types';

export interface Invite {
  id: string;
  code: string;
  role: Role;
  expiresAt: string | null;
}

/** List invites for a workspace (owner/admin only, per RLS). */
export function useInvites(orgId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['org', orgId, 'invites'],
    enabled: Boolean(orgId) && enabled && isSupabaseConfigured,
    queryFn: async (): Promise<Invite[]> => {
      const s = getSupabase();
      if (!s || !orgId) return [];
      const { data, error } = await s
        .from('invites')
        .select('id, code, role, expires_at')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((r: any) => ({ id: r.id, code: r.code, role: r.role, expiresAt: r.expires_at }));
    },
  });
}

export function useCreateInvite(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ role = 'viewer' as Role }: { role?: Role }) => {
      const s = getSupabase();
      if (!s) throw new Error('Backend not configured.');
      const { data, error } = await s.rpc('create_invite', { p_org: orgId, p_role: role });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org', orgId, 'invites'] }),
  });
}

export function useRedeemInvite() {
  return useMutation({
    mutationFn: async (code: string): Promise<string> => {
      const s = getSupabase();
      if (!s) throw new Error('Backend not configured.');
      const { data, error } = await s.rpc('redeem_invite', { p_code: code.trim() });
      if (error) throw error;
      return data as string; // workspace slug
    },
  });
}

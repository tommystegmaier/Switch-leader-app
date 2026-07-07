import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import type { Role } from '@/types';

export interface Invite {
  id: string;
  code: string;
  role: Role;
  email: string | null;
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
        .select('id, code, role, email, expires_at')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((r: any) => ({ id: r.id, code: r.code, role: r.role, email: r.email ?? null, expiresAt: r.expires_at }));
    },
  });
}

export function useCreateInvite(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ role = 'viewer' as Role, email }: { role?: Role; email?: string }) => {
      const s = getSupabase();
      if (!s) throw new Error('Backend not configured.');
      const { data, error } = await s.rpc('create_invite', { p_org: orgId, p_role: role, p_email: email?.trim() || null });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org', orgId, 'invites'] }),
  });
}

export interface InviteInfo {
  orgSlug: string;
  orgName: string;
  role: Role;
  email: string | null;
  valid: boolean;
}

/** Public preview of an invite code (what workspace + role it grants). */
export function useInviteInfo(code: string | undefined) {
  return useQuery({
    queryKey: ['invite-info', code],
    enabled: Boolean(code) && isSupabaseConfigured,
    queryFn: async (): Promise<InviteInfo | null> => {
      const s = getSupabase();
      if (!s || !code) return null;
      const { data, error } = await s.rpc('invite_info', { p_code: code.trim() });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) return null;
      return { orgSlug: row.org_slug, orgName: row.org_name, role: row.role, email: row.email ?? null, valid: row.valid };
    },
  });
}

/** Revoke (delete) an invite code. Owner/admin only, per RLS. */
export function useRevokeInvite(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (inviteId: string) => {
      const s = getSupabase();
      if (!s) throw new Error('Backend not configured.');
      const { error } = await s.from('invites').delete().eq('id', inviteId);
      if (error) throw error;
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

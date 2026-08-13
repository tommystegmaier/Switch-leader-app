import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import type { Role } from '@/types';

export interface OrgMember {
  userId: string;
  email: string;
  name: string | null;
  role: Role;
  joinedAt: string | null;
  birthday: string | null;
  phone: string | null;
  /** When they last opened this workspace (null = never since tracking began). */
  lastSeenAt: string | null;
}

/** List members (email + role) of a workspace. Owner/admin only, per RPC. */
export function useOrgMembers(orgId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['org', orgId, 'members'],
    enabled: Boolean(orgId) && enabled && isSupabaseConfigured,
    // "Date last opened" changes as people use the app, so this list can't be
    // fetched once and cached — watching the page would never show an update.
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
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
        birthday: r.birthday ?? null,
        phone: r.phone ?? null,
        lastSeenAt: r.last_seen_at ?? null,
      }));
    },
  });
}

/** Set of member user_ids who have push notifications on. Polls so a person's
 *  tag flips to green shortly after they enable notifications. Manager-only. */
export function useMembersWithPush(orgId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['org', orgId, 'members-push'],
    enabled: Boolean(orgId) && enabled && isSupabaseConfigured,
    refetchInterval: 20_000,
    queryFn: async (): Promise<string[]> => {
      const s = getSupabase();
      if (!s || !orgId) return [];
      const { data, error } = await s.rpc('members_with_push', { p_org: orgId });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((r: any) => r.user_id).filter(Boolean);
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

export interface MemberProfileInput { name: string; birthday: string; phone: string }

/** Owner/admin fixes a member's name / birthday / phone. */
export function useUpdateMemberProfile(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, profile }: { userId: string; profile: MemberProfileInput }) => {
      const s = getSupabase();
      if (!s) throw new Error('Backend not configured.');
      const { error } = await s.rpc('admin_update_member', {
        p_org: orgId, p_user: userId,
        p_name: profile.name, p_birthday: profile.birthday, p_phone: profile.phone,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org', orgId, 'members'] });
      qc.invalidateQueries({ queryKey: ['schedule', orgId, 'birthdays'] });
    },
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

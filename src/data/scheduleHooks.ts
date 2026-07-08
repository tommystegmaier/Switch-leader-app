import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';

/**
 * Volunteer-scheduling data layer. Managers (owner/admin/editor) read the full
 * schedule and the member list via SECURITY DEFINER RPCs; volunteers read only
 * their own assignments via my_schedule. Teams/roles are plain table CRUD gated
 * by RLS. Confirm/decline goes through respond_assignment, then a best-effort
 * push to managers via /api/schedule-notify.
 */

export interface ScheduleTeam { id: string; name: string; sort: number }
export interface ScheduleRole { id: string; teamId: string; name: string; sort: number }
export interface ScheduleMember { userId: string; name: string | null; email: string }
export interface ScheduleRow {
  id: string; serveDate: string; status: 'pending' | 'confirmed' | 'declined'; note: string | null;
  teamId: string; teamName: string; roleId: string; roleName: string;
  personId: string; personName: string | null; personEmail: string; respondedAt: string | null;
}
export interface MyAssignment {
  id: string; serveDate: string; status: 'pending' | 'confirmed' | 'declined'; note: string | null;
  teamName: string; roleName: string;
}

const KEY = (orgId: string | undefined, ...rest: string[]) => ['schedule', orgId, ...rest];

export function useScheduleTeams(orgId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: KEY(orgId, 'teams'),
    enabled: Boolean(orgId) && enabled && isSupabaseConfigured,
    queryFn: async (): Promise<ScheduleTeam[]> => {
      const s = getSupabase(); if (!s || !orgId) return [];
      const { data, error } = await s.from('schedule_teams').select('id, name, sort').eq('org_id', orgId).order('sort').order('name');
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((r: any) => ({ id: r.id, name: r.name, sort: r.sort }));
    },
  });
}

export function useScheduleRoles(orgId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: KEY(orgId, 'roles'),
    enabled: Boolean(orgId) && enabled && isSupabaseConfigured,
    queryFn: async (): Promise<ScheduleRole[]> => {
      const s = getSupabase(); if (!s || !orgId) return [];
      const { data, error } = await s.from('schedule_roles').select('id, team_id, name, sort').eq('org_id', orgId).order('sort').order('name');
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((r: any) => ({ id: r.id, teamId: r.team_id, name: r.name, sort: r.sort }));
    },
  });
}

export function useScheduleMembers(orgId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: KEY(orgId, 'members'),
    enabled: Boolean(orgId) && enabled && isSupabaseConfigured,
    queryFn: async (): Promise<ScheduleMember[]> => {
      const s = getSupabase(); if (!s || !orgId) return [];
      const { data, error } = await s.rpc('schedule_members', { p_org: orgId });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((r: any) => ({ userId: r.user_id, name: r.name ?? null, email: r.email }));
    },
  });
}

export function useFullSchedule(orgId: string | undefined, enabled: boolean, fromDate?: string) {
  return useQuery({
    queryKey: KEY(orgId, 'full', fromDate ?? 'all'),
    enabled: Boolean(orgId) && enabled && isSupabaseConfigured,
    queryFn: async (): Promise<ScheduleRow[]> => {
      const s = getSupabase(); if (!s || !orgId) return [];
      const { data, error } = await s.rpc('list_schedule', { p_org: orgId, p_from: fromDate ?? null });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((r: any) => ({
        id: r.id, serveDate: r.serve_date, status: r.status, note: r.note,
        teamId: r.team_id, teamName: r.team_name, roleId: r.role_id, roleName: r.role_name,
        personId: r.person_id, personName: r.person_name ?? null, personEmail: r.person_email, respondedAt: r.responded_at,
      }));
    },
  });
}

export function useMySchedule(orgId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: KEY(orgId, 'mine'),
    enabled: Boolean(orgId) && enabled && isSupabaseConfigured,
    queryFn: async (): Promise<MyAssignment[]> => {
      const s = getSupabase(); if (!s || !orgId) return [];
      const { data, error } = await s.rpc('my_schedule', { p_org: orgId });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((r: any) => ({ id: r.id, serveDate: r.serve_date, status: r.status, note: r.note, teamName: r.team_name, roleName: r.role_name }));
    },
  });
}

// --- mutations -------------------------------------------------------------

export function useCreateTeam(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const s = getSupabase(); if (!s) throw new Error('Backend not configured.');
      const { error } = await s.from('schedule_teams').insert({ org_id: orgId, name: name.trim() });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY(orgId, 'teams') }),
  });
}

export function useDeleteTeam(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const s = getSupabase(); if (!s) throw new Error('Backend not configured.');
      const { error } = await s.from('schedule_teams').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: KEY(orgId, 'teams') }); qc.invalidateQueries({ queryKey: KEY(orgId, 'roles') }); },
  });
}

export function useCreateRole(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ teamId, name }: { teamId: string; name: string }) => {
      const s = getSupabase(); if (!s) throw new Error('Backend not configured.');
      const { error } = await s.from('schedule_roles').insert({ org_id: orgId, team_id: teamId, name: name.trim() });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY(orgId, 'roles') }),
  });
}

export function useDeleteRole(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const s = getSupabase(); if (!s) throw new Error('Backend not configured.');
      const { error } = await s.from('schedule_roles').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY(orgId, 'roles') }),
  });
}

export function useCreateAssignment(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ roleId, userId, serveDate, note }: { roleId: string; userId: string; serveDate: string; note?: string }) => {
      const s = getSupabase(); if (!s) throw new Error('Backend not configured.');
      const { error } = await s.from('schedule_assignments').insert({ org_id: orgId, role_id: roleId, user_id: userId, serve_date: serveDate, note: note?.trim() || null });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY(orgId, 'full') }),
  });
}

export function useDeleteAssignment(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const s = getSupabase(); if (!s) throw new Error('Backend not configured.');
      const { error } = await s.from('schedule_assignments').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY(orgId, 'full') }),
  });
}

/** Volunteer confirms/declines, then best-effort notifies managers. */
export function useRespond(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'confirmed' | 'declined' }) => {
      const s = getSupabase(); if (!s) throw new Error('Backend not configured.');
      const { error } = await s.rpc('respond_assignment', { p_id: id, p_status: status });
      if (error) throw error;
      // Best-effort push to managers — never blocks the response itself.
      try {
        const { data } = await s.auth.getSession();
        const token = data.session?.access_token;
        if (token) {
          await fetch('/api/schedule-notify', {
            method: 'POST',
            headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ assignmentId: id }),
          });
        }
      } catch { /* notification is best-effort */ }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY(orgId, 'mine') }),
  });
}

// --- manager notification mute --------------------------------------------

export function useScheduleMute(orgId: string | undefined, userId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: KEY(orgId, 'mute', userId ?? ''),
    enabled: Boolean(orgId) && Boolean(userId) && enabled && isSupabaseConfigured,
    queryFn: async (): Promise<boolean> => {
      const s = getSupabase(); if (!s || !orgId || !userId) return false;
      const { data, error } = await s.from('schedule_mute').select('user_id').eq('org_id', orgId).eq('user_id', userId).maybeSingle();
      if (error) throw error;
      return Boolean(data);
    },
  });
}

export function useSetScheduleMute(orgId: string, userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (muted: boolean) => {
      const s = getSupabase(); if (!s) throw new Error('Backend not configured.');
      if (muted) {
        const { error } = await s.from('schedule_mute').upsert({ org_id: orgId, user_id: userId });
        if (error) throw error;
      } else {
        const { error } = await s.from('schedule_mute').delete().eq('org_id', orgId).eq('user_id', userId);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY(orgId, 'mute', userId) }),
  });
}

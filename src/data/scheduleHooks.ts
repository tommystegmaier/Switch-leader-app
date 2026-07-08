import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';

/**
 * Recurring-roster scheduling (v2). Managers keep a roster (people per role,
 * every week); weekly serving dates are generated from the serving weekday
 * minus the weeks-off list. Volunteers confirm/decline each upcoming week.
 * Cross-table/name reads go through SECURITY DEFINER RPCs (see migration 0017).
 */

export interface ScheduleTeam { id: string; name: string; sort: number }
export interface ScheduleRole { id: string; teamId: string; name: string; sort: number }
export interface ScheduleMember { userId: string; name: string | null; email: string }
export interface RosterEntry { roleId: string; userId: string; name: string | null; email: string }
export interface StatusEntry { roleId: string; userId: string; status: 'confirmed' | 'declined' }
export interface MyOccurrence { roleId: string; teamName: string; roleName: string; serveDate: string; status: 'pending' | 'confirmed' | 'declined' }
export interface Birthday { userId: string; name: string | null; email: string; phone: string | null; birthday: string }

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

/** The page id that holds a schedule block (if any) — used to auto-add a
 *  Schedule tab to the bottom bar. Null when no schedule block exists. */
export function useSchedulePageId(orgId: string | undefined) {
  return useQuery({
    queryKey: KEY(orgId, 'schedule-page'),
    enabled: Boolean(orgId) && isSupabaseConfigured,
    queryFn: async (): Promise<string | null> => {
      const s = getSupabase(); if (!s || !orgId) return null;
      const { data, error } = await s.from('blocks').select('page_id').eq('org_id', orgId).eq('type', 'schedule').limit(1);
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data && data[0] ? (data[0] as any).page_id : null);
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

export function useRoster(orgId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: KEY(orgId, 'roster'),
    enabled: Boolean(orgId) && enabled && isSupabaseConfigured,
    queryFn: async (): Promise<RosterEntry[]> => {
      const s = getSupabase(); if (!s || !orgId) return [];
      const { data, error } = await s.rpc('list_roster', { p_org: orgId });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((r: any) => ({ roleId: r.role_id, userId: r.user_id, name: r.name ?? null, email: r.email }));
    },
  });
}

export function useRosterStatus(orgId: string | undefined, date: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: KEY(orgId, 'status', date ?? ''),
    enabled: Boolean(orgId) && Boolean(date) && enabled && isSupabaseConfigured,
    queryFn: async (): Promise<StatusEntry[]> => {
      const s = getSupabase(); if (!s || !orgId || !date) return [];
      const { data, error } = await s.rpc('roster_status', { p_org: orgId, p_date: date });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((r: any) => ({ roleId: r.role_id, userId: r.user_id, status: r.status }));
    },
  });
}

export function useMySchedule(orgId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: KEY(orgId, 'mine'),
    enabled: Boolean(orgId) && enabled && isSupabaseConfigured,
    queryFn: async (): Promise<MyOccurrence[]> => {
      const s = getSupabase(); if (!s || !orgId) return [];
      const { data, error } = await s.rpc('my_schedule', { p_org: orgId });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((r: any) => ({ roleId: r.role_id, teamName: r.team_name, roleName: r.role_name, serveDate: r.serve_date, status: r.status }));
    },
  });
}

export function useServeWeekday(orgId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: KEY(orgId, 'config'),
    enabled: Boolean(orgId) && enabled && isSupabaseConfigured,
    queryFn: async (): Promise<number> => {
      const s = getSupabase(); if (!s || !orgId) return 0;
      const { data, error } = await s.from('schedule_config').select('serve_weekday').eq('org_id', orgId).maybeSingle();
      if (error) throw error;
      return data?.serve_weekday ?? 0;
    },
  });
}

export function useSkips(orgId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: KEY(orgId, 'skips'),
    enabled: Boolean(orgId) && enabled && isSupabaseConfigured,
    queryFn: async (): Promise<string[]> => {
      const s = getSupabase(); if (!s || !orgId) return [];
      const { data, error } = await s.from('schedule_skips').select('serve_date').eq('org_id', orgId).order('serve_date');
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((r: any) => r.serve_date);
    },
  });
}

export function useOrgBirthdays(orgId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: KEY(orgId, 'birthdays'),
    enabled: Boolean(orgId) && enabled && isSupabaseConfigured,
    queryFn: async (): Promise<Birthday[]> => {
      const s = getSupabase(); if (!s || !orgId) return [];
      const { data, error } = await s.rpc('org_birthdays', { p_org: orgId });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((r: any) => ({ userId: r.user_id, name: r.name ?? null, email: r.email, phone: r.phone ?? null, birthday: r.birthday }));
    },
  });
}

// --- mutations -------------------------------------------------------------

function invalidate(qc: ReturnType<typeof useQueryClient>, orgId: string, ...suffixes: string[]) {
  for (const s of suffixes) qc.invalidateQueries({ queryKey: KEY(orgId, s) });
}

export function useCreateTeam(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const s = getSupabase(); if (!s) throw new Error('Backend not configured.');
      const { error } = await s.from('schedule_teams').insert({ org_id: orgId, name: name.trim() });
      if (error) throw error;
    },
    onSuccess: () => invalidate(qc, orgId, 'teams'),
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
    onSuccess: () => invalidate(qc, orgId, 'teams', 'roles', 'roster'),
  });
}

/** Persist a new order by writing sort = index for each id. */
export function useReorderTeams(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const s = getSupabase(); if (!s) throw new Error('Backend not configured.');
      for (let i = 0; i < ids.length; i++) {
        const { error } = await s.from('schedule_teams').update({ sort: i }).eq('id', ids[i]);
        if (error) throw error;
      }
    },
    onSuccess: () => invalidate(qc, orgId, 'teams'),
  });
}

export function useReorderRoles(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const s = getSupabase(); if (!s) throw new Error('Backend not configured.');
      for (let i = 0; i < ids.length; i++) {
        const { error } = await s.from('schedule_roles').update({ sort: i }).eq('id', ids[i]);
        if (error) throw error;
      }
    },
    onSuccess: () => invalidate(qc, orgId, 'roles'),
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
    onSuccess: () => invalidate(qc, orgId, 'roles'),
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
    onSuccess: () => invalidate(qc, orgId, 'roles', 'roster'),
  });
}

export function useAddToRoster(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ roleId, userId }: { roleId: string; userId: string }) => {
      const s = getSupabase(); if (!s) throw new Error('Backend not configured.');
      const { error } = await s.from('schedule_roster').insert({ org_id: orgId, role_id: roleId, user_id: userId });
      if (error && !/duplicate|unique/i.test(error.message)) throw error;
    },
    onSuccess: () => invalidate(qc, orgId, 'roster'),
  });
}

export function useRemoveFromRoster(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ roleId, userId }: { roleId: string; userId: string }) => {
      const s = getSupabase(); if (!s) throw new Error('Backend not configured.');
      const { error } = await s.from('schedule_roster').delete().eq('org_id', orgId).eq('role_id', roleId).eq('user_id', userId);
      if (error) throw error;
    },
    onSuccess: () => invalidate(qc, orgId, 'roster'),
  });
}

export function useSetServeWeekday(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (weekday: number) => {
      const s = getSupabase(); if (!s) throw new Error('Backend not configured.');
      const { error } = await s.from('schedule_config').upsert({ org_id: orgId, serve_weekday: weekday });
      if (error) throw error;
    },
    onSuccess: () => invalidate(qc, orgId, 'config', 'mine', 'status'),
  });
}

export function useAddSkip(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (date: string) => {
      const s = getSupabase(); if (!s) throw new Error('Backend not configured.');
      const { error } = await s.from('schedule_skips').upsert({ org_id: orgId, serve_date: date });
      if (error) throw error;
    },
    onSuccess: () => invalidate(qc, orgId, 'skips', 'mine'),
  });
}

export function useRemoveSkip(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (date: string) => {
      const s = getSupabase(); if (!s) throw new Error('Backend not configured.');
      const { error } = await s.from('schedule_skips').delete().eq('org_id', orgId).eq('serve_date', date);
      if (error) throw error;
    },
    onSuccess: () => invalidate(qc, orgId, 'skips', 'mine'),
  });
}

/** Volunteer confirms/declines one week, then best-effort notifies managers. */
export function useRespondOccurrence(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ roleId, serveDate, status }: { roleId: string; serveDate: string; status: 'confirmed' | 'declined' }) => {
      const s = getSupabase(); if (!s) throw new Error('Backend not configured.');
      const { error } = await s.rpc('respond_occurrence', { p_role: roleId, p_date: serveDate, p_status: status });
      if (error) throw error;
      try {
        const { data } = await s.auth.getSession();
        const token = data.session?.access_token;
        if (token) {
          await fetch('/api/schedule-notify', {
            method: 'POST',
            headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ roleId, serveDate }),
          });
        }
      } catch { /* notification is best-effort */ }
    },
    onSuccess: () => invalidate(qc, orgId, 'mine'),
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

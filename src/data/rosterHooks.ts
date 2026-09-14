import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';

/**
 * Roster (org chart) data. Managers keep GROUPS and PEOPLE (free-text entries
 * with a role, optional photo, and contact info). Reads go straight against the
 * tables — RLS lets any viewer of a public workspace read, and restricts writes
 * to owner/admin/editor (see migration 0025).
 */

/**
 * Did this query fail only because a column isn't there yet?
 *
 * Code is deployed the moment it's pushed; migrations are run by hand
 * afterwards. Anything that reads a brand-new column therefore has to survive
 * the gap between the two, or the screen goes blank and looks like data loss.
 *
 * Deliberately narrow: it matches the "undefined column" code and the column
 * name, so a real failure — permissions, network, a genuine bug — still throws
 * and is still visible rather than being silently swallowed.
 */
function isMissingColumn(error: { code?: string; message?: string }, column: string): boolean {
  const code = error?.code ?? '';
  const message = (error?.message ?? '').toLowerCase();
  return (code === '42703' || message.includes('does not exist'))
    && message.includes(column.toLowerCase());
}

export interface RosterGroup { id: string; name: string; sort: number; parentId: string | null }
export interface RosterPerson {
  id: string;
  groupId: string;
  name: string;
  role: string | null;
  photoUrl: string | null;
  email: string | null;
  phone: string | null;
  /** Optional grade band this person leads — see GRADE_OPTIONS in roster.tsx. */
  grade: string | null;
  userId: string | null;
  sort: number;
}

const KEY = (orgId: string | undefined, ...rest: string[]) => ['roster', orgId, ...rest];

export type RosterKind = 'leader' | 'student';

export function useRosterGroups(orgId: string | undefined, kind: RosterKind = 'leader') {
  return useQuery({
    queryKey: KEY(orgId, 'groups', kind),
    enabled: Boolean(orgId) && isSupabaseConfigured,
    queryFn: async (): Promise<RosterGroup[]> => {
      const s = getSupabase(); if (!s || !orgId) return [];
      // Exclude auto groups (e.g. Coaches) and the "All Leaders" group — they're
      // chat-only, computed from the roster, not editable here.
      const base = () => s.from('roster_groups').select('id, name, sort, parent_id')
        .eq('org_id', orgId).is('auto_role', null).not('is_all', 'is', true)
        .order('sort').order('name');

      let { data, error } = await base().eq('kind', kind);

      // The `kind` column arrives with migration 0076, and this app deploys the
      // moment code is pushed while migrations are run by hand — so there is a
      // window where the new build is live and the column isn't there yet.
      // Without this the roster renders EMPTY, which looks exactly like the
      // data having been deleted. It hasn't been; the query just failed.
      //
      // Before the column exists every group is a leader group, so that's what
      // we fall back to, and a student roster correctly shows nothing.
      if (error && isMissingColumn(error, 'kind')) {
        if (kind === 'student') return [];
        ({ data, error } = await base());
      }
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((r: any) => ({ id: r.id, name: r.name, sort: r.sort, parentId: r.parent_id ?? null }));
    },
  });
}

export function useRosterPeople(orgId: string | undefined) {
  return useQuery({
    queryKey: KEY(orgId, 'people'),
    enabled: Boolean(orgId) && isSupabaseConfigured,
    queryFn: async (): Promise<RosterPerson[]> => {
      const s = getSupabase(); if (!s || !orgId) return [];
      const { data, error } = await s.from('roster_people').select('id, group_id, name, role, photo_url, email, phone, grade, user_id, sort').eq('org_id', orgId).order('sort').order('name');
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((r: any) => ({ id: r.id, groupId: r.group_id, name: r.name, role: r.role ?? null, photoUrl: r.photo_url ?? null, email: r.email ?? null, phone: r.phone ?? null, grade: r.grade ?? null, userId: r.user_id ?? null, sort: r.sort }));
    },
  });
}

export interface RosterRole { id: string; name: string; sort: number }

export function useRosterRoles(orgId: string | undefined, kind: RosterKind = 'leader') {
  return useQuery({
    // kind is part of the key: the leader list and the student list are
    // different lists and must not share a cache entry.
    queryKey: KEY(orgId, 'roles', kind),
    enabled: Boolean(orgId) && isSupabaseConfigured,
    queryFn: async (): Promise<RosterRole[]> => {
      const s = getSupabase(); if (!s || !orgId) return [];
      const base = () => s.from('roster_roles').select('id, name, sort')
        .eq('org_id', orgId).order('sort').order('name');
      let { data, error } = await base().eq('kind', kind);
      // `kind` arrives with 0078; tolerate the window between deploy and
      // migration rather than showing an empty dropdown. See the note on
      // isMissingColumn.
      if (error && isMissingColumn(error, 'kind')) {
        if (kind === 'student') return [];
        ({ data, error } = await base());
      }
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((r: any) => ({ id: r.id, name: r.name, sort: r.sort }));
    },
  });
}

export function useCreateRosterRole(orgId: string, kind: RosterKind = 'leader') {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const s = getSupabase(); if (!s) throw new Error('Backend not configured.');
      let { error } = await s.from('roster_roles').insert({ org_id: orgId, name: name.trim(), kind });
      if (error && isMissingColumn(error, 'kind')) {
        if (kind === 'student') throw new Error('Student titles need the latest database update to be run first.');
        ({ error } = await s.from('roster_roles').insert({ org_id: orgId, name: name.trim() }));
      }
      if (error && !/duplicate|unique/i.test(error.message)) throw error;
    },
    onSuccess: () => invalidate(qc, orgId, 'roles'),
  });
}

export function useRenameRosterRole(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const s = getSupabase(); if (!s) throw new Error('Backend not configured.');
      const { error } = await s.from('roster_roles').update({ name: name.trim() }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(qc, orgId, 'roles'),
  });
}

export function useDeleteRosterRole(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const s = getSupabase(); if (!s) throw new Error('Backend not configured.');
      const { error } = await s.from('roster_roles').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(qc, orgId, 'roles'),
  });
}

export function useReorderRosterRoles(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const s = getSupabase(); if (!s) throw new Error('Backend not configured.');
      for (let i = 0; i < ids.length; i++) {
        const { error } = await s.from('roster_roles').update({ sort: i }).eq('id', ids[i]);
        if (error) throw error;
      }
    },
    onSuccess: () => invalidate(qc, orgId, 'roles'),
  });
}

const DEFAULT_ROLE_NAMES = ['Coach', 'Group Leader', 'Hospitality', 'Check-In', 'Admin', 'Greeter', 'Safety Team', 'Photography', 'ProPresenter', 'Social Media'];
// A student group only ever needs to say who's leading it and who's in it.
const DEFAULT_STUDENT_ROLE_NAMES = ['Coach', 'Group Leader', 'Student'];

/** One-tap starter list for a workspace whose titles are still empty. */
export function useSeedRosterRoles(orgId: string, kind: RosterKind = 'leader') {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const s = getSupabase(); if (!s) throw new Error('Backend not configured.');
      const names = kind === 'student' ? DEFAULT_STUDENT_ROLE_NAMES : DEFAULT_ROLE_NAMES;
      const rows = names.map((name, i) => ({ org_id: orgId, name, sort: i, kind }));
      const { error } = await s.from('roster_roles').insert(rows);
      if (error && !/duplicate|unique/i.test(error.message)) throw error;
    },
    onSuccess: () => invalidate(qc, orgId, 'roles'),
  });
}

export interface RosterAccountOption { userId: string; name: string | null; email: string; phone: string | null }

/** App members a manager can pick from (with their sign-up phone). Manager-only. */
export function useRosterAccountOptions(orgId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: KEY(orgId, 'account-options'),
    enabled: Boolean(orgId) && enabled && isSupabaseConfigured,
    queryFn: async (): Promise<RosterAccountOption[]> => {
      const s = getSupabase(); if (!s || !orgId) return [];
      const { data, error } = await s.rpc('roster_account_options', { p_org: orgId });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((r: any) => ({ userId: r.user_id, name: r.name ?? null, email: r.email, phone: r.phone ?? null }));
    },
  });
}

function invalidate(qc: ReturnType<typeof useQueryClient>, orgId: string, ...suffixes: string[]) {
  for (const s of suffixes) qc.invalidateQueries({ queryKey: KEY(orgId, s) });
}

export function useCreateRosterGroup(orgId: string, kind: RosterKind = 'leader') {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, parentId }: { name: string; parentId?: string | null }) => {
      const s = getSupabase(); if (!s) throw new Error('Backend not configured.');
      // A group is created on the side of the app the block belongs to. Getting
      // this wrong would put a student group in Leader Messaging.
      const row = { org_id: orgId, name: name.trim(), parent_id: parentId ?? null };
      let { error } = await s.from('roster_groups').insert({ ...row, kind });
      if (error && isMissingColumn(error, 'kind')) {
        // Migration 0076 hasn't run yet. A leader group is still creatable —
        // that's what every group is before the column exists.
        if (kind === 'student') {
          throw new Error('Student groups need the Phase 3 database update to be run first.');
        }
        ({ error } = await s.from('roster_groups').insert(row));
      }
      if (error) throw error;
    },
    onSuccess: () => invalidate(qc, orgId, 'groups'),
  });
}

export function useRenameRosterGroup(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const s = getSupabase(); if (!s) throw new Error('Backend not configured.');
      const { error } = await s.from('roster_groups').update({ name: name.trim() }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(qc, orgId, 'groups'),
  });
}

export function useDeleteRosterGroup(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const s = getSupabase(); if (!s) throw new Error('Backend not configured.');
      const { error } = await s.from('roster_groups').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(qc, orgId, 'groups', 'people'),
  });
}

export function useReorderRosterGroups(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const s = getSupabase(); if (!s) throw new Error('Backend not configured.');
      for (let i = 0; i < ids.length; i++) {
        const { error } = await s.from('roster_groups').update({ sort: i }).eq('id', ids[i]);
        if (error) throw error;
      }
    },
    onSuccess: () => invalidate(qc, orgId, 'groups'),
  });
}

export interface PersonInput { name: string; role?: string | null; email?: string | null; phone?: string | null; grade?: string | null; photoUrl?: string | null; userId?: string | null }

export function useAddRosterPerson(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ groupId, person }: { groupId: string; person: PersonInput }) => {
      const s = getSupabase(); if (!s) throw new Error('Backend not configured.');
      const { error } = await s.from('roster_people').insert({
        org_id: orgId, group_id: groupId,
        name: person.name.trim(), role: person.role?.trim() || null,
        email: person.email?.trim() || null, phone: person.phone?.trim() || null, grade: person.grade?.trim() || null,
        photo_url: person.photoUrl || null, user_id: person.userId ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => invalidate(qc, orgId, 'people'),
  });
}

export function useUpdateRosterPerson(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, person }: { id: string; person: PersonInput }) => {
      const s = getSupabase(); if (!s) throw new Error('Backend not configured.');
      const { error } = await s.from('roster_people').update({
        name: person.name.trim(), role: person.role?.trim() || null,
        email: person.email?.trim() || null, phone: person.phone?.trim() || null, grade: person.grade?.trim() || null,
        photo_url: person.photoUrl || null, user_id: person.userId ?? null,
      }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(qc, orgId, 'people'),
  });
}

/** A signed-in member sets/replaces/removes their own photo across the roster. */
export function useSetMyRosterPhoto(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (photoUrl: string | null) => {
      const s = getSupabase(); if (!s) throw new Error('Backend not configured.');
      const { error } = await s.rpc('set_my_roster_photo', { p_org: orgId, p_photo: photoUrl });
      if (error) throw error;
    },
    onSuccess: () => invalidate(qc, orgId, 'people'),
  });
}

export function useDeleteRosterPerson(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const s = getSupabase(); if (!s) throw new Error('Backend not configured.');
      const { error } = await s.from('roster_people').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(qc, orgId, 'people'),
  });
}

export function useReorderRosterPeople(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const s = getSupabase(); if (!s) throw new Error('Backend not configured.');
      for (let i = 0; i < ids.length; i++) {
        const { error } = await s.from('roster_people').update({ sort: i }).eq('id', ids[i]);
        if (error) throw error;
      }
    },
    onSuccess: () => invalidate(qc, orgId, 'people'),
  });
}

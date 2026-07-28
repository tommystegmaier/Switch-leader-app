import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';

/**
 * Roster (org chart) data. Managers keep GROUPS and PEOPLE (free-text entries
 * with a role, optional photo, and contact info). Reads go straight against the
 * tables — RLS lets any viewer of a public workspace read, and restricts writes
 * to owner/admin/editor (see migration 0025).
 */

export interface RosterGroup { id: string; name: string; sort: number; parentId: string | null }
export interface RosterPerson {
  id: string;
  groupId: string;
  name: string;
  role: string | null;
  photoUrl: string | null;
  email: string | null;
  phone: string | null;
  sort: number;
}

const KEY = (orgId: string | undefined, ...rest: string[]) => ['roster', orgId, ...rest];

export function useRosterGroups(orgId: string | undefined) {
  return useQuery({
    queryKey: KEY(orgId, 'groups'),
    enabled: Boolean(orgId) && isSupabaseConfigured,
    queryFn: async (): Promise<RosterGroup[]> => {
      const s = getSupabase(); if (!s || !orgId) return [];
      const { data, error } = await s.from('roster_groups').select('id, name, sort, parent_id').eq('org_id', orgId).order('sort').order('name');
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
      const { data, error } = await s.from('roster_people').select('id, group_id, name, role, photo_url, email, phone, sort').eq('org_id', orgId).order('sort').order('name');
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((r: any) => ({ id: r.id, groupId: r.group_id, name: r.name, role: r.role ?? null, photoUrl: r.photo_url ?? null, email: r.email ?? null, phone: r.phone ?? null, sort: r.sort }));
    },
  });
}

function invalidate(qc: ReturnType<typeof useQueryClient>, orgId: string, ...suffixes: string[]) {
  for (const s of suffixes) qc.invalidateQueries({ queryKey: KEY(orgId, s) });
}

export function useCreateRosterGroup(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, parentId }: { name: string; parentId?: string | null }) => {
      const s = getSupabase(); if (!s) throw new Error('Backend not configured.');
      const { error } = await s.from('roster_groups').insert({ org_id: orgId, name: name.trim(), parent_id: parentId ?? null });
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

export interface PersonInput { name: string; role?: string | null; email?: string | null; phone?: string | null; photoUrl?: string | null }

export function useAddRosterPerson(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ groupId, person }: { groupId: string; person: PersonInput }) => {
      const s = getSupabase(); if (!s) throw new Error('Backend not configured.');
      const { error } = await s.from('roster_people').insert({
        org_id: orgId, group_id: groupId,
        name: person.name.trim(), role: person.role?.trim() || null,
        email: person.email?.trim() || null, phone: person.phone?.trim() || null,
        photo_url: person.photoUrl || null,
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
        email: person.email?.trim() || null, phone: person.phone?.trim() || null,
        photo_url: person.photoUrl || null,
      }).eq('id', id);
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

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';

export interface Student {
  userId: string;
  fullName: string;
  gradYear: number | null;
  /** Worked out from the graduation year, so it's never stale in August. */
  grade: string | null;
  birthday: string | null;
  phone: string | null;
  createdAt: string;
  /** A parent's details, for reaching someone. Collected for under-13s only. */
  parentName: string | null;
  parentPhone: string | null;
}

/** Everyone who signed up through a student link, for the leaders of that app. */
export function useStudents(orgId: string | undefined) {
  return useQuery({
    queryKey: ['students', orgId],
    enabled: Boolean(orgId) && isSupabaseConfigured,
    queryFn: async (): Promise<Student[]> => {
      const s = getSupabase();
      if (!s || !orgId) return [];
      const { data, error } = await s.rpc('list_students', { p_org: orgId });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ((data ?? []) as any[]).map((r) => ({
        userId: r.user_id,
        fullName: r.full_name,
        gradYear: r.grad_year ?? null,
        grade: r.grade ?? null,
        birthday: r.birthday ?? null,
        phone: r.phone ?? null,
        createdAt: r.created_at,
        parentName: r.parent_name ?? null,
        parentPhone: r.parent_phone ?? null,
      }));
    },
  });
}

/** A Youth Pastor or Coach corrects a student's details. */
export function useUpdateStudent(orgId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      userId: string; name?: string; gradYear?: number | null;
      birthday?: string | null; phone?: string | null;
    }) => {
      const s = getSupabase();
      if (!s) throw new Error('Not configured');
      const { error } = await s.rpc('update_student', {
        p_user: p.userId,
        p_name: p.name ?? null,
        p_grad_year: p.gradYear ?? null,
        p_birthday: p.birthday ?? null,
        p_phone: p.phone ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['students', orgId] }); },
  });
}

/**
 * Set a student a new password.
 *
 * Goes to a Function rather than the database because changing a password is
 * an admin operation. A student account has no inbox behind it, so there is no
 * "email me a reset link" — a leader has to do this one in person.
 */
export function useResetStudentPassword() {
  return useMutation({
    mutationFn: async ({ userId, password }: { userId: string; password: string }) => {
      const s = getSupabase();
      const { data: sessionRes } = s ? await s.auth.getSession() : { data: { session: null } };
      const token = sessionRes?.session?.access_token;
      if (!token) throw new Error('Please sign in again.');
      const res = await fetch('/api/student-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId, password }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; name?: string };
      if (!res.ok) throw new Error(body.error || `Server error (${res.status})`);
      return body.name ?? '';
    },
  });
}



/**
 * Delete a student's account for good.
 *
 * The re-add half of "remove and re-add" needs no code: a student account is
 * keyed to their phone number, so deleting frees that number and they simply
 * use the student sign-up link again. Leaving the account in place would mean
 * the number stayed taken and they could never sign up a second time.
 */
export function useDeleteStudent(orgId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const s = getSupabase();
      const { data: sessionRes } = s ? await s.auth.getSession() : { data: { session: null } };
      const token = sessionRes?.session?.access_token;
      if (!token) throw new Error('Please sign in again.');
      const res = await fetch('/api/delete-student', {
        method: 'POST',
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; name?: string };
      if (!res.ok) throw new Error(body.error || `Server error (${res.status})`);
      return body.name ?? '';
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['students', orgId] });
      void qc.invalidateQueries({ queryKey: ['roster', orgId] });
    },
  });
}

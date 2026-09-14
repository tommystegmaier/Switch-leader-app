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
  /** Under 13 today — worked out from the birthday, never stored. */
  under13: boolean;
  /** Under 13 AND no parent has agreed yet. Blocks being added to any group. */
  needsConsent: boolean;
  consentGrantedAt: string | null;
  consentByName: string | null;
  consentMethod: string | null;
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
        under13: Boolean(r.under_13),
        needsConsent: Boolean(r.needs_consent),
        consentGrantedAt: r.consent_granted_at ?? null,
        consentByName: r.consent_by_name ?? null,
        consentMethod: r.consent_method ?? null,
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

/** Get (or mint) the link a parent opens to give permission. */
export function useStudentConsentLink() {
  return useMutation({
    mutationFn: async (userId: string): Promise<string> => {
      const s = getSupabase();
      if (!s) throw new Error('Not configured');
      const { data, error } = await s.rpc('student_consent_link', { p_user: userId });
      if (error) throw error;
      return `${window.location.origin}/consent?token=${data as string}`;
    },
  });
}

/**
 * A leader recording permission a parent gave them in person, and withdrawing
 * it again. Withdrawing pulls the student out of every group chat, because
 * permission that can't be taken back isn't permission.
 */
export function useSetStudentConsent(orgId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, granted, note }: { userId: string; granted: boolean; note?: string }) => {
      const s = getSupabase();
      if (!s) throw new Error('Not configured');
      const { error } = granted
        ? await s.rpc('attest_student_consent', { p_user: userId, p_note: note ?? null })
        : await s.rpc('revoke_student_consent', { p_user: userId });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['students', orgId] });
      void qc.invalidateQueries({ queryKey: ['roster', orgId] });
    },
  });
}

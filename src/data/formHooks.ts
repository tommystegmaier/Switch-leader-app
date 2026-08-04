import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getSupabase } from '@/lib/supabase';

/**
 * Form block data: submit a response (any viewer of a public app), and — for
 * owners/admins — read/count/delete the responses collected by a specific form
 * block. All access goes through SECURITY DEFINER RPCs (see migration 0036).
 */

export interface FormAnswer {
  label: string;
  value: string;
}

export interface FormSubmission {
  id: string;
  data: FormAnswer[];
  submitterEmail: string | null;
  createdAt: string;
}

/** Submit a response to a form block. Works for anonymous viewers too. */
export function useSubmitForm() {
  return useMutation({
    mutationFn: async (args: {
      orgId: string;
      blockId: string;
      pageSlug?: string;
      title?: string;
      data: FormAnswer[];
      once?: boolean;
    }): Promise<void> => {
      const s = getSupabase();
      if (!s) throw new Error('Backend not configured.');
      const { error } = await s.rpc('submit_form', {
        p_org: args.orgId,
        p_block: args.blockId,
        p_page: args.pageSlug ?? null,
        p_title: args.title ?? null,
        p_data: args.data,
        p_once: Boolean(args.once),
      });
      if (error) throw error;
    },
  });
}

/** Whether the signed-in person has already submitted this form (once-per-user). */
export function useHasSubmittedForm(orgId: string | undefined, blockId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['form-submitted', orgId, blockId],
    enabled: Boolean(orgId) && Boolean(blockId) && enabled,
    queryFn: async (): Promise<boolean> => {
      const s = getSupabase();
      if (!s) return false;
      const { data, error } = await s.rpc('has_submitted_form', { p_org: orgId, p_block: blockId });
      if (error) throw error;
      return Boolean(data);
    },
  });
}

/** Number of responses a form has collected (owner/admin; drives the badge). */
export function useFormSubmissionCount(orgId: string | undefined, blockId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['form-count', orgId, blockId],
    enabled: Boolean(orgId) && Boolean(blockId) && enabled,
    refetchInterval: 30_000,
    queryFn: async (): Promise<number> => {
      const s = getSupabase();
      if (!s) return 0;
      const { data, error } = await s.rpc('count_form_submissions', { p_org: orgId, p_block: blockId });
      if (error) throw error;
      return (data as number) ?? 0;
    },
  });
}

/** Full list of responses for a form (owner/admin only). */
export function useFormSubmissions(orgId: string | undefined, blockId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['form-submissions', orgId, blockId],
    enabled: Boolean(orgId) && Boolean(blockId) && enabled,
    queryFn: async (): Promise<FormSubmission[]> => {
      const s = getSupabase();
      if (!s) return [];
      const { data, error } = await s.rpc('list_form_submissions', { p_org: orgId, p_block: blockId });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ((data ?? []) as any[]).map((r) => ({
        id: r.id,
        data: Array.isArray(r.data) ? r.data : [],
        submitterEmail: r.submitter_email ?? null,
        createdAt: r.created_at,
      }));
    },
  });
}

/** Delete one response (owner/admin only). */
export function useDeleteFormSubmission(orgId: string | undefined, blockId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const s = getSupabase();
      if (!s) throw new Error('Backend not configured.');
      const { error } = await s.rpc('delete_form_submission', { p_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['form-submissions', orgId, blockId] });
      qc.invalidateQueries({ queryKey: ['form-count', orgId, blockId] });
    },
  });
}

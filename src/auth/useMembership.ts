import { useQuery } from '@tanstack/react-query';

import { getSupabase } from '@/lib/supabase';
import type { Role } from '@/types';
import { useAuth } from './AuthProvider';

const EDITOR_ROLES: Role[] = ['owner', 'admin', 'editor'];

/**
 * Resolves the current user's role in a given workspace (or null).
 *
 * This is used ONLY to decide whether to show editor UI — it is a convenience,
 * not a security boundary. The real enforcement is Row-Level Security: even if
 * the UI were tricked into showing edit controls, the database rejects writes
 * from anyone who isn't owner/admin/editor of that org.
 */
export function useMembershipRole(orgId: string | undefined) {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ['membership', orgId, user?.id ?? 'anon'],
    enabled: Boolean(orgId) && Boolean(user),
    queryFn: async (): Promise<Role | null> => {
      const supabase = getSupabase();
      if (!supabase || !orgId || !user) return null;
      const { data, error } = await supabase
        .from('memberships')
        .select('role')
        .eq('org_id', orgId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      return (data?.role as Role | undefined) ?? null;
    },
  });

  const role = query.data ?? null;
  return {
    role,
    /** owner/admin/editor — may enter Edit Mode and write content. */
    canEdit: role !== null && EDITOR_ROLES.includes(role),
    isLoading: query.isLoading,
  };
}

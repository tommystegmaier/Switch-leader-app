import { Navigate } from 'react-router-dom';

import { useAuth } from '@/auth/AuthProvider';
import { SAMPLE_ORG_SLUG } from '@/data';
import { env } from '@/lib/env';
import { isSupabaseConfigured } from '@/lib/supabase';
import { DashboardPage } from './DashboardPage';

/**
 * The root route.
 *  - If VITE_DEFAULT_ORG_SLUG is set, this deployment IS that workspace's app:
 *    the root (and any custom domain) opens the workspace directly.
 *  - Otherwise it's the multi-tenant home (creator dashboard / sign-in).
 */
export function HomeRoute() {
  if (isSupabaseConfigured && env.defaultOrgSlug) {
    return <Navigate to={`/o/${env.defaultOrgSlug}`} replace />;
  }
  return <WorkspacesRoute />;
}

/**
 * Creator hub ("My workspaces"). Reachable at `/workspaces` even when a default
 * workspace is configured, so owners/editors can still manage their apps.
 */
export function WorkspacesRoute() {
  const { user, loading } = useAuth();

  if (!isSupabaseConfigured) {
    return <Navigate to={`/o/${SAMPLE_ORG_SLUG}`} replace />;
  }
  if (loading) {
    return <div className="p-8 text-center text-sm text-gray-500">Loading…</div>;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return <DashboardPage />;
}

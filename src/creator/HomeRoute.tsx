import { Navigate } from 'react-router-dom';

import { useAuth } from '@/auth/AuthProvider';
import { SAMPLE_ORG_SLUG } from '@/data';
import { isSupabaseConfigured } from '@/lib/supabase';
import { DashboardPage } from './DashboardPage';

/**
 * The root route. Behavior depends on context:
 *  - No backend configured (local/dev fallback) → show the bundled sample.
 *  - Signed in → the creator dashboard ("My workspaces").
 *  - Signed out → the sign-in screen.
 */
export function HomeRoute() {
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

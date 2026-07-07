import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';

import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';

/**
 * Auth context — email + password sign-in via Supabase Auth.
 *
 * Public/anonymous viewers never need this; it exists so owners/admins/editors
 * can sign in to manage a workspace. When Supabase is not configured (Phase 1
 * fallback), this provider stays in an unauthenticated, no-op state so the
 * Viewer shell still works against sample data.
 */

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  /** True when a real Supabase backend is wired up. */
  configured: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) {
      setLoading(false);
      return;
    }

    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) {
        setSession(data.session);
        setLoading(false);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    return {
      session,
      user: session?.user ?? null,
      loading,
      configured: isSupabaseConfigured,
      async signIn(email, password) {
        const supabase = getSupabase();
        if (!supabase) return { error: 'Authentication is not configured.' };
        try {
          const { error } = await supabase.auth.signInWithPassword({ email, password });
          return { error: error?.message ?? null };
        } catch (e) {
          console.error('signIn failed', e);
          return { error: describeError(e) };
        }
      },
      async signUp(email, password) {
        const supabase = getSupabase();
        if (!supabase) return { error: 'Authentication is not configured.' };
        try {
          const { error } = await supabase.auth.signUp({ email, password });
          return { error: error?.message ?? null };
        } catch (e) {
          console.error('signUp failed', e);
          return { error: describeError(e) };
        }
      },
      async signOut() {
        const supabase = getSupabase();
        if (supabase) await supabase.auth.signOut();
      },
    };
  }, [session, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Turns a thrown error into a human-friendly message. A bare "TypeError" here
 * almost always means the browser couldn't reach Supabase (bad URL, blocked
 * network, or wrong project), so we say so plainly.
 */
function describeError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/load failed|failed to fetch|networkerror|type ?error/i.test(msg)) {
    return "Couldn't reach the server — check the app's Supabase URL/key settings and your connection.";
  }
  return msg || 'Something went wrong. Please try again.';
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}

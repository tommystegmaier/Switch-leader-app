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

export interface SignUpProfile {
  name?: string;
  /** ISO date 'YYYY-MM-DD'. */
  birthday?: string;
  phone?: string;
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  /** True when a real Supabase backend is wired up. */
  configured: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  /**
   * `signedIn` reports whether the new account is already logged in — true when
   * email confirmation is off, false when a confirmation mail has been sent.
   * Callers that need to do something immediately after sign-up must branch on
   * this rather than checking the session themselves; the write is not
   * observable the instant this resolves on every device.
   */
  signUp: (email: string, password: string, profile?: SignUpProfile) => Promise<{ error: string | null; signedIn: boolean }>;
  signOut: () => Promise<void>;
  /** Email a password-reset link that returns to /reset-password. */
  sendPasswordReset: (email: string) => Promise<{ error: string | null }>;
  /** Set a new password for the currently-authenticated (recovery) session. */
  updatePassword: (password: string) => Promise<{ error: string | null }>;
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
      async signUp(email, password, profile) {
        const supabase = getSupabase();
        if (!supabase) return { error: 'Authentication is not configured.', signedIn: false };
        try {
          const data: Record<string, string> = {};
          const name = profile?.name?.trim();
          const birthday = profile?.birthday?.trim();
          const phone = profile?.phone?.trim();
          if (name) data.full_name = name;
          if (birthday) data.birthday = birthday;
          if (phone) data.phone = phone;
          const { data: res, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
              ...(Object.keys(data).length ? { data } : {}),
              // Come back to the page they signed up from. Signing up on an
              // invite link and then being sent to the site root means arriving
              // with no idea which app they were joining. (Ignored unless the
              // URL is allowed in the Supabase auth settings, so it can only
              // ever be an improvement on the default.)
              emailRedirectTo: typeof window !== 'undefined' ? window.location.href : undefined,
            },
          });
          // Whether we're signed in RIGHT NOW is the caller's key question, and
          // only this response can answer it: with email confirmation off a
          // session comes back immediately, with it on there is none. Callers
          // used to poll getSession() on a timer to guess, which lost the race
          // on a slow device and stranded people mid-join.
          return { error: error?.message ?? null, signedIn: Boolean(res?.session) };
        } catch (e) {
          console.error('signUp failed', e);
          return { error: describeError(e), signedIn: false };
        }
      },
      async signOut() {
        const supabase = getSupabase();
        if (supabase) await supabase.auth.signOut();
      },
      async sendPasswordReset(email) {
        const supabase = getSupabase();
        if (!supabase) return { error: 'Authentication is not configured.' };
        try {
          const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/reset-password`,
          });
          return { error: error?.message ?? null };
        } catch (e) {
          console.error('sendPasswordReset failed', e);
          return { error: describeError(e) };
        }
      },
      async updatePassword(password) {
        const supabase = getSupabase();
        if (!supabase) return { error: 'Authentication is not configured.' };
        try {
          const { error } = await supabase.auth.updateUser({ password });
          return { error: error?.message ?? null };
        } catch (e) {
          console.error('updatePassword failed', e);
          return { error: describeError(e) };
        }
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

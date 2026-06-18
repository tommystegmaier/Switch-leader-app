import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { env } from './env';

/**
 * The shared Supabase browser client.
 *
 * - Uses the **anon** public key. Tenant isolation and viewer read-only access
 *   are enforced by Postgres Row-Level Security (added in Phase 2), NOT by
 *   hiding the key. Anonymous visitors use this same client to read PUBLIC
 *   workspaces.
 * - Created lazily so the app (and its sample-data Viewer shell) can still run
 *   in Phase 1 before a Supabase project is configured. When env vars are
 *   missing, `getSupabase()` returns `null` and callers fall back to the
 *   sample data source.
 * - Native-ready: this is the single seam through which all data flows. A
 *   future Capacitor wrapper reuses the same SDK and storage.
 */

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!env.supabaseConfigured) return null;
  if (client) return client;

  client = createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // Detects magic-link / OAuth redirects in the URL on load.
      detectSessionInUrl: true,
    },
  });
  return client;
}

/** Whether a real Supabase backend is available in this build. */
export const isSupabaseConfigured = env.supabaseConfigured;

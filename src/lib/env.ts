/**
 * Centralised, typed access to environment variables.
 *
 * Keeping all `import.meta.env` reads in one module means the rest of the app
 * never touches raw env directly — easier to validate, mock in tests, and
 * (later) swap for Capacitor/native config. All browser-exposed vars are
 * prefixed `VITE_`.
 */

export interface AppEnv {
  supabaseUrl: string;
  supabaseAnonKey: string;
  /** True when both Supabase vars are present and look usable. */
  supabaseConfigured: boolean;
}

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL ?? '').trim();
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();

export const env: AppEnv = {
  supabaseUrl,
  supabaseAnonKey,
  supabaseConfigured: supabaseUrl.length > 0 && supabaseAnonKey.length > 0,
};

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
  /**
   * When set, this deployment behaves as a single workspace's app: the root URL
   * (and any custom domain) opens that workspace directly instead of the
   * multi-tenant home. Lets a custom domain "be" the Switch app.
   */
  defaultOrgSlug: string;
}

// Normalize: trim whitespace/newlines, and strip any trailing slash from the
// URL (a trailing "/" produces a double-slash "//auth/v1" that some setups
// reject). Also strip surrounding quotes in case they were pasted in.
function clean(v: string | undefined): string {
  return (v ?? '').trim().replace(/^["']|["']$/g, '');
}

const supabaseUrl = clean(import.meta.env.VITE_SUPABASE_URL).replace(/\/+$/, '');
const supabaseAnonKey = clean(import.meta.env.VITE_SUPABASE_ANON_KEY);

export const env: AppEnv = {
  supabaseUrl,
  supabaseAnonKey,
  supabaseConfigured: supabaseUrl.length > 0 && supabaseAnonKey.length > 0,
  defaultOrgSlug: clean(import.meta.env.VITE_DEFAULT_ORG_SLUG).toLowerCase(),
};

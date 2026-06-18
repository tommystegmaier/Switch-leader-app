import type {
  AppSettings,
  Block,
  Organization,
  Page,
} from '@/types';

/**
 * The data-layer seam.
 *
 * Everything the UI needs to render a workspace goes through this interface.
 * Phase 1 ships a `sampleContentRepository` (in-memory, no backend) so the
 * Viewer shell renders without Supabase configured. Phase 2 adds a
 * `supabaseContentRepository` implementing the same interface, backed by
 * Postgres + RLS. The UI never imports Supabase directly — keeping this clean
 * boundary is what makes the app native-ready (Capacitor) later.
 */
export interface ContentRepository {
  /** Resolve a workspace by its URL slug (`/o/{slug}`), or null if missing. */
  getOrganizationBySlug(slug: string): Promise<Organization | null>;

  /** App-level settings (name, theme, nav, access) for a workspace. */
  getAppSettings(orgId: string): Promise<AppSettings | null>;

  /**
   * Published, visible pages for a workspace, ordered by `sortOrder`.
   * (Draft/visibility filtering for editors comes in later phases.)
   */
  getPublishedPages(orgId: string): Promise<Page[]>;

  /** Blocks for one page, ordered by `sortOrder`. */
  getPageBlocks(orgId: string, pageId: string): Promise<Block[]>;
}

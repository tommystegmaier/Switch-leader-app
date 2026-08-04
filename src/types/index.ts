/**
 * Core domain types for the Team Hub platform.
 *
 * These mirror the Supabase/Postgres schema (added as SQL migrations in
 * Phase 2). Keeping them in one place lets the data layer and the UI share a
 * single source of truth. `props` payloads for individual block types are
 * defined alongside the block registry (Phase 3); here we keep the generic
 * shapes.
 */

export type Role = 'owner' | 'admin' | 'editor' | 'viewer';

export type ViewerAccess = 'public' | 'invite_only';

export type NavStyle = 'top' | 'bottom' | 'both';

/**
 * Visibility rule attached to pages and blocks. Phase 1 supports the two
 * baseline audiences; the JSON shape is intentionally open so named team
 * roles (e.g. "Safety Team") can be added later without a schema change.
 */
export type VisibilityRule =
  | { kind: 'everyone' }
  | { kind: 'admins' }
  // Forward-compatible: gate by named roles added in a later phase.
  | { kind: 'roles'; roles: string[] };

export interface Organization {
  id: string;
  name: string;
  /** Unique slug used for the per-workspace viewer URL `/o/{slug}`. */
  slug: string;
  createdAt: string;
}

export interface ThemeColors {
  background: string;
  text: string;
  primary: string;
  primaryText: string;
  accent: string;
  heading: string;
}

/** One button in the custom bottom icon bar. */
export interface NavTab {
  /** Emoji or short text icon. */
  icon: string;
  label: string;
  /** 'page' → page slug; 'url' → external link. */
  kind: 'page' | 'url';
  target: string;
  /** Only show to owner/admin/editor (e.g. a manager Schedule tab). */
  adminOnly?: boolean;
}

export interface AppSettings {
  orgId: string;
  appName: string;
  logoUrl: string | null;
  iconUrl: string | null;
  theme: ThemeColors;
  fontFamily: string;
  splash: { background: string; text: string };
  navStyle: NavStyle;
  viewerAccess: ViewerAccess;
  /** Custom bottom icon bar; empty = fall back to auto page tabs. */
  tabs: NavTab[];
}

export interface Membership {
  userId: string;
  orgId: string;
  role: Role;
}

export interface Page {
  id: string;
  orgId: string;
  name: string;
  /** Emoji or icon identifier shown in navigation. */
  icon: string | null;
  slug: string;
  sortOrder: number;
  isPublished: boolean;
  visibility: VisibilityRule;
}

export interface Section {
  id: string;
  orgId: string;
  pageId: string;
  title: string | null;
  sortOrder: number;
  collapsible: boolean;
}

/** All block types in the general creative palette (see README / Phase 3). */
export type BlockType =
  | 'heading'
  | 'paragraph'
  | 'image'
  | 'gallery'
  | 'button'
  | 'link'
  | 'card'
  | 'list'
  | 'divider'
  | 'spacer'
  | 'video'
  | 'document'
  | 'embed'
  | 'map'
  | 'qr'
  | 'countdown'
  | 'accordion'
  | 'schedule'
  | 'birthdays'
  | 'roster'
  | 'invite'
  | 'team-access';

/**
 * A single content block. `props` is an open record whose exact shape depends
 * on `type`; the block registry (Phase 3) defines and validates per-type
 * props. Storing props as JSONB keeps the palette extensible — adding a block
 * type never requires a schema migration.
 */
export interface Block<TProps = Record<string, unknown>> {
  id: string;
  orgId: string;
  pageId: string;
  sectionId: string | null;
  type: BlockType;
  sortOrder: number;
  props: TProps;
  visibility: VisibilityRule;
}

/** Per-user, per-workspace personalization. NEVER shared between users. */
export interface UserStateEntry<TValue = unknown> {
  userId: string;
  orgId: string;
  key: string;
  value: TValue;
}

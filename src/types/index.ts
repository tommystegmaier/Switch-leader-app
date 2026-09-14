/**
 * Core domain types for the Team Hub platform.
 *
 * These mirror the Supabase/Postgres schema (added as SQL migrations in
 * Phase 2). Keeping them in one place lets the data layer and the UI share a
 * single source of truth. `props` payloads for individual block types are
 * defined alongside the block registry (Phase 3); here we keep the generic
 * shapes.
 */

/**
 * Stored values, not display names. See `src/lib/roles.ts` for what each one
 * is called on screen — 'viewer' is shown as "Leader", 'admin' as "Coach".
 */
export type Role = 'owner' | 'admin' | 'editor' | 'viewer' | 'student';

export type ViewerAccess = 'public' | 'invite_only';

export type NavStyle = 'top' | 'bottom' | 'both';

/**
 * Who a page or block is for.
 *
 * 'everyone' means every signed-in member, students included — so it is NOT
 * the right default once a page carries anything leaders discuss about
 * students. 'roles' names the audiences explicitly and is what the Leaders /
 * Students choice in the page manager writes.
 */
export type VisibilityRule =
  | { kind: 'everyone' }
  | { kind: 'admins' }
  | { kind: 'roles'; roles: string[] };

export interface Organization {
  id: string;
  name: string;
  /** Unique slug used for the per-workspace viewer URL `/o/{slug}`. */
  slug: string;
  createdAt: string;
  /** Platform switch: when false, chat can't carry photos or voice messages. */
  chatMediaEnabled?: boolean;
}

export interface ThemeColors {
  background: string;
  text: string;
  primary: string;
  primaryText: string;
  accent: string;
  heading: string;
  /**
   * Multiplier for feature (block) headings — 1 = default. Lives in the theme
   * JSON so it needs no schema change, and is applied as a CSS variable.
   */
  headingScale?: number;
}

/** One button in the custom bottom icon bar. */
export interface NavTab {
  /** Emoji or short text icon. */
  icon: string;
  label: string;
  /** 'page' → page slug; 'url' → external link. */
  kind: 'page' | 'url';
  target: string;
  /**
   * Who sees this tab: 'everyone' | 'leaders' | 'students' | 'managers'.
   * Same four audiences as a page, so the tab and the page it points at are
   * described in the same words.
   */
  audience?: import('@/lib/roles').Audience;
  /**
   * The old two-way switch, kept so tabs saved before audiences existed still
   * behave. Written alongside `audience` on every save, so a phone running an
   * older build doesn't suddenly show a manager tab to everyone.
   */
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
  | 'chat'
  | 'invite'
  | 'form'
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

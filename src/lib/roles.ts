import type { Role, VisibilityRule } from '@/types';

/**
 * What each role is called, in one place.
 *
 * The names below are Switch's language. The values stored in the database are
 * NOT renamed — 'viewer' is still 'viewer' in every row, policy and function.
 * Renaming them for real would mean rewriting every RLS policy and RPC against
 * a live app with a hundred people in it, to change a word on a screen. So the
 * database keeps its vocabulary and this file translates.
 *
 * 'student' is the one genuinely new role and IS stored as 'student'.
 */
export const ROLE_LABEL: Record<Role, string> = {
  owner: 'Youth Pastor',
  admin: 'Coach',
  editor: 'Leader with edit access',
  viewer: 'Leader',
  student: 'Student',
};

/** The same names with a note on what the role can actually do. */
export const ROLE_LABEL_LONG: Record<Role, string> = {
  owner: 'Youth Pastor (full control)',
  admin: 'Coach (can edit + manage people)',
  editor: 'Leader with edit access (can edit pages)',
  viewer: 'Leader (can view and chat)',
  student: 'Student (student pages and group chats only)',
};

/**
 * Most-powerful first. Used for pickers and for sorting a member list, so the
 * order on screen never depends on which file is doing the rendering.
 */
export const ROLE_ORDER: Role[] = ['owner', 'admin', 'editor', 'viewer', 'student'];

/** Roles a person on the leader side of the app can hold. */
export const LEADER_ROLES: Role[] = ['owner', 'admin', 'editor', 'viewer'];

/** Can manage people, invites and settings. */
export function isManager(role: Role | null): boolean {
  return role === 'owner' || role === 'admin';
}

/** Can edit pages and moderate chat. */
export function canEdit(role: Role | null): boolean {
  return role === 'owner' || role === 'admin' || role === 'editor';
}

/**
 * A student. Worth its own helper rather than `role === 'student'` scattered
 * around, because the checks that matter are the ones that must never be
 * accidentally inverted.
 */
export function isStudent(role: Role | null): boolean {
  return role === 'student';
}

/** Anyone on the leader side — everything that isn't a student. */
export function isLeaderSide(role: Role | null): boolean {
  return role !== null && role !== 'student';
}

export function roleLabel(role: string | null | undefined): string {
  if (!role) return 'No access';
  return ROLE_LABEL[role as Role] ?? role;
}

// --- who a page is for ----------------------------------------------------

/**
 * The audiences offered when setting up a page, in plain language.
 *
 * These are the four that mean something to a youth ministry. The underlying
 * VisibilityRule is more general — it can name any set of roles — but a picker
 * with five checkboxes invites mistakes, and the mistake here costs privacy.
 */
export type Audience = 'everyone' | 'leaders' | 'students' | 'managers';

export const AUDIENCE_LABEL: Record<Audience, string> = {
  everyone: 'Everyone (leaders + students)',
  leaders: 'Leaders only',
  students: 'Students only',
  managers: 'Youth Pastor + Coaches only',
};

export function audienceToRule(a: Audience): VisibilityRule {
  if (a === 'everyone') return { kind: 'everyone' };
  if (a === 'managers') return { kind: 'admins' };
  if (a === 'students') return { kind: 'roles', roles: ['student'] };
  return { kind: 'roles', roles: LEADER_ROLES };
}

/**
 * Read a stored rule back as an audience.
 *
 * Anything that doesn't match one of the four is reported as 'managers' — the
 * most restrictive option — so an unrecognised rule can never be shown in the
 * picker as something more open than it actually is.
 */
export function ruleToAudience(rule: VisibilityRule | undefined): Audience {
  if (!rule || rule.kind === 'everyone') return 'everyone';
  if (rule.kind === 'admins') return 'managers';
  if (rule.kind === 'roles') {
    const set = new Set(rule.roles);
    if (set.size === 1 && set.has('student')) return 'students';
    if (LEADER_ROLES.every((r) => set.has(r)) && !set.has('student')) return 'leaders';
  }
  return 'managers';
}

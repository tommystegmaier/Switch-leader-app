import { useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';

import { useAuth } from '@/auth/AuthProvider';
import { useMembershipRole } from '@/auth/useMembership';
import { isVisibleTo } from '@/blocks/BlockView';
import { NavIcon } from '@/blocks/navIcons';
import { useAppSettings, useOrganization, usePublishedPages } from '@/data/hooks';
import { useLiveAppSettings } from '@/data/liveContent';
import { useAllPages } from '@/data/pageHooks';
import { useSchedulePageId } from '@/data/scheduleHooks';
import { useChatBlocks, useChatPageSlug, useChatUnreadTotal } from '@/data/chatHooks';
import type { NavTab } from '@/types';
import { useEditMode } from '@/editor/EditModeProvider';
import { PageManager } from '@/editor/PageManager';
import { useDiscardChanges, usePublishStatus, usePublishWorkspace } from '@/editor/usePublish';
import { applyTheme, readableTextOn } from '@/lib/theme';
import { setAppBadge } from '@/lib/badge';
import { ensurePushSubscribed } from '@/lib/push';
import { getSupabase } from '@/lib/supabase';
import { getDark, setDarkPref } from '@/lib/darkMode';
import { applyWorkspaceMetadata } from '@/lib/appMetadata';
import { forceAppUpdate } from '@/lib/appUpdate';
import { SendNotification } from '@/editor/SendNotification';
import { BlockedPeopleDialog } from './BlockedPeopleDialog';
import { DeleteAccountDialog } from './DeleteAccountDialog';
import { InstallPrompt } from './InstallPrompt';
import { NotificationPrompt } from './NotificationPrompt';
import { NotifyButton } from './NotifyButton';

/**
 * Viewer shell: top bar with app title + hamburger menu listing the workspace's
 * pages (published only for viewers; all pages, incl. drafts, for editors).
 * Optional bottom tab bar via `nav_style`. Edit controls appear only for
 * owner/admin/editor.
 */
export function ViewerLayout() {
  const { slug } = useParams<{ slug: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);
  const [pagesOpen, setPagesOpen] = useState(false);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [blockedOpen, setBlockedOpen] = useState(false);
  const [updating, setUpdating] = useState(false);

  const { data: org, isLoading: orgLoading } = useOrganization(slug);
  const { data: publishedSettings } = useAppSettings(org?.id);
  const { data: publishedPages } = usePublishedPages(org?.id);

  const { user, signOut } = useAuth();
  const { role, canEdit } = useMembershipRole(org?.id);
  const { editing, setEditing } = useEditMode();
  const liveMode = editing && canEdit;
  const { data: allPages } = useAllPages(liveMode ? org?.id : undefined);
  const { data: liveSettings } = useLiveAppSettings(org?.id, liveMode);
  const { data: schedulePageId } = useSchedulePageId(org?.id);
  const { data: chatPageSlug } = useChatPageSlug(org?.id);
  const { data: chatUnread = 0 } = useChatUnreadTotal(org?.id, Boolean(user));
  const { data: blockedPeople } = useChatBlocks(org?.id);
  const blockedCount = blockedPeople?.length ?? 0;

  // Editors preview the draft theme/title; viewers see the published one.
  const settings = liveMode ? (liveSettings ?? publishedSettings) : publishedSettings;

  // Publish workflow.
  const { data: publishStatus } = usePublishStatus(org?.id, canEdit);
  const publish = usePublishWorkspace(org?.id ?? '');
  const discard = useDiscardChanges(org?.id ?? '');
  const [dark, setDark] = useState(getDark());

  function toggleDark() {
    const next = !dark;
    setDark(next);
    setDarkPref(next);
    if (settings) applyTheme(settings, undefined, next);
  }

  // Leaving edit mode without publishing throws away the unpublished edits.
  async function onToggleEdit() {
    if (editing) {
      if (publishStatus?.dirty) {
        if (!window.confirm('Exit editing without publishing?\n\nYour unpublished changes will be discarded and the app will go back to the last published version.')) return;
        try { await discard.mutateAsync(); } catch { /* fall through and still exit */ }
      }
      setEditing(false);
    } else {
      setEditing(true);
    }
  }

  useEffect(() => {
    if (settings) applyTheme(settings);
  }, [settings]);

  // Make this workspace install to the home screen as its own app (name + icon).
  useEffect(() => {
    if (org) applyWorkspaceMetadata(org, settings ?? undefined);
  }, [org, settings]);

  useEffect(() => {
    if (!canEdit && editing) setEditing(false);
  }, [canEdit, editing, setEditing]);

  // Mirror the unread chat count onto the Home Screen app icon (PWA badge).
  useEffect(() => {
    setAppBadge(chatUnread);
  }, [chatUnread]);

  // When the app comes back to the foreground (reopened from the Home Screen),
  // refresh the unread count so the icon badge and tab dot are immediately
  // accurate — don't wait for the next poll.
  useEffect(() => {
    if (!org?.id) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        queryClient.invalidateQueries({ queryKey: ['chat', org.id] });
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [org?.id, queryClient]);

  // Record that this person opened the app, so Team & Access can show a "last
  // opened" date. The RPC only touches the caller's own row and self-throttles,
  // so it's cheap to call on every open.
  //
  // Mount alone isn't enough: reopening a Home Screen app usually RESTORES the
  // existing page rather than reloading it, so React never re-mounts and the
  // visit went unrecorded — the common "opened it, looked, closed it" case.
  // Also listen for the app returning to the foreground (and bfcache restores).
  useEffect(() => {
    if (!user || !org?.id) return;
    const orgId = org.id;
    // Retry once on failure: this is fire-and-forget, so a request cancelled by
    // the app being closed a second after opening would otherwise be lost with
    // no trace. Errors are surfaced to the console so a failing RPC (e.g. a
    // missing migration) is diagnosable instead of silently doing nothing.
    const touch = async () => {
      const s = getSupabase();
      if (!s) return;
      for (let attempt = 0; attempt < 2; attempt++) {
        const { error } = await s.rpc('touch_last_seen', { p_org: orgId });
        if (!error) return;
        if (attempt === 1) console.warn('[last-seen] could not record visit:', error.message);
      }
    };
    void touch();
    const onVisible = () => { if (document.visibilityState === 'visible') void touch(); };
    document.addEventListener('visibilitychange', onVisible);
    const onShow = () => { void touch(); };
    window.addEventListener('pageshow', onShow);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', onShow);
    };
  }, [user, org?.id]);

  // Repair this device's push subscription on every open so it carries the
  // current user_id. Chat pushes target subscriptions BY user (only the group's
  // members get a group message), so a subscription saved before we tracked the
  // user — its user_id null — would be silently skipped and that person would
  // get no banner while the app is closed. Re-registering here (idempotent,
  // best-effort, no prompt when already granted) keeps every device deliverable.
  useEffect(() => {
    if (user && org?.id) void ensurePushSubscribed(org.id);
  }, [user, org?.id]);

  if (orgLoading) return <CenteredMessage>Loading…</CenteredMessage>;

  if (!org) {
    return (
      <CenteredMessage>
        <span className="font-semibold">Workspace not found.</span>
        <span className="mt-1 block text-sm text-gray-500">Check the link and try again.</span>
        <Link to="/" className="mt-3 inline-block text-sm underline">Go to my workspaces</Link>
      </CenteredMessage>
    );
  }

  const appName = settings?.appName ?? org.name;
  const accentColor = settings?.theme?.accent || '#e23b2e';
  // Editors navigate all pages (incl. drafts); viewers only published pages
  // they're allowed to see (admins-only pages are hidden from viewers).
  const navPages = editing && canEdit
    ? (allPages ?? publishedPages ?? [])
    : (publishedPages ?? []).filter((p) => isVisibleTo(p.visibility, role));
  // Custom icon bar takes priority; otherwise a minimal default: Home + (if a
  // schedule block exists anywhere) Schedule. Both use simple line icons.
  const customTabs = (settings?.tabs ?? []).filter((t) => canEdit || !t.adminOnly);
  const firstPage = navPages[0];
  const schedulePage = (allPages ?? publishedPages ?? []).find((p) => p.id === schedulePageId);
  const autoTabs: NavTab[] = [];
  if (firstPage) autoTabs.push({ icon: 'home', label: 'Home', kind: 'page', target: firstPage.slug });
  if (schedulePage) autoTabs.push({ icon: 'calendar', label: 'Schedule', kind: 'page', target: schedulePage.slug });
  const barTabs = customTabs.length > 0 ? customTabs : autoTabs;
  const showBottomTabs = barTabs.length > 0 || (editing && canEdit);

  return (
    <div className="min-h-full" style={{ backgroundColor: 'var(--th-bg)' }}>
      <header
        className="sticky top-0 z-20 border-b"
        style={{ backgroundColor: 'var(--th-bg)', borderColor: 'var(--th-hairline)', paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="mx-auto flex max-w-screen-sm flex-wrap items-center justify-between gap-2 px-4 py-3">
          <span className="min-w-0 truncate text-lg font-bold" style={{ color: 'var(--th-heading)' }}>{appName}</span>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={toggleDark}
              aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
              className="rounded-full border p-2"
              style={{ color: 'var(--th-text)', borderColor: 'color-mix(in srgb, var(--th-text) 25%, transparent)' }}
            >
              {dark ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
                  <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z" />
                </svg>
              )}
            </button>
            {canEdit && (
              <button
                type="button"
                onClick={() => setNotifyOpen(true)}
                className="rounded-full border px-3 py-1.5 text-sm font-semibold"
                style={{ color: 'var(--th-text)', borderColor: 'var(--th-hairline-strong)' }}
              >
                🔔 Send Push Notification
              </button>
            )}
            {canEdit && (
              <button
                type="button"
                onClick={onToggleEdit}
                aria-pressed={editing}
                className="rounded-full border px-3 py-1.5 text-sm font-semibold"
                style={editing
                  ? { backgroundColor: 'var(--th-primary)', color: 'var(--th-primary-text)', borderColor: 'var(--th-primary)' }
                  : { color: 'var(--th-text)', borderColor: 'var(--th-hairline-strong)' }}
              >
                {editing ? '✓ Editing' : '✎ Edit'}
              </button>
            )}
            <button
              type="button"
              aria-label="Open menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
              className="rounded-md p-2 text-2xl leading-none focus:outline-none focus-visible:ring-2"
              style={{ color: 'var(--th-text)' }}
            >
              ☰
            </button>
          </div>
        </div>

        {editing && (
          <div className="flex flex-wrap items-center justify-center gap-2 px-4 py-1.5 text-center text-xs font-medium" style={{ backgroundColor: 'var(--th-accent)', color: '#fff' }}>
            <span className="font-semibold">Draft</span>
            <button type="button" onClick={() => setPagesOpen(true)} className="rounded-full bg-white/20 px-2 py-0.5 hover:bg-white/30">Manage pages</button>
            <Link to={`/o/${org.slug}/settings#iconbar`} className="rounded-full bg-white/20 px-2 py-0.5 hover:bg-white/30">Icon bar</Link>
            <Link to={`/o/${org.slug}/settings`} className="rounded-full bg-white/20 px-2 py-0.5 hover:bg-white/30">Settings</Link>
            <span className="mx-1 h-3 w-px bg-white/40" />
            {publishStatus?.dirty === false ? (
              <span className="opacity-90">✓ Published</span>
            ) : (
              <span className="rounded-full bg-white/25 px-2 py-0.5">● Unpublished changes</span>
            )}
            <button
              type="button"
              onClick={() => publish.mutate()}
              disabled={publish.isPending || publishStatus?.dirty === false}
              className="rounded-full px-3 py-0.5 font-semibold"
              // The draft bar is accent-colored, so a 50%-opacity white pill
              // turned muddy and unreadable in dark mode. Give the disabled
              // state its own readable treatment, and only tint the label with
              // the accent when that accent is actually dark enough to read on
              // white (readableTextOn returning white means it is).
              style={publishStatus?.dirty === false || publish.isPending
                ? { backgroundColor: 'rgba(255,255,255,0.25)', color: '#ffffff' }
                : { backgroundColor: '#ffffff', color: readableTextOn(accentColor) === '#ffffff' ? accentColor : '#0f1420' }}
            >
              {publish.isPending ? 'Publishing…' : 'Publish changes'}
            </button>
          </div>
        )}

        {menuOpen && (
          <nav className="border-t" style={{ borderColor: 'var(--th-hairline)' }} aria-label="Pages">
            <ul className="mx-auto max-w-screen-sm px-2 py-2">
              {navPages.map((page) => (
                <li key={page.id}>
                  <NavLink
                    to={`/o/${org.slug}/${page.slug}`}
                    onClick={() => setMenuOpen(false)}
                    className={({ isActive }) => `flex items-center gap-3 rounded-md px-3 py-2 text-base ${isActive ? 'font-semibold' : 'font-normal'} hover:bg-black/5`}
                    style={{ color: 'var(--th-text)' }}
                  >
                    {page.icon && <span aria-hidden>{page.icon}</span>}
                    <span>{page.name}</span>
                    {!page.isPublished && <span className="ml-auto rounded bg-black/10 px-1.5 text-xs">draft</span>}
                  </NavLink>
                </li>
              ))}
            </ul>

            {user && (
              <div className="mx-auto max-w-screen-sm border-t px-3 py-2" style={{ borderColor: 'var(--th-hairline)' }}>
                <Link
                  to="/workspaces"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-3 rounded-md px-3 py-2 text-base font-medium hover:bg-black/5"
                  style={{ color: 'var(--th-text)' }}
                >
                  <span aria-hidden>⧉</span>
                  <span>My apps</span>
                </Link>
              </div>
            )}

            <div className="mx-auto max-w-screen-sm border-t px-3 py-2" style={{ borderColor: 'var(--th-hairline)' }}>
              <NotifyButton orgId={org.id} className="mb-2" />
            </div>

            <div className="mx-auto max-w-screen-sm border-t px-3 py-2 text-sm" style={{ borderColor: 'var(--th-hairline)' }}>
              {canEdit && (
                <button type="button" onClick={() => { setMenuOpen(false); setPagesOpen(true); }} className="mr-4 underline">Manage pages</button>
              )}
              {user ? (
                <button type="button" onClick={() => { setMenuOpen(false); void signOut(); }} className="underline">Sign out ({user.email})</button>
              ) : (
                <Link to={`/login?next=${encodeURIComponent(location.pathname)}`} onClick={() => setMenuOpen(false)} className="underline">Sign in</Link>
              )}
            </div>

            {/* The fine print: which build this device is actually running (an
                installed PWA can serve a cached version for a long time, so
                without this there's no telling a stale client from a broken
                feature), the privacy policy, and account deletion.

                Deletion is required to be reachable but shouldn't invite a
                curious tap, so it sits here at the very bottom, at the same
                weight as the version string — findable when looked for, easy to
                scroll past when not. The confirmation is what actually guards
                it. */}
            <div className="mx-auto flex max-w-screen-sm flex-wrap items-center gap-x-3 gap-y-1 px-3 pb-2 text-[0.65rem]" style={{ color: 'var(--th-text)', opacity: 0.45 }}>
              {/* Tapping the version forces this device onto the newest build.
                  The automatic check usually gets there first, but a suspended
                  home-screen app or a desktop tab left open for hours can sit
                  on old code, which is indistinguishable from a feature never
                  having shipped. This is the one thing to tell someone to try. */}
              <button
                type="button"
                onClick={() => { setUpdating(true); void forceAppUpdate(); }}
                className="underline"
                title="Reload the app on the newest version"
              >
                {updating ? 'Updating…' : `Version ${new Date(__BUILD_TIME__).toLocaleString()}`}
              </button>
              <Link to="/privacy" onClick={() => setMenuOpen(false)} className="underline">Privacy</Link>
              {/* Only once there's something to manage — for almost everyone
                  this never appears, and an empty "Hidden people" entry would
                  be a standing invitation to wonder who's in it. */}
              {user && blockedCount > 0 && (
                <button type="button" onClick={() => { setMenuOpen(false); setBlockedOpen(true); }} className="underline">
                  Hidden people ({blockedCount})
                </button>
              )}
              {user && (
                <button type="button" onClick={() => { setMenuOpen(false); setDeleteAccountOpen(true); }} className="underline">
                  Delete account
                </button>
              )}
            </div>
          </nav>
        )}
      </header>

      <main className="mx-auto max-w-screen-sm px-4 py-6" style={showBottomTabs ? { paddingBottom: 'calc(env(safe-area-inset-bottom) + 7rem)' } : undefined}>
        <Outlet />
      </main>

      {showBottomTabs && !menuOpen && (
        <nav
          className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex justify-center px-3"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.6rem)' }}
          aria-label="Bottom navigation"
        >
          <ul
            className="pointer-events-auto flex w-full max-w-sm items-stretch justify-around gap-1 overflow-hidden rounded-full border p-1.5"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--th-bg) 45%, transparent)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              borderColor: 'rgba(127,127,127,0.22)',
              boxShadow: '0 2px 10px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.06)',
            }}
          >
            {editing && canEdit ? (
              <li className="flex min-w-0 flex-1 justify-center">
                <Link to={`/o/${org.slug}/settings#iconbar`} className={tabCls(false)} style={{ color: 'var(--th-text)' }}>
                  <NavIcon name="grid" className="h-6 w-6" />
                  <span className={tabLabelCls}>Edit icon bar</span>
                </Link>
              </li>
            ) : (
              barTabs.map((tab, i) => (
                <li key={i} className="flex min-w-0 flex-1 justify-center">
                  {tab.kind === 'url' ? (
                    <a href={tab.target || '#'} target="_blank" rel="noopener noreferrer" className={tabCls(false)} style={{ color: 'var(--th-text)' }}>
                      <NavIcon name={tab.icon} className="h-6 w-6" />
                      <span className={tabLabelCls}>{tab.label}</span>
                    </a>
                  ) : (
                    <TabLink to={`/o/${org.slug}/${tab.target}`} icon={tab.icon} label={tab.label} badge={chatPageSlug && tab.target === chatPageSlug ? chatUnread : 0} />
                  )}
                </li>
              ))
            )}
          </ul>
        </nav>
      )}

      {!editing && <InstallPrompt appName={appName} slug={org.slug} orgId={org.id} />}
      {!editing && <NotificationPrompt appName={appName} orgId={org.id} />}

      {notifyOpen && canEdit && (
        <SendNotification orgId={org.id} orgSlug={org.slug} onClose={() => setNotifyOpen(false)} />
      )}

      {pagesOpen && canEdit && (
        <PageManager
          orgId={org.id}
          pages={allPages ?? []}
          currentSlug={location.pathname.split('/')[3]}
          onNavigate={(s) => navigate(`/o/${org.slug}/${s}`)}
          onClose={() => setPagesOpen(false)}
        />
      )}

      {blockedOpen && <BlockedPeopleDialog orgId={org.id} onClose={() => setBlockedOpen(false)} />}
      {deleteAccountOpen && <DeleteAccountDialog onClose={() => setDeleteAccountOpen(false)} />}
    </div>
  );
}

/** Shared classes for a bottom-bar tab. The tab hugs its content (icon or the
 *  wrapped label, whichever is wider) with padding, and the active "bubble" is
 *  this element's rounded background — kept inside the pill by overflow-hidden. */
function tabCls(active: boolean): string {
  return `inline-flex max-w-full flex-col items-center justify-center gap-0.5 rounded-full px-3 py-1.5 text-center ${active ? 'font-semibold' : 'opacity-70'}`;
}

const tabLabelCls = 'line-clamp-2 break-words text-[10px] leading-tight';

/** A bottom-bar tab that links to an in-app page, with the active "bubble".
 *  Shows a red unread badge (used by the chat page) when `badge` > 0. */
function TabLink({ to, icon, label, badge = 0 }: { to: string; icon: string; label: string; badge?: number }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) => tabCls(isActive)}
      style={({ isActive }) => ({ color: 'var(--th-text)', backgroundColor: isActive ? 'rgba(127,127,127,0.18)' : 'transparent' })}
    >
      <span className="relative">
        <NavIcon name={icon} className="h-6 w-6" />
        {badge > 0 && (
          <span className="absolute -right-2 -top-1.5 inline-flex min-w-[1.05rem] items-center justify-center rounded-full bg-red-500 px-1 text-[0.6rem] font-bold leading-none text-white" style={{ height: '1.05rem' }}>
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </span>
      <span className={tabLabelCls}>{label}</span>
    </NavLink>
  );
}

function CenteredMessage({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-6 text-center">
      <div>{children}</div>
    </div>
  );
}

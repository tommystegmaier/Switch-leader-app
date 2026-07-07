import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';

import { useAuth } from '@/auth/AuthProvider';
import { useMembershipRole } from '@/auth/useMembership';
import { isVisibleTo } from '@/blocks/BlockView';
import { useAppSettings, useOrganization, usePublishedPages } from '@/data/hooks';
import { useLiveAppSettings } from '@/data/liveContent';
import { useAllPages } from '@/data/pageHooks';
import { useEditMode } from '@/editor/EditModeProvider';
import { PageManager } from '@/editor/PageManager';
import { usePublishStatus, usePublishWorkspace } from '@/editor/usePublish';
import { applyTheme } from '@/lib/theme';
import { applyWorkspaceMetadata } from '@/lib/appMetadata';
import { SendNotification } from '@/editor/SendNotification';
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [pagesOpen, setPagesOpen] = useState(false);
  const [notifyOpen, setNotifyOpen] = useState(false);

  const { data: org, isLoading: orgLoading } = useOrganization(slug);
  const { data: publishedSettings } = useAppSettings(org?.id);
  const { data: publishedPages } = usePublishedPages(org?.id);

  const { user, signOut } = useAuth();
  const { role, canEdit } = useMembershipRole(org?.id);
  const { editing, toggle, setEditing } = useEditMode();
  const liveMode = editing && canEdit;
  const { data: allPages } = useAllPages(liveMode ? org?.id : undefined);
  const { data: liveSettings } = useLiveAppSettings(org?.id, liveMode);

  // Editors preview the draft theme/title; viewers see the published one.
  const settings = liveMode ? (liveSettings ?? publishedSettings) : publishedSettings;

  // Publish workflow.
  const { data: publishStatus } = usePublishStatus(org?.id, canEdit);
  const publish = usePublishWorkspace(org?.id ?? '');

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
  // Editors navigate all pages (incl. drafts); viewers only published pages
  // they're allowed to see (admins-only pages are hidden from viewers).
  const navPages = editing && canEdit
    ? (allPages ?? publishedPages ?? [])
    : (publishedPages ?? []).filter((p) => isVisibleTo(p.visibility, role));
  const navStyle = settings?.navStyle ?? 'top';
  const showBottomTabs = navStyle === 'bottom' || navStyle === 'both';
  const bottomPages = navPages.slice(0, 5);

  return (
    <div className="min-h-full" style={{ backgroundColor: 'var(--th-bg)' }}>
      <header
        className="sticky top-0 z-20 border-b"
        style={{ backgroundColor: 'var(--th-bg)', borderColor: 'rgba(0,0,0,0.08)', paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="mx-auto flex max-w-screen-sm flex-wrap items-center justify-between gap-2 px-4 py-3">
          <span className="min-w-0 truncate text-lg font-bold" style={{ color: 'var(--th-heading)' }}>{appName}</span>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {canEdit && (
              <button
                type="button"
                onClick={() => setNotifyOpen(true)}
                className="rounded-full border px-3 py-1.5 text-sm font-semibold"
                style={{ color: 'var(--th-text)', borderColor: 'rgba(0,0,0,0.2)' }}
              >
                🔔 Send Push Notification
              </button>
            )}
            {canEdit && (
              <button
                type="button"
                onClick={toggle}
                aria-pressed={editing}
                className="rounded-full border px-3 py-1.5 text-sm font-semibold"
                style={editing
                  ? { backgroundColor: 'var(--th-primary)', color: 'var(--th-primary-text)', borderColor: 'var(--th-primary)' }
                  : { color: 'var(--th-text)', borderColor: 'rgba(0,0,0,0.2)' }}
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
              className="rounded-full bg-white px-3 py-0.5 font-semibold disabled:opacity-50"
              style={{ color: 'var(--th-accent)' }}
            >
              {publish.isPending ? 'Publishing…' : 'Publish changes'}
            </button>
          </div>
        )}

        {menuOpen && (
          <nav className="border-t" style={{ borderColor: 'rgba(0,0,0,0.08)' }} aria-label="Pages">
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

            <div className="mx-auto max-w-screen-sm border-t px-3 py-2" style={{ borderColor: 'rgba(0,0,0,0.08)' }}>
              <NotifyButton orgId={org.id} className="mb-2" />
            </div>

            <div className="mx-auto max-w-screen-sm border-t px-3 py-2 text-sm" style={{ borderColor: 'rgba(0,0,0,0.08)' }}>
              {canEdit && (
                <button type="button" onClick={() => { setMenuOpen(false); setPagesOpen(true); }} className="mr-4 underline">Manage pages</button>
              )}
              {user ? (
                <button type="button" onClick={() => { setMenuOpen(false); void signOut(); }} className="underline">Sign out ({user.email})</button>
              ) : (
                <Link to={`/login?next=${encodeURIComponent(location.pathname)}`} onClick={() => setMenuOpen(false)} className="underline">Admin sign in</Link>
              )}
            </div>
          </nav>
        )}
      </header>

      <main className={`mx-auto max-w-screen-sm px-4 py-6 ${showBottomTabs ? 'pb-24' : ''}`}>
        <Outlet />
      </main>

      {showBottomTabs && bottomPages.length > 0 && (
        <nav
          className="fixed inset-x-0 bottom-0 z-20 border-t"
          style={{ backgroundColor: 'var(--th-bg)', borderColor: 'rgba(0,0,0,0.08)', paddingBottom: 'env(safe-area-inset-bottom)' }}
          aria-label="Bottom navigation"
        >
          <ul className="mx-auto flex max-w-screen-sm items-stretch justify-around">
            {bottomPages.map((page) => (
              <li key={page.id} className="flex-1">
                <NavLink
                  to={`/o/${org.slug}/${page.slug}`}
                  className={({ isActive }) => `flex flex-col items-center gap-0.5 px-1 py-2 text-xs ${isActive ? 'font-semibold' : 'opacity-70'}`}
                  style={{ color: 'var(--th-text)' }}
                >
                  <span className="text-lg" aria-hidden>{page.icon || '•'}</span>
                  <span className="max-w-full truncate">{page.name}</span>
                </NavLink>
              </li>
            ))}
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
    </div>
  );
}

function CenteredMessage({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-6 text-center">
      <div>{children}</div>
    </div>
  );
}

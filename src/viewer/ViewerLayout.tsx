import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useParams } from 'react-router-dom';

import { useAuth } from '@/auth/AuthProvider';
import { useMembershipRole } from '@/auth/useMembership';
import { useAppSettings, useOrganization, usePublishedPages } from '@/data/hooks';
import { useEditMode } from '@/editor/EditModeProvider';
import { applyTheme } from '@/lib/theme';

/**
 * Viewer shell: top bar with app title + a hamburger menu listing the
 * workspace's published pages. Mobile-first, single column, read-only.
 *
 * Edit controls do not exist here at all — this is the public/viewer surface.
 * The Editor overlay (Phase 3+) is a separate concern layered on the same
 * rendering components.
 */
export function ViewerLayout() {
  const { slug } = useParams<{ slug: string }>();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const { data: org, isLoading: orgLoading } = useOrganization(slug);
  const { data: settings } = useAppSettings(org?.id);
  const { data: pages } = usePublishedPages(org?.id);

  const { user, signOut } = useAuth();
  const { canEdit } = useMembershipRole(org?.id);
  const { editing, toggle, setEditing } = useEditMode();

  // Apply the workspace theme to CSS variables whenever settings load.
  useEffect(() => {
    if (settings) applyTheme(settings);
  }, [settings]);

  // Never leave Edit Mode "on" for someone who can't edit (e.g. after sign-out).
  useEffect(() => {
    if (!canEdit && editing) setEditing(false);
  }, [canEdit, editing, setEditing]);

  if (orgLoading) {
    return <CenteredMessage>Loading…</CenteredMessage>;
  }

  if (!org) {
    return (
      <CenteredMessage>
        <span className="font-semibold">Workspace not found.</span>
        <span className="mt-1 block text-sm text-gray-500">
          Check the link and try again.
        </span>
      </CenteredMessage>
    );
  }

  const appName = settings?.appName ?? org.name;

  return (
    <div className="min-h-full" style={{ backgroundColor: 'var(--th-bg)' }}>
      <header
        className="sticky top-0 z-20 border-b"
        style={{
          backgroundColor: 'var(--th-bg)',
          borderColor: 'rgba(0,0,0,0.08)',
          paddingTop: 'env(safe-area-inset-top)',
        }}
      >
        <div className="mx-auto flex max-w-screen-sm items-center justify-between px-4 py-3">
          <span className="text-lg font-bold" style={{ color: 'var(--th-heading)' }}>
            {appName}
          </span>
          <div className="flex items-center gap-2">
            {/* Edit toggle is rendered ONLY for owner/admin/editor of this
                workspace. Viewers and anonymous visitors never see it. */}
            {canEdit && (
              <button
                type="button"
                onClick={toggle}
                aria-pressed={editing}
                className="rounded-full border px-3 py-1.5 text-sm font-semibold"
                style={
                  editing
                    ? { backgroundColor: 'var(--th-primary)', color: 'var(--th-primary-text)', borderColor: 'var(--th-primary)' }
                    : { color: 'var(--th-text)', borderColor: 'rgba(0,0,0,0.2)' }
                }
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
          <div
            className="px-4 py-1.5 text-center text-xs font-medium"
            style={{ backgroundColor: 'var(--th-accent)', color: '#fff' }}
          >
            Edit Mode — in-place editing tools arrive in Phase 3
          </div>
        )}

        {menuOpen && (
          <nav
            className="border-t"
            style={{ borderColor: 'rgba(0,0,0,0.08)' }}
            aria-label="Pages"
          >
            <ul className="mx-auto max-w-screen-sm px-2 py-2">
              {(pages ?? []).map((page) => (
                <li key={page.id}>
                  <NavLink
                    to={`/o/${org.slug}/${page.slug}`}
                    onClick={() => setMenuOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-3 rounded-md px-3 py-2 text-base ${
                        isActive ? 'font-semibold' : 'font-normal'
                      } hover:bg-black/5`
                    }
                    style={{ color: 'var(--th-text)' }}
                  >
                    {page.icon && <span aria-hidden>{page.icon}</span>}
                    <span>{page.name}</span>
                  </NavLink>
                </li>
              ))}
            </ul>

            {/* Account row: sign in (for admins) or sign out. */}
            <div
              className="mx-auto max-w-screen-sm border-t px-3 py-2 text-sm"
              style={{ borderColor: 'rgba(0,0,0,0.08)' }}
            >
              {user ? (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    void signOut();
                  }}
                  className="underline"
                >
                  Sign out ({user.email})
                </button>
              ) : (
                <Link
                  to={`/login?next=${encodeURIComponent(location.pathname)}`}
                  onClick={() => setMenuOpen(false)}
                  className="underline"
                >
                  Admin sign in
                </Link>
              )}
            </div>
          </nav>
        )}
      </header>

      <main className="mx-auto max-w-screen-sm px-4 py-6">
        <Outlet />
      </main>
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

import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useParams } from 'react-router-dom';

import { useAppSettings, useOrganization, usePublishedPages } from '@/data/hooks';
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
  const [menuOpen, setMenuOpen] = useState(false);

  const { data: org, isLoading: orgLoading } = useOrganization(slug);
  const { data: settings } = useAppSettings(org?.id);
  const { data: pages } = usePublishedPages(org?.id);

  // Apply the workspace theme to CSS variables whenever settings load.
  useEffect(() => {
    if (settings) applyTheme(settings);
  }, [settings]);

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

import { Link } from 'react-router-dom';

import { useAuth } from '@/auth/AuthProvider';
import { useMyWorkspaces } from '@/data/workspaceHooks';

/**
 * "My Workspaces" — the creator home. Lists every app the signed-in user
 * belongs to (with their role) and offers a Create button. This is the
 * Jotform-style hub: one account, many apps, each fully isolated.
 */
export function DashboardPage() {
  const { user, signOut } = useAuth();
  const { data: workspaces, isLoading } = useMyWorkspaces();

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--th-heading)' }}>
          My workspaces
        </h1>
        <button type="button" onClick={() => void signOut()} className="text-sm text-gray-500 underline">
          Sign out
        </button>
      </div>
      <p className="mb-6 text-sm text-gray-500">Signed in as {user?.email}</p>

      {isLoading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : workspaces && workspaces.length > 0 ? (
        <ul className="mb-6 flex flex-col gap-3">
          {workspaces.map(({ org, role }) => (
            <li key={org.id}>
              <Link
                to={`/o/${org.slug}`}
                className="flex items-center justify-between rounded-xl border p-4 hover:bg-black/5"
                style={{ borderColor: 'rgba(0,0,0,0.12)' }}
              >
                <span>
                  <span className="block font-semibold">{org.name}</span>
                  <span className="block text-sm text-gray-500">/o/{org.slug}</span>
                </span>
                <span className="rounded-full bg-black/5 px-3 py-1 text-xs font-medium capitalize">{role}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mb-6 rounded-xl border border-dashed p-8 text-center text-sm text-gray-500" style={{ borderColor: 'rgba(0,0,0,0.2)' }}>
          You don&apos;t have any apps yet. Create your first one!
        </div>
      )}

      <Link
        to="/new"
        className="inline-block rounded-full px-6 py-3 font-semibold"
        style={{ backgroundColor: 'var(--th-primary)', color: 'var(--th-primary-text)' }}
      >
        + Create a new app
      </Link>
    </div>
  );
}

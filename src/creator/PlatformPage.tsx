import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { useAuth } from '@/auth/AuthProvider';
import { errorMessage } from '@/lib/errors';
import {
  useIsPlatformAdmin, usePlatformApps, usePlatformDeleteApp, usePlatformJoinApp,
  usePlatformSetUserDisabled, type PlatformApp,
} from '@/data/platformHooks';

/**
 * Platform command center — for the owner of the WHOLE platform (the
 * platform_admins allowlist), not per-app owners. See every app, who made it,
 * open any app to troubleshoot, delete apps, and disable accounts. Everything
 * here is also enforced server-side, so this page is just the control surface.
 */
export function PlatformPage() {
  const { user, loading } = useAuth();
  const { data: isAdmin, isLoading: adminLoading } = useIsPlatformAdmin(Boolean(user));
  const { data: apps, isLoading: appsLoading } = usePlatformApps(Boolean(user) && isAdmin === true);

  if (loading || (user && adminLoading)) {
    return <Centered>Loading…</Centered>;
  }
  if (!user) {
    return <Centered><span className="font-semibold">Please sign in.</span><Link to="/login?next=/platform" className="mt-2 block text-sm underline">Sign in</Link></Centered>;
  }
  if (!isAdmin) {
    return <Centered><span className="font-semibold">Not authorized</span><span className="mt-1 block text-sm text-gray-500">This area is for the platform owner only.</span><Link to="/" className="mt-3 inline-block text-sm underline">Go home</Link></Centered>;
  }

  const list = apps ?? [];
  return (
    <div className="mx-auto max-w-3xl px-4 pb-10" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1.75rem)' }}>
      <div className="mb-1 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--th-heading)' }}>⚡ Command center</h1>
        <Link to="/workspaces" className="text-sm text-gray-500 underline">My apps</Link>
      </div>
      <p className="mb-6 text-sm text-gray-500">Every app on the platform. You can open any one to troubleshoot, delete it, or disable an owner&apos;s account.</p>

      {appsLoading ? (
        <p className="text-sm text-gray-500">Loading apps…</p>
      ) : list.length === 0 ? (
        <p className="text-sm text-gray-500">No apps yet.</p>
      ) : (
        <>
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-gray-400">{list.length} app{list.length === 1 ? '' : 's'}</p>
          <ul className="flex flex-col gap-3">
            {list.map((a) => <AppRow key={a.orgId} app={a} />)}
          </ul>
        </>
      )}
    </div>
  );
}

function AppRow({ app }: { app: PlatformApp }) {
  const navigate = useNavigate();
  const join = usePlatformJoinApp();
  const del = usePlatformDeleteApp();
  const setDisabled = usePlatformSetUserDisabled();
  const [confirming, setConfirming] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const created = new Date(app.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

  async function openAndManage() {
    setError(null);
    try {
      const slug = await join.mutateAsync(app.orgId);
      navigate(`/o/${slug}`);
    } catch (e) { setError(errorMessage(e)); }
  }

  async function runDelete() {
    setError(null);
    try { await del.mutateAsync(app.orgId); }
    catch (e) { setError(errorMessage(e)); }
  }

  return (
    <li className="rounded-xl border p-4" style={{ borderColor: 'var(--th-hairline)' }}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold" style={{ color: 'var(--th-heading)' }}>{app.appName}</p>
          <p className="truncate text-sm text-gray-500">/o/{app.slug} · {app.memberCount} member{app.memberCount === 1 ? '' : 's'} · created {created}</p>
        </div>
      </div>

      {/* Owners */}
      <div className="mt-3 flex flex-col gap-1.5">
        {app.owners.length === 0 && <p className="text-xs text-gray-400">No owner on record.</p>}
        {app.owners.map((o) => (
          <div key={o.user_id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="min-w-0 truncate">
              👤 {o.email ?? 'unknown'}
              {o.banned && <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">disabled</span>}
            </span>
            <button
              type="button"
              onClick={() => { setError(null); setDisabled.mutate({ userId: o.user_id, disable: !o.banned }, { onError: (e) => setError(errorMessage(e)) }); }}
              disabled={setDisabled.isPending}
              className="shrink-0 rounded-full border px-3 py-1 text-xs font-semibold disabled:opacity-50"
              style={{ borderColor: o.banned ? 'var(--th-hairline-strong)' : 'rgba(220,38,38,0.4)', color: o.banned ? 'var(--th-text)' : '#dc2626' }}
            >
              {o.banned ? 'Re-enable account' : 'Disable account'}
            </button>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={openAndManage} disabled={join.isPending} className="rounded-full px-4 py-1.5 text-xs font-semibold disabled:opacity-50" style={{ backgroundColor: 'var(--th-primary)', color: 'var(--th-primary-text)' }}>
          {join.isPending ? 'Opening…' : 'Open & manage'}
        </button>
        <button type="button" onClick={() => { setConfirming((v) => !v); setConfirmText(''); setError(null); }} className="rounded-full border px-4 py-1.5 text-xs font-semibold text-red-600" style={{ borderColor: 'rgba(220,38,38,0.4)' }}>
          Delete app
        </button>
      </div>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      {confirming && (
        <div className="mt-3 flex flex-col gap-2 border-t pt-3" style={{ borderColor: 'var(--th-hairline)' }}>
          <p className="text-xs text-gray-500">Permanently delete <strong>{app.appName}</strong> and everything in it. This cannot be undone. Type the app name to confirm.</p>
          <input className="rounded-md border px-3 py-2 text-sm" style={{ borderColor: 'var(--th-hairline-strong)' }} placeholder={app.appName} value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
          <div className="flex gap-2">
            <button type="button" onClick={() => void runDelete()} disabled={del.isPending || confirmText.trim() !== app.appName.trim()} className="rounded-full px-4 py-2 text-sm font-semibold text-white disabled:opacity-40" style={{ backgroundColor: '#dc2626' }}>
              {del.isPending ? 'Deleting…' : 'Delete forever'}
            </button>
            <button type="button" onClick={() => setConfirming(false)} className="rounded-full px-4 py-2 text-sm">Cancel</button>
          </div>
        </div>
      )}
    </li>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center p-6 text-center"><div>{children}</div></div>;
}

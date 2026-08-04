import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { useAuth } from '@/auth/AuthProvider';
import { applyHubMetadata } from '@/lib/appMetadata';
import { errorMessage } from '@/lib/errors';
import { slugify, useDeleteWorkspace, useDuplicateWorkspace, useMyWorkspaces, useRenameWorkspace, type WorkspaceMembership } from '@/data/workspaceHooks';

/**
 * "My Workspaces" — the creator home. Lists every app the signed-in user
 * belongs to (with their role) and offers Create + Duplicate. This is the
 * Jotform-style hub: one account, many apps, each fully isolated.
 */
export function DashboardPage({ redirectSingle = false }: { redirectSingle?: boolean }) {
  const { user, signOut } = useAuth();
  const { data: workspaces, isLoading } = useMyWorkspaces();
  const navigate = useNavigate();
  useEffect(() => { applyHubMetadata(); }, []);

  // Only when this hub is the app's initial landing (root route) do we skip it
  // for single-app users and drop them straight into their app. When someone
  // deliberately opens "My apps" from the menu (/workspaces), we always show the
  // hub — even view-only users with a single app — so they can reach it.
  const skipToSingle = redirectSingle && workspaces?.length === 1;
  useEffect(() => {
    if (skipToSingle && workspaces) {
      navigate(`/o/${workspaces[0].org.slug}`, { replace: true });
    }
  }, [skipToSingle, workspaces, navigate]);

  const list = workspaces ?? [];
  const hasApps = list.length > 0;
  const multiple = list.length > 1;

  // While we redirect a single-app user, don't flash the hub.
  if (isLoading || skipToSingle) {
    return <div className="mx-auto max-w-2xl px-4 pb-8 text-sm text-gray-500" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1.75rem)' }}>Opening your app…</div>;
  }

  return (
    <div className="mx-auto max-w-2xl px-4 pb-8" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1.75rem)' }}>
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--th-heading)' }}>My workspaces</h1>
        <div className="flex shrink-0 items-center gap-3 text-sm">
          {multiple && <Link to="/new" className="text-gray-500 underline">Create an app</Link>}
          <button type="button" onClick={() => void signOut()} className="text-gray-500 underline">Sign out</button>
        </div>
      </div>
      <p className="mb-6 text-sm text-gray-500">Signed in as {user?.email}</p>

      {hasApps ? (
        <ul className="mb-6 flex flex-col gap-3">
          {list.map((w) => <WorkspaceCard key={w.org.id} w={w} />)}
        </ul>
      ) : (
        <>
          <div className="mb-6 rounded-xl border border-dashed p-8 text-center text-sm text-gray-500" style={{ borderColor: 'var(--th-hairline-strong)' }}>
            You don&apos;t have any apps yet. Create your first one!
          </div>
          <Link to="/new" className="inline-block rounded-full px-6 py-3 font-semibold" style={{ backgroundColor: 'var(--th-primary)', color: 'var(--th-primary-text)' }}>
            + Create a new app
          </Link>
        </>
      )}
    </div>
  );
}

/** The app's logo/icon (or an initial fallback) for a workspace card. */
function WorkspaceLogo({ name, iconUrl }: { name: string; iconUrl: string | null }) {
  if (iconUrl) {
    return <img src={iconUrl} alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover" />;
  }
  return (
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-base font-bold text-white" style={{ backgroundColor: 'var(--th-primary)' }}>
      {(name.trim()[0] || '?').toUpperCase()}
    </span>
  );
}

function WorkspaceCard({ w }: { w: WorkspaceMembership }) {
  const { org, role, iconUrl } = w;
  const navigate = useNavigate();
  const duplicate = useDuplicateWorkspace();
  const rename = useRenameWorkspace();
  const del = useDeleteWorkspace();
  const canManage = role === 'owner' || role === 'admin';
  const canDuplicate = canManage;
  const isOwner = role === 'owner';
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(org.name);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [dupOpen, setDupOpen] = useState(false);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function runDelete() {
    setDeleteError(null);
    try {
      await del.mutateAsync(org.id);
      // The list refetches on success; the card disappears on its own.
    } catch (e) {
      setDeleteError(errorMessage(e));
    }
  }

  async function saveRename() {
    setRenameError(null);
    if (!newName.trim()) return setRenameError('Give the app a name.');
    try {
      await rename.mutateAsync({ orgId: org.id, name: newName.trim() });
      setRenaming(false);
    } catch (e) {
      setRenameError(errorMessage(e));
    }
  }

  const effectiveSlug = slugEdited ? slug : slugify(name);

  async function run() {
    setError(null);
    const finalSlug = slugify(effectiveSlug);
    if (!name.trim()) return setError('Give the new app a name.');
    if (!finalSlug) return setError('Choose a valid link (letters and numbers).');
    try {
      const newSlug = await duplicate.mutateAsync({ orgId: org.id, name: name.trim(), slug: finalSlug });
      navigate(`/o/${newSlug}`);
    } catch (e) {
      const msg = errorMessage(e);
      setError(/duplicate|unique/i.test(msg) ? 'That link is already taken — try another.' : msg);
    }
  }

  return (
    <li className="rounded-xl border p-4" style={{ borderColor: 'var(--th-hairline)' }}>
      {renaming ? (
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex min-w-0 items-center gap-2">
            <input autoFocus className="min-w-0 flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void saveRename(); }} />
            <button type="button" disabled={rename.isPending || !newName.trim()} onClick={() => void saveRename()} className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-50" style={{ backgroundColor: 'var(--th-primary)', color: 'var(--th-primary-text)' }}>{rename.isPending ? 'Saving…' : 'Save'}</button>
            <button type="button" onClick={() => { setRenaming(false); setNewName(org.name); setRenameError(null); }} className="shrink-0 rounded-full px-3 py-1.5 text-xs">Cancel</button>
          </div>
          {renameError && <p className="text-xs text-red-600">{renameError}</p>}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <Link to={`/o/${org.slug}`} className="flex min-w-0 items-center gap-3">
            <WorkspaceLogo name={org.name} iconUrl={iconUrl} />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold leading-snug">{org.name}</span>
              <span className="block truncate text-sm text-gray-500">/o/{org.slug}</span>
            </span>
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-black/5 px-3 py-1 text-xs font-medium capitalize">{role}</span>
            {canManage && (
              <button type="button" onClick={() => { setNewName(org.name); setRenaming(true); }} className="rounded-full border px-3 py-1 text-xs font-semibold" style={{ borderColor: 'var(--th-hairline-strong)' }}>Rename</button>
            )}
            {canDuplicate && (
              <button type="button" onClick={() => { setDupOpen((v) => !v); setName(`${org.name} (copy)`); setSlug(''); setSlugEdited(false); }} className="rounded-full border px-3 py-1 text-xs font-semibold" style={{ borderColor: 'var(--th-hairline-strong)' }}>
                Duplicate
              </button>
            )}
            {isOwner && (
              <button type="button" onClick={() => { setDeleteOpen((v) => !v); setConfirmText(''); setDeleteError(null); }} className="rounded-full border px-3 py-1 text-xs font-semibold text-red-600" style={{ borderColor: 'rgba(220,38,38,0.4)' }}>
                Delete
              </button>
            )}
          </div>
        </div>
      )}

      {deleteOpen && !renaming && (
        <div className="mt-3 flex flex-col gap-2 border-t pt-3" style={{ borderColor: 'var(--th-hairline)' }}>
          <p className="text-sm font-semibold text-red-600">Delete this app permanently?</p>
          <p className="text-xs text-gray-500">
            This removes <strong>{org.name}</strong> and everything in it — pages, roster, schedule, chat, forms &amp; responses, and every member&apos;s access. <strong>This cannot be undone.</strong>
          </p>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Type the app name to confirm</span>
            <input className="rounded-md border px-3 py-2 text-sm" style={{ borderColor: 'var(--th-hairline-strong)' }} placeholder={org.name} value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
          </label>
          {deleteError && <p className="text-sm text-red-600">{deleteError}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void runDelete()}
              disabled={del.isPending || confirmText.trim() !== org.name.trim()}
              className="rounded-full px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
              style={{ backgroundColor: '#dc2626' }}
            >
              {del.isPending ? 'Deleting…' : 'Delete forever'}
            </button>
            <button type="button" onClick={() => setDeleteOpen(false)} className="rounded-full px-4 py-2 text-sm">Cancel</button>
          </div>
        </div>
      )}

      {dupOpen && (
        <div className="mt-3 flex flex-col gap-2 border-t pt-3" style={{ borderColor: 'var(--th-hairline)' }}>
          <p className="text-xs text-gray-500">Copies the pages, layout, theme, and schedule teams/roles into a new app. No people carry over — only you, as owner.</p>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">New app name</span>
            <input className="rounded-md border border-gray-300 px-3 py-2 text-sm" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Link</span>
            <div className="flex items-center gap-1 text-sm">
              <span className="text-gray-400">/o/</span>
              <input className="min-w-0 flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm" value={effectiveSlug} onChange={(e) => { setSlug(e.target.value); setSlugEdited(true); }} />
            </div>
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={run} disabled={duplicate.isPending} className="rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ backgroundColor: 'var(--th-primary)', color: 'var(--th-primary-text)' }}>
              {duplicate.isPending ? 'Duplicating…' : 'Create duplicate'}
            </button>
            <button type="button" onClick={() => setDupOpen(false)} className="rounded-full px-4 py-2 text-sm">Cancel</button>
          </div>
        </div>
      )}
    </li>
  );
}

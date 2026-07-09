import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { useAuth } from '@/auth/AuthProvider';
import { applyHubMetadata } from '@/lib/appMetadata';
import { errorMessage } from '@/lib/errors';
import { slugify, useDuplicateWorkspace, useMyWorkspaces, useRenameWorkspace, type WorkspaceMembership } from '@/data/workspaceHooks';

/**
 * "My Workspaces" — the creator home. Lists every app the signed-in user
 * belongs to (with their role) and offers Create + Duplicate. This is the
 * Jotform-style hub: one account, many apps, each fully isolated.
 */
export function DashboardPage() {
  const { user, signOut } = useAuth();
  const { data: workspaces, isLoading } = useMyWorkspaces();
  useEffect(() => { applyHubMetadata(); }, []);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--th-heading)' }}>My workspaces</h1>
        <button type="button" onClick={() => void signOut()} className="text-sm text-gray-500 underline">Sign out</button>
      </div>
      <p className="mb-6 text-sm text-gray-500">Signed in as {user?.email}</p>

      {isLoading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : workspaces && workspaces.length > 0 ? (
        <ul className="mb-6 flex flex-col gap-3">
          {workspaces.map((w) => <WorkspaceCard key={w.org.id} w={w} />)}
        </ul>
      ) : (
        <div className="mb-6 rounded-xl border border-dashed p-8 text-center text-sm text-gray-500" style={{ borderColor: 'rgba(0,0,0,0.2)' }}>
          You don&apos;t have any apps yet. Create your first one!
        </div>
      )}

      <Link to="/new" className="inline-block rounded-full px-6 py-3 font-semibold" style={{ backgroundColor: 'var(--th-primary)', color: 'var(--th-primary-text)' }}>
        + Create a new app
      </Link>
    </div>
  );
}

function WorkspaceCard({ w }: { w: WorkspaceMembership }) {
  const { org, role } = w;
  const navigate = useNavigate();
  const duplicate = useDuplicateWorkspace();
  const rename = useRenameWorkspace();
  const canManage = role === 'owner' || role === 'admin';
  const canDuplicate = canManage;
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(org.name);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [dupOpen, setDupOpen] = useState(false);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <li className="rounded-xl border p-4" style={{ borderColor: 'rgba(0,0,0,0.12)' }}>
      <div className="flex items-center justify-between gap-2">
        {renaming ? (
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex min-w-0 items-center gap-2">
              <input autoFocus className="min-w-0 flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void saveRename(); }} />
              <button type="button" disabled={rename.isPending || !newName.trim()} onClick={() => void saveRename()} className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-50" style={{ backgroundColor: 'var(--th-primary)', color: 'var(--th-primary-text)' }}>{rename.isPending ? 'Saving…' : 'Save'}</button>
              <button type="button" onClick={() => { setRenaming(false); setNewName(org.name); setRenameError(null); }} className="shrink-0 rounded-full px-3 py-1.5 text-xs">Cancel</button>
            </div>
            {renameError && <p className="text-xs text-red-600">{renameError}</p>}
          </div>
        ) : (
          <>
            <Link to={`/o/${org.slug}`} className="min-w-0 flex-1">
              <span className="block font-semibold">{org.name}</span>
              <span className="block text-sm text-gray-500">/o/{org.slug}</span>
            </Link>
            <div className="flex shrink-0 items-center gap-2">
              <span className="rounded-full bg-black/5 px-3 py-1 text-xs font-medium capitalize">{role}</span>
              {canManage && (
                <button type="button" onClick={() => { setNewName(org.name); setRenaming(true); }} className="rounded-full border px-3 py-1 text-xs font-semibold" style={{ borderColor: 'rgba(0,0,0,0.2)' }}>Rename</button>
              )}
              {canDuplicate && (
                <button type="button" onClick={() => { setDupOpen((v) => !v); setName(`${org.name} (copy)`); setSlug(''); setSlugEdited(false); }} className="rounded-full border px-3 py-1 text-xs font-semibold" style={{ borderColor: 'rgba(0,0,0,0.2)' }}>
                  Duplicate
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {dupOpen && (
        <div className="mt-3 flex flex-col gap-2 border-t pt-3" style={{ borderColor: 'rgba(0,0,0,0.08)' }}>
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

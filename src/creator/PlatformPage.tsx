import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { useAuth } from '@/auth/AuthProvider';
import { errorMessage } from '@/lib/errors';
import {
  useIsPlatformAdmin, usePlatformAddAdmin, usePlatformAddTemplate, usePlatformAdmins, usePlatformApps,
  usePlatformDeleteApp, usePlatformJoinApp, usePlatformRemoveAdmin, usePlatformRemoveTemplate,
  usePlatformSetChatMedia, usePlatformSetUserDisabled, type PlatformApp,
} from '@/data/platformHooks';
import { slugify, useAppTemplates, useDuplicateWorkspace } from '@/data/workspaceHooks';
import { BrandHeader } from './BrandHeader';

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
  const { data: templates } = useAppTemplates(Boolean(user) && isAdmin === true);

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
  const templateOrgIds = new Set((templates ?? []).map((t) => t.orgId));
  // The brand mark comes from the apps themselves rather than a separate
  // platform-logo setting: every app here is a Switch Leader app, so the first
  // logo we find is the right one, and there's no second place to keep in sync.
  const brandLogo = list.map((a) => a.logoUrl || a.iconUrl).find(Boolean) ?? null;
  return (
    <div className="mx-auto max-w-3xl px-4 pb-10" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1.75rem)' }}>
      <BrandHeader
        logoUrl={brandLogo}
        subtitle="⚡ Command center"
        action={<Link to="/workspaces" className="text-sm text-gray-500 underline">My apps</Link>}
      />
      <p className="mb-6 text-sm text-gray-500">Every app on the platform. You can open any one to troubleshoot, delete it, or disable an owner&apos;s account.</p>

      {appsLoading ? (
        <p className="text-sm text-gray-500">Loading apps…</p>
      ) : list.length === 0 ? (
        <p className="text-sm text-gray-500">No apps yet.</p>
      ) : (
        <>
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-gray-400">{list.length} app{list.length === 1 ? '' : 's'}</p>
          <ul className="flex flex-col gap-3">
            {list.map((a) => <AppRow key={a.orgId} app={a} isTemplate={templateOrgIds.has(a.orgId)} />)}
          </ul>
        </>
      )}

      <AdminsSection currentUserId={user.id} />
    </div>
  );
}

/** Manage who else is a platform admin (add by email, remove). */
function AdminsSection({ currentUserId }: { currentUserId: string }) {
  const { data: admins, isLoading, error: listError } = usePlatformAdmins();
  const add = usePlatformAddAdmin();
  const remove = usePlatformRemoveAdmin();
  const [email, setEmail] = useState('');
  const [confirmRemove, setConfirmRemove] = useState<{ id: string; email: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // If migration 0053 hasn't been run yet the RPCs don't exist — say so plainly
  // instead of just showing an empty list.
  const needsMigration = listError && /function .*platform_list_admins.*does not exist|could not find the function/i.test(errorMessage(listError));

  async function addAdmin() {
    setError(null); setNotice(null);
    const e = email.trim();
    if (!e) return;
    try { await add.mutateAsync(e); setEmail(''); setNotice(`${e} is now a platform admin.`); }
    catch (err) { setError(errorMessage(err)); }
  }

  async function removeAdmin() {
    if (!confirmRemove) return;
    setError(null); setNotice(null);
    const label = confirmRemove.email ?? 'That admin';
    try { await remove.mutateAsync(confirmRemove.id); setNotice(`${label} is no longer a platform admin.`); }
    catch (err) { setError(errorMessage(err)); }
    setConfirmRemove(null);
  }

  return (
    <div className="mt-8 rounded-xl border p-4" style={{ borderColor: 'var(--th-hairline)' }}>
      <h2 className="font-bold" style={{ color: 'var(--th-heading)' }}>Platform admins</h2>
      <p className="mt-1 text-sm text-gray-500">People who can see and manage this command center. Add someone by the email on their account.</p>

      {needsMigration ? (
        <p className="mt-3 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
          Admin management isn&apos;t set up yet — run migration <strong>0053</strong> in Supabase, then reload this page.
        </p>
      ) : listError ? (
        // Any other failure (permissions, etc.) — show it rather than rendering
        // an empty list with no explanation.
        <p className="mt-3 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
          Couldn&apos;t load platform admins: {errorMessage(listError)}
        </p>
      ) : null}

      {!isLoading && !listError && (admins ?? []).length === 0 && (
        <p className="mt-3 text-sm text-gray-500">No platform admins found.</p>
      )}

      <div className="mt-3 flex flex-col gap-1.5">
        {isLoading ? <p className="text-sm text-gray-400">Loading…</p> : (admins ?? []).map((a) => (
          <div key={a.user_id} className="flex items-center justify-between gap-2 text-sm">
            <span className="min-w-0 truncate">⚡ {a.email ?? 'unknown'}{a.user_id === currentUserId && <span className="ml-2 text-xs text-gray-400">(you)</span>}</span>
            {a.user_id === currentUserId ? (
              <span className="shrink-0 text-xs text-gray-400">can&apos;t remove yourself</span>
            ) : (
              <button type="button" onClick={() => { setError(null); setNotice(null); setConfirmRemove({ id: a.user_id, email: a.email }); }} disabled={remove.isPending} className="shrink-0 rounded-full border px-3 py-1 text-xs font-semibold text-red-600 disabled:opacity-50" style={{ borderColor: 'rgba(220,38,38,0.4)' }}>Remove</button>
            )}
          </div>
        ))}
      </div>

      {confirmRemove && (
        <div className="mt-3 flex flex-col gap-2 rounded-lg border p-3" style={{ borderColor: 'rgba(220,38,38,0.4)' }}>
          <p className="text-sm">
            Remove <strong>{confirmRemove.email ?? 'this admin'}</strong> from the command center? They&apos;ll keep any apps they own, but lose platform-wide access.
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => void removeAdmin()} disabled={remove.isPending} className="rounded-full px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: '#dc2626' }}>
              {remove.isPending ? 'Removing…' : 'Remove admin'}
            </button>
            <button type="button" onClick={() => setConfirmRemove(null)} className="rounded-full px-4 py-2 text-sm">Cancel</button>
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="email"
          className="min-w-0 flex-1 rounded-md border px-3 py-2 text-sm"
          style={{ borderColor: 'var(--th-hairline-strong)' }}
          placeholder="person@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void addAdmin(); }}
        />
        <button type="button" onClick={() => void addAdmin()} disabled={add.isPending || !email.trim()} className="rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ backgroundColor: 'var(--th-primary)', color: 'var(--th-primary-text)' }}>
          {add.isPending ? 'Adding…' : 'Add admin'}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      {notice && <p className="mt-2 text-xs text-green-700">{notice}</p>}
    </div>
  );
}

function AppRow({ app, isTemplate }: { app: PlatformApp; isTemplate: boolean }) {
  const navigate = useNavigate();
  const join = usePlatformJoinApp();
  const del = usePlatformDeleteApp();
  const duplicate = useDuplicateWorkspace();
  const setChatMedia = usePlatformSetChatMedia();
  const addTemplate = usePlatformAddTemplate();
  const removeTemplate = usePlatformRemoveTemplate();
  const [tplOpen, setTplOpen] = useState(false);
  const [tplName, setTplName] = useState('');
  const [tplTagline, setTplTagline] = useState('');
  const setDisabled = usePlatformSetUserDisabled();

  async function saveTemplate() {
    setError(null);
    if (!tplName.trim()) return setError('Give the template a name.');
    try { await addTemplate.mutateAsync({ orgId: app.orgId, name: tplName.trim(), tagline: tplTagline.trim() || undefined }); setTplOpen(false); }
    catch (e) { setError(errorMessage(e)); }
  }
  const [confirming, setConfirming] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [dupOpen, setDupOpen] = useState(false);
  const [dupName, setDupName] = useState('');
  const [dupSlug, setDupSlug] = useState('');
  const [dupSlugEdited, setDupSlugEdited] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveSlug = dupSlugEdited ? dupSlug : slugify(dupName);

  async function runDuplicate() {
    setError(null);
    const finalSlug = slugify(effectiveSlug);
    if (!dupName.trim()) return setError('Give the new app a name.');
    if (!finalSlug) return setError('Choose a valid link (letters and numbers).');
    try {
      const newSlug = await duplicate.mutateAsync({ orgId: app.orgId, name: dupName.trim(), slug: finalSlug });
      navigate(`/o/${newSlug}`);
    } catch (e) {
      const msg = errorMessage(e);
      setError(/duplicate|unique/i.test(msg) ? 'That link is already taken — try another.' : msg);
    }
  }

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
          <p className="truncate font-semibold" style={{ color: 'var(--th-heading)' }}>
            {app.appName}
            {isTemplate && <span className="ml-2 rounded-full bg-black/10 px-2 py-0.5 text-xs font-semibold">Template</span>}
          </p>
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
        <button type="button" onClick={() => { setDupOpen((v) => !v); setDupName(`${app.appName} (copy)`); setDupSlug(''); setDupSlugEdited(false); setError(null); }} className="rounded-full border px-4 py-1.5 text-xs font-semibold" style={{ borderColor: 'var(--th-hairline-strong)', color: 'var(--th-text)' }}>
          Duplicate
        </button>
        <button
          type="button"
          onClick={() => { setError(null); setChatMedia.mutate({ orgId: app.orgId, enabled: !app.chatMediaEnabled }, { onError: (e) => setError(errorMessage(e)) }); }}
          disabled={setChatMedia.isPending}
          title="Photos and voice messages in this app's chat. Turning them off keeps text chat and GIFs working, and stops the app using file storage."
          className="rounded-full border px-4 py-1.5 text-xs font-semibold disabled:opacity-50"
          style={app.chatMediaEnabled
            ? { borderColor: 'var(--th-hairline-strong)', color: 'var(--th-text)' }
            : { borderColor: 'rgba(220,38,38,0.4)', color: '#dc2626' }}
        >
          {app.chatMediaEnabled ? 'Media on' : 'Media off'}
        </button>
        {isTemplate ? (
          <button type="button" onClick={() => { setError(null); removeTemplate.mutate(app.orgId, { onError: (e) => setError(errorMessage(e)) }); }} disabled={removeTemplate.isPending} className="rounded-full border px-4 py-1.5 text-xs font-semibold disabled:opacity-50" style={{ borderColor: 'var(--th-hairline-strong)', color: 'var(--th-text)' }}>
            {removeTemplate.isPending ? 'Removing…' : 'Remove as template'}
          </button>
        ) : (
          <button type="button" onClick={() => { setTplOpen((v) => !v); setTplName(app.appName); setTplTagline(''); setError(null); }} className="rounded-full border px-4 py-1.5 text-xs font-semibold" style={{ borderColor: 'var(--th-hairline-strong)', color: 'var(--th-text)' }}>
            Use as template
          </button>
        )}
        <button type="button" onClick={() => { setConfirming((v) => !v); setConfirmText(''); setError(null); }} className="rounded-full border px-4 py-1.5 text-xs font-semibold text-red-600" style={{ borderColor: 'rgba(220,38,38,0.4)' }}>
          Delete app
        </button>
      </div>

      {tplOpen && !isTemplate && (
        <div className="mt-3 flex flex-col gap-2 border-t pt-3" style={{ borderColor: 'var(--th-hairline)' }}>
          <p className="text-xs text-gray-500">Makes this app selectable as a starting point when anyone creates a new app. Only its pages, layout, theme, and channels are copied — never the people, roster, messages, or responses.</p>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Template name</span>
            <input className="rounded-md border px-3 py-2 text-sm" style={{ borderColor: 'var(--th-hairline-strong)' }} value={tplName} onChange={(e) => setTplName(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Short description <span className="font-normal text-gray-400">(optional)</span></span>
            <input className="rounded-md border px-3 py-2 text-sm" style={{ borderColor: 'var(--th-hairline-strong)' }} placeholder="e.g. Full youth-ministry setup with roster, schedule & chat" value={tplTagline} onChange={(e) => setTplTagline(e.target.value)} />
          </label>
          <div className="flex gap-2">
            <button type="button" onClick={() => void saveTemplate()} disabled={addTemplate.isPending} className="rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ backgroundColor: 'var(--th-primary)', color: 'var(--th-primary-text)' }}>
              {addTemplate.isPending ? 'Saving…' : 'Save as template'}
            </button>
            <button type="button" onClick={() => setTplOpen(false)} className="rounded-full px-4 py-2 text-sm">Cancel</button>
          </div>
        </div>
      )}

      {dupOpen && (
        <div className="mt-3 flex flex-col gap-2 border-t pt-3" style={{ borderColor: 'var(--th-hairline)' }}>
          <p className="text-xs text-gray-500">Copies the pages, layout, theme, schedule teams/roles, and chat channels into a brand-new app for another location. No people, messages, or roster carry over — and <strong>you</strong> become its owner, so it shows up in your My apps.</p>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">New app name</span>
            <input className="rounded-md border px-3 py-2 text-sm" style={{ borderColor: 'var(--th-hairline-strong)' }} value={dupName} onChange={(e) => setDupName(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Link</span>
            <div className="flex items-center gap-1 text-sm">
              <span className="text-gray-400">/o/</span>
              <input className="min-w-0 flex-1 rounded-md border px-3 py-2 text-sm" style={{ borderColor: 'var(--th-hairline-strong)' }} value={effectiveSlug} onChange={(e) => { setDupSlug(e.target.value); setDupSlugEdited(true); }} />
            </div>
          </label>
          <div className="flex gap-2">
            <button type="button" onClick={() => void runDuplicate()} disabled={duplicate.isPending} className="rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ backgroundColor: 'var(--th-primary)', color: 'var(--th-primary-text)' }}>
              {duplicate.isPending ? 'Duplicating…' : 'Create duplicate'}
            </button>
            <button type="button" onClick={() => setDupOpen(false)} className="rounded-full px-4 py-2 text-sm">Cancel</button>
          </div>
        </div>
      )}

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

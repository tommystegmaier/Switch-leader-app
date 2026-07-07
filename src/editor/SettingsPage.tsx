import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { useAuth } from '@/auth/AuthProvider';
import { useMembershipRole } from '@/auth/useMembership';
import { useInvites, useCreateInvite, useRevokeInvite } from '@/data/inviteHooks';
import { useOrgMembers, useSetMemberRole, useRemoveMember } from '@/data/memberHooks';
import { useOrganization } from '@/data/hooks';
import { errorMessage } from '@/lib/errors';
import { useLiveAppSettings } from '@/data/liveContent';
import { applyTheme } from '@/lib/theme';
import { FONT_OPTIONS, THEME_PRESETS } from '@/lib/themePresets';
import type { AppSettings, NavStyle, Role, ThemeColors, ViewerAccess } from '@/types';
import { MediaPicker } from './MediaPicker';
import { useSettingsMutations } from './useSettingsMutations';

/**
 * Workspace settings (editor+ only): app identity (name/logo/icon), theme with
 * live preview + presets, font, splash, navigation style, and sharing
 * (public link vs invite-only, copy link, generate invite codes).
 */
export function SettingsPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: org } = useOrganization(slug);
  const { data: saved } = useLiveAppSettings(org?.id);
  const { role, canEdit, isLoading } = useMembershipRole(org?.id);
  const save = useSettingsMutations(org?.id ?? '');

  const [draft, setDraft] = useState<AppSettings | null>(null);
  const [savedNote, setSavedNote] = useState(false);
  const [pickLogo, setPickLogo] = useState(false);
  const [pickIcon, setPickIcon] = useState(false);

  useEffect(() => { if (saved && !draft) setDraft(saved); }, [saved, draft]);

  // Live theme preview as the draft changes.
  useEffect(() => { if (draft) applyTheme(draft); }, [draft]);
  // Restore the saved theme when leaving without saving.
  useEffect(() => () => { if (saved) applyTheme(saved); }, [saved]);

  const isAdmin = role === 'owner' || role === 'admin';

  if (!isLoading && !canEdit) {
    return (
      <div className="p-6 text-center text-sm text-gray-500">
        You don&apos;t have permission to edit this workspace.{' '}
        <Link to={`/o/${slug}`} className="underline">Back</Link>
      </div>
    );
  }
  if (!draft || !org) return <p className="text-sm text-gray-500">Loading settings…</p>;

  const set = (patch: Partial<AppSettings>) => setDraft({ ...draft, ...patch });
  const setColor = (key: keyof ThemeColors, value: string) => set({ theme: { ...draft.theme, [key]: value } });

  async function onSave() {
    await save.mutateAsync(draft!);
    setSavedNote(true);
    setTimeout(() => setSavedNote(false), 2500);
  }

  const viewerLink = `${window.location.origin}/o/${org.slug}`;

  return (
    <div className="pb-10">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--th-heading)' }}>Settings</h1>
        <Link to={`/o/${org.slug}`} className="text-sm underline">← Back to app</Link>
      </div>

      {/* Identity */}
      <Section title="App identity">
        <Field label="App name">
          <input className={input} value={draft.appName} onChange={(e) => set({ appName: e.target.value })} />
        </Field>
        <div className="flex gap-6">
          <ImageSlot label="Logo" url={draft.logoUrl} onPick={() => setPickLogo(true)} onClear={() => set({ logoUrl: null })} />
          <ImageSlot label="App icon" url={draft.iconUrl} onPick={() => setPickIcon(true)} onClear={() => set({ iconUrl: null })} />
        </div>
      </Section>

      {/* Theme */}
      <Section title="Theme">
        <p className="text-sm text-gray-500">Pick a preset, then fine-tune. Changes preview live.</p>
        <div className="flex flex-wrap gap-2">
          {THEME_PRESETS.map((p) => (
            <button key={p.id} type="button" onClick={() => set({ theme: p.colors })} className="flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm hover:bg-black/5" style={{ borderColor: 'rgba(0,0,0,0.15)' }}>
              <span className="flex">
                {[p.colors.primary, p.colors.accent, p.colors.heading].map((c, i) => (
                  <span key={i} className="h-4 w-4 rounded-full border border-white" style={{ backgroundColor: c, marginLeft: i ? -6 : 0 }} />
                ))}
              </span>
              {p.name}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <ColorField label="Background" value={draft.theme.background} onChange={(v) => setColor('background', v)} />
          <ColorField label="Text" value={draft.theme.text} onChange={(v) => setColor('text', v)} />
          <ColorField label="Headings" value={draft.theme.heading} onChange={(v) => setColor('heading', v)} />
          <ColorField label="Buttons" value={draft.theme.primary} onChange={(v) => setColor('primary', v)} />
          <ColorField label="Button text" value={draft.theme.primaryText} onChange={(v) => setColor('primaryText', v)} />
          <ColorField label="Accent" value={draft.theme.accent} onChange={(v) => setColor('accent', v)} />
        </div>
        <Field label="Font">
          <select className={input} value={draft.fontFamily} onChange={(e) => set({ fontFamily: e.target.value })}>
            {FONT_OPTIONS.map((f) => <option key={f.label} value={f.value}>{f.label}</option>)}
          </select>
        </Field>
      </Section>

      {/* Splash */}
      <Section title="Splash screen">
        <div className="grid grid-cols-2 gap-3">
          <ColorField label="Splash background" value={draft.splash.background} onChange={(v) => set({ splash: { ...draft.splash, background: v } })} />
          <ColorField label="Splash text" value={draft.splash.text} onChange={(v) => set({ splash: { ...draft.splash, text: v } })} />
        </div>
      </Section>

      {/* Navigation */}
      <Section title="Navigation">
        <Field label="Menu style">
          <select className={input} value={draft.navStyle} onChange={(e) => set({ navStyle: e.target.value as NavStyle })}>
            <option value="top">Top bar + hamburger</option>
            <option value="bottom">Bottom tab bar</option>
            <option value="both">Both</option>
          </select>
        </Field>
      </Section>

      {/* Sharing */}
      <Section title="Sharing & access">
        <Field label="Who can view this app">
          <select className={input} value={draft.viewerAccess} onChange={(e) => set({ viewerAccess: e.target.value as ViewerAccess })}>
            <option value="public">Public — anyone with the link (no login)</option>
            <option value="invite_only">Invite only — only invited people (login required)</option>
          </select>
        </Field>
        <Field label="Shareable link">
          <div className="flex items-center gap-2">
            <input className={`${input} flex-1`} readOnly value={viewerLink} onFocus={(e) => e.currentTarget.select()} />
            <button type="button" className="rounded-md border border-gray-300 px-3 py-2 text-sm hover:bg-black/5" onClick={() => navigator.clipboard?.writeText(viewerLink)}>Copy</button>
          </div>
        </Field>
        {draft.viewerAccess === 'invite_only' && (
          <p className="text-xs text-gray-500">
            This app is invite-only. Add people (as viewers or editors) in the <span className="font-medium">Team &amp; access</span> section below.
          </p>
        )}
      </Section>

      {/* Team & access — who can edit / view (owner & admin only) */}
      {isAdmin && <TeamAccessSection orgId={org.id} currentRole={role} />}

      <div className="sticky bottom-0 mt-6 flex items-center gap-3 border-t bg-white/90 py-3 backdrop-blur" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <button type="button" onClick={onSave} disabled={save.isPending} className="rounded-full px-6 py-3 font-semibold disabled:opacity-50" style={{ backgroundColor: 'var(--th-primary)', color: 'var(--th-primary-text)' }}>
          {save.isPending ? 'Saving…' : 'Save settings'}
        </button>
        {savedNote && <span className="text-sm text-green-700">Saved ✓</span>}
      </div>

      {pickLogo && <MediaPicker orgId={org.id} accept="image/*" onSelect={(u) => set({ logoUrl: u })} onClose={() => setPickLogo(false)} />}
      {pickIcon && <MediaPicker orgId={org.id} accept="image/*" onSelect={(u) => set({ iconUrl: u })} onClose={() => setPickIcon(false)} />}
    </div>
  );
}

const ROLE_LABEL: Record<string, string> = {
  owner: 'Owner (full control)',
  admin: 'Admin (can edit + manage people)',
  editor: 'Editor (can edit the app)',
  viewer: 'Viewer (can only look)',
};

/**
 * Team & access: an owner/admin invites teammates by generating a join link
 * (pick the role), sees everyone who currently has access, and can change a
 * person's role or remove them. Anyone you invite signs up with their own
 * email and lands with the role you chose — so several people can edit the
 * same app from different accounts.
 */
function TeamAccessSection({ orgId, currentRole }: { orgId: string; currentRole: Role | null }) {
  const { user } = useAuth();
  const { data: invites } = useInvites(orgId, true);
  const { data: members } = useOrgMembers(orgId, true);
  const createInvite = useCreateInvite(orgId);
  const revokeInvite = useRevokeInvite(orgId);
  const setRole = useSetMemberRole(orgId);
  const removeMember = useRemoveMember(orgId);

  const [inviteRole, setInviteRole] = useState<Role>('editor');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const isOwner = currentRole === 'owner';

  const joinLinkFor = (code: string) => `${window.location.origin}/join?code=${code}`;

  async function copy(text: string) {
    try {
      await navigator.clipboard?.writeText(text);
      setCopied(text);
      setTimeout(() => setCopied(null), 2000);
    } catch { /* clipboard unavailable */ }
  }

  async function onCreate() {
    setError(null);
    try {
      const code = await createInvite.mutateAsync({ role: inviteRole });
      await copy(joinLinkFor(code));
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try { await fn(); } catch (e) { setError(errorMessage(e)); }
  }

  return (
    <Section title="Team & access">
      <p className="text-sm text-gray-500">
        Invite other people to help run this app. They sign up with their own email and get the role you pick — so several people can edit from different accounts.
      </p>

      {/* Current people */}
      <div className="rounded-lg border border-gray-200 p-3">
        <span className="text-sm font-medium">People with access</span>
        <ul className="mt-2 flex flex-col gap-2 text-sm">
          {(members ?? []).map((m) => {
            const isSelf = m.userId === user?.id;
            return (
              <li key={m.userId} className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium">
                    {m.name || m.email}{isSelf && <span className="font-normal text-gray-400"> (you)</span>}
                  </span>
                  {m.name && <span className="block truncate text-xs text-gray-500">{m.email}</span>}
                </span>
                <div className="flex items-center gap-2">
                  <select
                    className="rounded-md border border-gray-300 px-2 py-1 text-xs disabled:opacity-60"
                    value={m.role}
                    disabled={isSelf || (m.role === 'owner' && !isOwner)}
                    onChange={(e) => run(() => setRole.mutateAsync({ userId: m.userId, role: e.target.value as Role }))}
                  >
                    <option value="owner">Owner</option>
                    <option value="admin">Admin</option>
                    <option value="editor">Editor</option>
                    <option value="viewer">Viewer</option>
                  </select>
                  {!isSelf && (
                    <button
                      type="button"
                      className="rounded border border-gray-300 px-2 py-1 text-xs text-red-600 hover:bg-black/5"
                      onClick={() => run(() => removeMember.mutateAsync(m.userId))}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </li>
            );
          })}
          {(members ?? []).length === 0 && <li className="text-xs text-gray-500">Just you so far.</li>}
        </ul>
      </div>

      {/* Invite a teammate */}
      <div className="rounded-lg border border-gray-200 p-3">
        <span className="text-sm font-medium">Invite a teammate</span>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select className="rounded-md border border-gray-300 px-2 py-2 text-sm" value={inviteRole} onChange={(e) => setInviteRole(e.target.value as Role)}>
            <option value="editor">{ROLE_LABEL.editor}</option>
            <option value="admin">{ROLE_LABEL.admin}</option>
            {isOwner && <option value="owner">{ROLE_LABEL.owner}</option>}
            <option value="viewer">{ROLE_LABEL.viewer}</option>
          </select>
          <button
            type="button"
            className="rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-50"
            style={{ backgroundColor: 'var(--th-primary)', color: 'var(--th-primary-text)' }}
            onClick={onCreate}
            disabled={createInvite.isPending}
          >
            {createInvite.isPending ? 'Creating…' : 'Create invite link'}
          </button>
        </div>
        <p className="mt-2 text-xs text-gray-500">A link is created and copied to your clipboard — text or email it to the person. They open it, create an account, and they&apos;re in.</p>

        {(invites ?? []).length > 0 && (
          <ul className="mt-3 flex flex-col gap-1 text-sm">
            {(invites ?? []).map((inv) => {
              const link = joinLinkFor(inv.code);
              return (
                <li key={inv.id} className="flex items-center justify-between gap-2">
                  <code className="truncate rounded bg-black/5 px-2 py-1 text-xs">{ROLE_LABEL[inv.role] ?? inv.role}</code>
                  <div className="flex shrink-0 items-center gap-2">
                    <button type="button" className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-black/5" onClick={() => copy(link)}>
                      {copied === link ? 'Copied ✓' : 'Copy link'}
                    </button>
                    <button type="button" className="rounded border border-gray-300 px-2 py-1 text-xs text-red-600 hover:bg-black/5" onClick={() => run(() => revokeInvite.mutateAsync(inv.id))}>
                      Revoke
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </Section>
  );
}

const input = 'w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus-visible:ring-2';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6 rounded-xl border p-4" style={{ borderColor: 'rgba(0,0,0,0.12)' }}>
      <h2 className="mb-3 text-lg font-semibold" style={{ color: 'var(--th-heading)' }}>{title}</h2>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex flex-col gap-1 text-sm"><span className="font-medium">{label}</span>{children}</label>;
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      <div className="flex items-center gap-2">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-9 w-10 cursor-pointer rounded border border-gray-300 p-0.5" />
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
      </div>
    </label>
  );
}

function ImageSlot({ label, url, onPick, onClear }: { label: string; url: string | null; onPick: () => void; onClear: () => void }) {
  return (
    <div className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      <button type="button" onClick={onPick} className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-lg border border-dashed hover:bg-black/5" style={{ borderColor: 'rgba(0,0,0,0.25)' }}>
        {url ? <img src={url} alt="" className="h-full w-full object-contain" /> : <span className="text-xs text-gray-400">Upload</span>}
      </button>
      {url && <button type="button" onClick={onClear} className="text-xs text-red-600 underline">Remove</button>}
    </div>
  );
}

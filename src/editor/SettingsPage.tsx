import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import {
  DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { useAuth } from '@/auth/AuthProvider';
import { useMembershipRole } from '@/auth/useMembership';
import { useEditMode } from './EditModeProvider';
import { useInvites, useCreateInvite, useRevokeInvite } from '@/data/inviteHooks';
import { useOrgMembers, useSetMemberRole, useRemoveMember, useUpdateMemberProfile, useMembersWithPush, type OrgMember } from '@/data/memberHooks';
import { useOrganization } from '@/data/hooks';
import { errorMessage } from '@/lib/errors';
import { useLiveAppSettings } from '@/data/liveContent';
import { applyTheme } from '@/lib/theme';
import { FONT_OPTIONS, THEME_PRESETS } from '@/lib/themePresets';
import { useAllPages } from '@/data/pageHooks';
import { NavIcon, NAV_ICON_NAMES, isNavIconName } from '@/blocks/navIcons';
import type { AppSettings, NavStyle, NavTab, Role, ThemeColors, ViewerAccess } from '@/types';
import { MediaPicker } from './MediaPicker';
import { useSettingsMutations } from './useSettingsMutations';

/**
 * Workspace settings (editor+ only): app identity (name/logo/icon), theme with
 * live preview + presets, font, splash, navigation style, and sharing
 * (public link vs invite-only, copy link, generate invite codes).
 */
/** Did they open the app at some point today (local time)? */
function seenToday(iso: string | null): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

/** "Date last opened: 08/13/26", or a clear note when there's no visit yet. */
function fmtLastSeen(iso: string | null): string {
  if (!iso) return 'Date last opened: never';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `Date last opened: ${p(d.getMonth() + 1)}/${p(d.getDate())}/${p(d.getFullYear() % 100)}`;
}

export function SettingsPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: org } = useOrganization(slug);
  const { data: saved } = useLiveAppSettings(org?.id);
  const { role, canEdit, isLoading } = useMembershipRole(org?.id);
  const { editing } = useEditMode();
  const save = useSettingsMutations(org?.id ?? '');

  const [draft, setDraft] = useState<AppSettings | null>(null);
  const [pickLogo, setPickLogo] = useState(false);
  const [pickIcon, setPickIcon] = useState(false);

  useEffect(() => { if (saved && !draft) setDraft(saved); }, [saved, draft]);

  // Autosave into the DRAFT as you edit (debounced, only while in edit mode).
  // "Publish changes" is the one action that makes it live; leaving edit mode
  // without publishing throws it away. So there's no separate Save button.
  useEffect(() => {
    if (!editing || !draft || !saved) return;
    if (JSON.stringify(draft) === JSON.stringify(saved)) return;
    const t = setTimeout(() => save.mutate(draft), 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, saved, editing]);

  // Leaving edit mode (which discards unpublished changes) resets the form to
  // whatever the live settings now are, so it never re-saves discarded edits.
  useEffect(() => { if (!editing && saved) setDraft(saved); }, [editing, saved]);

  // Deep link from the "Icon bar" shortcut scrolls to that section.
  const { hash } = useLocation();
  useEffect(() => {
    if (hash === '#iconbar' && draft) {
      setTimeout(() => document.getElementById('iconbar')?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
  }, [hash, draft]);

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
            <button key={p.id} type="button" onClick={() => set({ theme: p.colors })} className="flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm hover:bg-black/5" style={{ borderColor: 'var(--th-hairline-strong)' }}>
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
        <Field label="Feature heading size">
          <select
            className={input}
            value={String(draft.theme.headingScale ?? 1)}
            onChange={(e) => set({ theme: { ...draft.theme, headingScale: Number(e.target.value) } })}
          >
            <option value="0.9">Small</option>
            <option value="1">Default</option>
            <option value="1.15">Large</option>
            <option value="1.3">Extra large</option>
          </select>
          <span className="text-xs text-gray-500">Sizes the title on every feature (Roster, Chat, Birthdays…) and their sub-headings together.</span>
        </Field>
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

      {/* Bottom tab bar */}
      <div id="iconbar" />
      <Section title="Bottom icon bar">
        <p className="text-sm text-gray-500">Add tabs to the bar at the bottom of the app — each with an icon, a label, and where it links. Leave empty to just list your pages automatically.</p>
        <TabBarEditor orgId={org.id} tabs={draft.tabs ?? []} onChange={(tabs) => set({ tabs })} />
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

      <div className="sticky bottom-0 mt-6 flex items-center gap-2 border-t bg-white/90 py-3 text-sm text-gray-500 backdrop-blur" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <span>{save.isPending ? 'Saving draft…' : '✓ Saved to draft'}</span>
        <span className="text-gray-400">— hit <strong>Publish changes</strong> (top bar) to make it live.</span>
      </div>

      {pickLogo && <MediaPicker orgId={org.id} accept="image/*" onSelect={(u) => set({ logoUrl: u })} onClose={() => setPickLogo(false)} />}
      {pickIcon && <MediaPicker orgId={org.id} accept="image/*" onSelect={(u) => set({ iconUrl: u })} onClose={() => setPickIcon(false)} />}
    </div>
  );
}

/** Editor for the custom bottom icon bar. */
function TabBarEditor({ orgId, tabs, onChange }: { orgId: string; tabs: NavTab[]; onChange: (t: NavTab[]) => void }) {
  const { data: pages } = useAllPages(orgId);
  const update = (i: number, patch: Partial<NavTab>) => onChange(tabs.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  const remove = (i: number) => onChange(tabs.filter((_, idx) => idx !== i));
  const move = (i: number, dir: number) => {
    const j = i + dir;
    if (j < 0 || j >= tabs.length) return;
    const next = [...tabs];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const add = () => onChange([...tabs, { icon: 'home', label: 'Tab', kind: 'page', target: pages?.[0]?.slug ?? '', adminOnly: false }]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    onChange(arrayMove(tabs, Number(active.id), Number(over.id)));
  };

  return (
    <div className="flex flex-col gap-2">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={tabs.map((_, i) => String(i))} strategy={verticalListSortingStrategy}>
      {tabs.map((t, i) => (
        <SortableTab key={i} id={String(i)}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-md border border-gray-300"><NavIcon name={t.icon} className="h-5 w-5" /></span>
            <select className="rounded-md border border-gray-300 px-2 py-1.5 text-sm" value={isNavIconName(t.icon) ? t.icon : '__emoji__'} onChange={(e) => update(i, { icon: e.target.value === '__emoji__' ? '⭐' : e.target.value })} aria-label="Icon">
              {NAV_ICON_NAMES.map((n) => <option key={n} value={n}>{n}</option>)}
              <option value="__emoji__">Emoji…</option>
            </select>
            {!isNavIconName(t.icon) && (
              <input className="w-14 rounded-md border border-gray-300 px-2 py-1.5 text-center text-lg" value={t.icon} onChange={(e) => update(i, { icon: e.target.value })} aria-label="Emoji" />
            )}
            <input className="min-w-0 flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm" placeholder="Label" value={t.label} onChange={(e) => update(i, { label: e.target.value })} />
            <div className="flex flex-col leading-none">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="px-1 text-xs disabled:opacity-25" aria-label="Move up">▲</button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === tabs.length - 1} className="px-1 text-xs disabled:opacity-25" aria-label="Move down">▼</button>
            </div>
            <button type="button" onClick={() => remove(i)} className="rounded border border-gray-300 px-2 py-1 text-xs text-red-600 hover:bg-black/5">Remove</button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <select className="rounded-md border border-gray-300 px-2 py-1.5 text-sm" value={t.kind} onChange={(e) => update(i, { kind: e.target.value as NavTab['kind'], target: '' })}>
              <option value="page">Go to page</option>
              <option value="url">Open link</option>
            </select>
            {t.kind === 'page' ? (
              <select className="min-w-0 flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm" value={t.target} onChange={(e) => update(i, { target: e.target.value })}>
                <option value="">Choose a page…</option>
                {(pages ?? []).map((p) => <option key={p.id} value={p.slug}>{p.name}</option>)}
              </select>
            ) : (
              <input className="min-w-0 flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm" placeholder="https://…" value={t.target} onChange={(e) => update(i, { target: e.target.value })} />
            )}
            <label className="flex items-center gap-1 text-xs text-gray-600">
              <input type="checkbox" checked={Boolean(t.adminOnly)} onChange={(e) => update(i, { adminOnly: e.target.checked })} />
              Managers only
            </label>
          </div>
        </SortableTab>
      ))}
      </SortableContext>
      </DndContext>
      <button type="button" onClick={add} className="self-start rounded-full border px-4 py-2 text-sm font-semibold" style={{ borderColor: 'var(--th-hairline-strong)' }}>+ Add tab</button>
    </div>
  );
}

/** A draggable tab card in the icon-bar editor (grip on the left). */
function SortableTab({ id, children }: { id: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1, zIndex: isDragging ? 10 : undefined }}
      className="flex items-start gap-1"
    >
      <button type="button" className="mt-2 cursor-grab touch-none px-1 text-gray-400 hover:text-gray-600" aria-label="Hold and drag to reorder" {...attributes} {...listeners}>⠿</button>
      <div className="min-w-0 flex-1 rounded-lg border border-gray-200 p-2">{children}</div>
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
export function TeamAccessSection({ orgId, currentRole }: { orgId: string; currentRole: Role | null }) {
  const { user } = useAuth();
  const { data: invites } = useInvites(orgId, true);
  const { data: members } = useOrgMembers(orgId, true);
  const { data: pushOn } = useMembersWithPush(orgId, true);
  const pushSet = new Set(pushOn ?? []);
  const createInvite = useCreateInvite(orgId);
  const revokeInvite = useRevokeInvite(orgId);
  const setRole = useSetMemberRole(orgId);
  const removeMember = useRemoveMember(orgId);

  const [inviteRole, setInviteRole] = useState<Role>('editor');
  const [inviteEmail, setInviteEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [editingMember, setEditingMember] = useState<string | null>(null);
  const [noteFilter, setNoteFilter] = useState<'all' | 'on' | 'off'>('all');
  const isOwner = currentRole === 'owner';

  // Sort by first name (A–Z), then apply the notifications filter.
  const sortedMembers = [...(members ?? [])].sort((a, b) =>
    (a.name?.trim() || a.email).toLowerCase().localeCompare((b.name?.trim() || b.email).toLowerCase()),
  );
  const shownMembers = sortedMembers.filter((m) =>
    noteFilter === 'all' ? true : noteFilter === 'on' ? pushSet.has(m.userId) : !pushSet.has(m.userId),
  );

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
      const code = await createInvite.mutateAsync({ role: inviteRole, email: inviteEmail });
      setInviteEmail('');
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
    <Section
      title="Team & access"
      collapsible
      defaultOpen={false}
      subtitle={members ? `${members.length} ${members.length === 1 ? 'person' : 'people'}` : undefined}
    >
      <p className="text-sm text-gray-500">
        Invite other people to help run this app. They sign up with their own email and get the role you pick — so several people can edit from different accounts.
      </p>

      {/* Current people */}
      <div className="rounded-lg border border-gray-200 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-medium">People with access</span>
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {([['all', 'All'], ['on', '🔔 On'], ['off', '🔕 Off']] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setNoteFilter(key)}
                className="rounded-full px-3 py-1 font-medium"
                style={noteFilter === key ? { backgroundColor: 'var(--th-primary)', color: 'var(--th-primary-text)' } : { border: '1px solid var(--th-hairline-strong)' }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <ul className="mt-2 flex flex-col gap-2 text-sm">
          {shownMembers.map((m) => {
            const isSelf = m.userId === user?.id;
            return (
              <li key={m.userId} className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {m.name || m.email}{isSelf && <span className="font-normal text-gray-400"> (you)</span>}
                    </span>
                    {m.name && <span className="block truncate text-xs text-gray-500">{m.email}</span>}
                    <span
                      className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${pushSet.has(m.userId) ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}
                      title="Whether this person has turned on push notifications (updates automatically)"
                    >
                      {pushSet.has(m.userId) ? '🔔 Notifications on' : '🔕 Notifications off'}
                    </span>
                    <span
                      className={`ml-1.5 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        seenToday(m.lastSeenAt) ? 'bg-green-100 text-green-700' : 'bg-black/5 text-gray-600'
                      }`}
                      title="The last time this person opened the app — green means today"
                    >
                      {fmtLastSeen(m.lastSeenAt)}
                    </span>
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
                    <button
                      type="button"
                      className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-black/5"
                      onClick={() => setEditingMember((id) => (id === m.userId ? null : m.userId))}
                    >
                      {editingMember === m.userId ? 'Close' : 'Edit info'}
                    </button>
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
                </div>
                {editingMember === m.userId && (
                  <MemberEditor orgId={orgId} member={m} onDone={() => setEditingMember(null)} />
                )}
              </li>
            );
          })}
          {shownMembers.length === 0 && (
            <li className="text-xs text-gray-500">{(members ?? []).length === 0 ? 'Just you so far.' : 'No one matches this filter.'}</li>
          )}
        </ul>
      </div>

      {/* Invite a teammate */}
      <div className="rounded-lg border border-gray-200 p-3">
        <span className="text-sm font-medium">Invite a teammate</span>
        <div className="mt-2 flex flex-col gap-2">
          <input
            type="email"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            placeholder="Their email (optional — ties the link to them)"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
          />
          <div className="flex flex-wrap items-center gap-2">
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
        </div>
        <p className="mt-2 text-xs text-gray-500">A link is created and copied to your clipboard — text or email it to the person. It opens a page that shows their role and lets them create an account, then drops them straight in.</p>

        {(invites ?? []).length > 0 && (
          <ul className="mt-3 flex flex-col gap-1 text-sm">
            {(invites ?? []).map((inv) => {
              const link = joinLinkFor(inv.code);
              return (
                <li key={inv.id} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 flex-1 truncate rounded bg-black/5 px-2 py-1 text-xs">
                    {ROLE_LABEL[inv.role] ?? inv.role}{inv.email && <span className="text-gray-500"> · {inv.email}</span>}
                  </span>
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

/** Owner/admin fixes a member's name / birthday / phone (email stays their login). */
function MemberEditor({ orgId, member, onDone }: { orgId: string; member: OrgMember; onDone: () => void }) {
  const update = useUpdateMemberProfile(orgId);
  const [name, setName] = useState(member.name ?? '');
  const [birthday, setBirthday] = useState(member.birthday ?? '');
  const [phone, setPhone] = useState(member.phone ?? '');
  const [err, setErr] = useState<string | null>(null);
  const field = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm';

  async function save() {
    setErr(null);
    try { await update.mutateAsync({ userId: member.userId, profile: { name, birthday, phone } }); onDone(); }
    catch (e) { setErr(errorMessage(e)); }
  }

  return (
    <div className="rounded-lg border border-gray-200 p-3" style={{ backgroundColor: 'var(--th-hairline)' }}>
      <p className="mb-2 text-xs text-gray-500">Fix this person&apos;s details. Their email ({member.email}) is their login and can&apos;t be changed here.</p>
      <div className="flex flex-col gap-2">
        <label className="flex flex-col gap-1 text-xs font-medium">Name
          <input className={field} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium">Birthday
          <input type="date" className={field} value={birthday} onChange={(e) => setBirthday(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium">Phone
          <input type="tel" className={field} value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
      </div>
      {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={save} disabled={update.isPending} className="rounded-full px-4 py-2 text-xs font-semibold disabled:opacity-50" style={{ backgroundColor: 'var(--th-primary)', color: 'var(--th-primary-text)' }}>
          {update.isPending ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={onDone} className="rounded-full px-4 py-2 text-xs">Cancel</button>
      </div>
    </div>
  );
}

/**
 * A settings section. Pass `collapsible` for long sections (Team & access grows
 * with every person invited) so the rest of Settings stays reachable without a
 * lot of scrolling. `subtitle` shows next to the heading while collapsed.
 */
function Section({ title, subtitle, collapsible, defaultOpen = true, children }: {
  title: string;
  subtitle?: string;
  collapsible?: boolean;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (!collapsible) {
    return (
      <section className="mb-6 rounded-xl border p-4" style={{ borderColor: 'var(--th-hairline)' }}>
        <h2 className="mb-3 text-lg font-semibold" style={{ color: 'var(--th-heading)' }}>{title}</h2>
        <div className="flex flex-col gap-3">{children}</div>
      </section>
    );
  }
  return (
    <section className="mb-6 rounded-xl border p-4" style={{ borderColor: 'var(--th-hairline)' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <h2 className="text-lg font-semibold" style={{ color: 'var(--th-heading)' }}>
          {title}
          {subtitle && <span className="ml-2 text-sm font-normal text-gray-500">{subtitle}</span>}
        </h2>
        <span
          aria-hidden
          className="shrink-0 text-gray-400 transition-transform"
          style={{ transform: open ? 'rotate(90deg)' : 'none' }}
        >
          ›
        </span>
      </button>
      {open && <div className="mt-3 flex flex-col gap-3">{children}</div>}
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
      <button type="button" onClick={onPick} className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-lg border border-dashed hover:bg-black/5" style={{ borderColor: 'var(--th-hairline-strong)' }}>
        {url ? <img src={url} alt="" className="h-full w-full object-contain" /> : <span className="text-xs text-gray-400">Upload</span>}
      </button>
      {url && <button type="button" onClick={onClear} className="text-xs text-red-600 underline">Remove</button>}
    </div>
  );
}

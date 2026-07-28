import { useEffect, useRef, useState } from 'react';

import { useMembershipRole } from '@/auth/useMembership';
import { useOrganization } from '@/data/hooks';
import { errorMessage } from '@/lib/errors';
import { uploadMedia } from '@/lib/media';
import {
  useAddRosterPerson, useCreateRosterGroup, useDeleteRosterGroup, useDeleteRosterPerson,
  useRenameRosterGroup, useReorderRosterGroups, useReorderRosterPeople, useRosterGroups,
  useRosterPeople, useUpdateRosterPerson,
  type PersonInput, type RosterGroup, type RosterPerson,
} from '@/data/rosterHooks';
import type { ViewerCtx } from '../actions';

type HeaderSize = 'sm' | 'md' | 'lg';
interface RosterProps { title?: string; headerSize?: HeaderSize }

const HEADER_CLS: Record<HeaderSize, string> = { sm: 'text-sm', md: 'text-lg', lg: 'text-2xl' };

const card = 'rounded-xl border p-4';
const cardStyle = { borderColor: 'rgba(0,0,0,0.12)' } as const;
const input = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus-visible:ring-2';

/** First letters of the first two words — a clean avatar fallback when there's no photo. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

function Avatar({ person, size = 48 }: { person: { name: string; photoUrl: string | null }; size?: number }) {
  const dim = { width: size, height: size } as const;
  if (person.photoUrl) {
    return <img src={person.photoUrl} alt={person.name} className="shrink-0 rounded-full object-cover" style={dim} />;
  }
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ ...dim, backgroundColor: 'var(--th-primary)', fontSize: size * 0.36 }}
      aria-hidden
    >
      {initials(person.name)}
    </span>
  );
}

export function RosterView({ props, ctx }: { props: RosterProps; ctx: ViewerCtx }) {
  const { data: org } = useOrganization(ctx.orgSlug);
  const { canEdit, isLoading } = useMembershipRole(org?.id);
  const { data: groups } = useRosterGroups(org?.id);
  const { data: people } = useRosterPeople(org?.id);

  const title = props.title || 'Roster';
  const size: HeaderSize = props.headerSize ?? 'md';

  // Managers can flip into an editing mode; default on when the app is in Edit mode.
  const [manage, setManage] = useState(Boolean(ctx.editing));
  useEffect(() => { if (ctx.editing) setManage(true); }, [ctx.editing]);

  // Remember which groups are collapsed on this device.
  const collapseKey = `roster-collapsed-${org?.id ?? ''}`;
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem(collapseKey) || '{}'); } catch { return {}; }
  });
  useEffect(() => {
    try { localStorage.setItem(collapseKey, JSON.stringify(collapsed)); } catch { /* ignore */ }
  }, [collapseKey, collapsed]);
  const toggle = (id: string) => setCollapsed((c) => ({ ...c, [id]: !c[id] }));

  if (!org || isLoading) {
    return <div className={card} style={cardStyle}><p className="text-sm text-gray-500">Loading roster…</p></div>;
  }

  const allGroups = groups ?? [];
  const topGroups = allGroups.filter((g) => !g.parentId);
  const showManage = canEdit && manage;

  return (
    <div className={card} style={cardStyle}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className={`font-semibold ${HEADER_CLS[size]}`} style={{ color: 'var(--th-heading)' }}>👥 {title}</p>
        <div className="flex items-center gap-2">
          {allGroups.length > 0 && (
            <button
              type="button"
              className="text-xs text-gray-500 underline"
              onClick={() => {
                const anyOpen = allGroups.some((g) => !collapsed[g.id]);
                setCollapsed(Object.fromEntries(allGroups.map((g) => [g.id, anyOpen])));
              }}
            >
              {allGroups.some((g) => !collapsed[g.id]) ? 'Collapse all' : 'Expand all'}
            </button>
          )}
          {canEdit && !ctx.editing && (
            <button type="button" onClick={() => setManage((m) => !m)} className="rounded-full border px-3 py-1 text-xs font-semibold" style={{ borderColor: 'rgba(0,0,0,0.2)' }}>
              {manage ? 'Done' : '✎ Edit'}
            </button>
          )}
        </div>
      </div>

      {allGroups.length === 0 && !showManage && (
        <p className="text-sm text-gray-500">No one added to the roster yet.</p>
      )}

      <div className="flex flex-col gap-3">
        {topGroups.map((g, gi) => (
          <GroupBlock
            key={g.id}
            orgId={org.id}
            group={g}
            level={0}
            allGroups={allGroups}
            people={people ?? []}
            collapsed={collapsed}
            toggle={toggle}
            showManage={showManage}
            siblingIds={topGroups.map((x) => x.id)}
            index={gi}
            total={topGroups.length}
          />
        ))}
      </div>

      {showManage && <AddGroup orgId={org.id} />}
    </div>
  );
}

// --- one group: header, its people, and (top level only) its subgroups -----
function GroupBlock({ orgId, group, level, allGroups, people, collapsed, toggle, showManage, siblingIds, index, total }: {
  orgId: string;
  group: RosterGroup;
  level: 0 | 1;
  allGroups: RosterGroup[];
  people: RosterPerson[];
  collapsed: Record<string, boolean>;
  toggle: (id: string) => void;
  showManage: boolean;
  siblingIds: string[];
  index: number;
  total: number;
}) {
  const directPeople = people.filter((p) => p.groupId === group.id);
  const subs = level === 0 ? allGroups.filter((g) => g.parentId === group.id) : [];
  const subPeople = subs.reduce((n, s) => n + people.filter((p) => p.groupId === s.id).length, 0);
  const count = directPeople.length + subPeople;
  const open = !collapsed[group.id];

  return (
    <div className="rounded-lg border" style={{ ...cardStyle, ...(level === 1 ? { backgroundColor: 'rgba(0,0,0,0.02)' } : {}) }}>
      <div className="flex items-center gap-2 px-3 py-2">
        <button type="button" onClick={() => toggle(group.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-expanded={open}>
          <span className="text-gray-400" aria-hidden>{open ? '▾' : '▸'}</span>
          <span className={`truncate font-semibold ${level === 1 ? 'text-sm' : ''}`} style={{ color: 'var(--th-heading)' }}>{group.name}</span>
          <span className="ml-auto shrink-0 text-xs font-normal text-gray-400">{count}</span>
        </button>
        {showManage && (
          <GroupControls orgId={orgId} group={group} index={index} total={total} groupIds={siblingIds} />
        )}
      </div>

      {open && (
        <div className="flex flex-col gap-2 px-3 pb-3">
          {directPeople.map((p, pi) => (
            <PersonRow key={p.id} orgId={orgId} person={p} manage={showManage} index={pi} total={directPeople.length} peopleIds={directPeople.map((x) => x.id)} />
          ))}
          {showManage && <AddPerson orgId={orgId} groupId={group.id} />}

          {subs.length > 0 && (
            <div className="mt-1 flex flex-col gap-2 border-l-2 pl-3" style={{ borderColor: 'rgba(0,0,0,0.1)' }}>
              {subs.map((sub, si) => (
                <GroupBlock
                  key={sub.id}
                  orgId={orgId}
                  group={sub}
                  level={1}
                  allGroups={allGroups}
                  people={people}
                  collapsed={collapsed}
                  toggle={toggle}
                  showManage={showManage}
                  siblingIds={subs.map((x) => x.id)}
                  index={si}
                  total={subs.length}
                />
              ))}
            </div>
          )}

          {showManage && level === 0 && <AddGroup orgId={orgId} parentId={group.id} />}
          {!showManage && directPeople.length === 0 && subs.length === 0 && (
            <p className="text-xs text-gray-400">No one in this group yet.</p>
          )}
        </div>
      )}
    </div>
  );
}

// --- read-only + manage person row ----------------------------------------
function PersonRow({ orgId, person, manage, index, total, peopleIds }: { orgId: string; person: RosterPerson; manage: boolean; index: number; total: number; peopleIds: string[] }) {
  const [editing, setEditing] = useState(false);
  const del = useDeleteRosterPerson(orgId);
  const reorder = useReorderRosterPeople(orgId);

  if (editing) {
    return <PersonForm orgId={orgId} person={person} onDone={() => setEditing(false)} />;
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border p-2" style={cardStyle}>
      <Avatar person={person} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{person.name}</p>
        {person.role && <p className="truncate text-sm text-gray-500">{person.role}</p>}
        <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
          {person.email && <a href={`mailto:${person.email}`} className="text-gray-500 underline">{person.email}</a>}
          {person.phone && <a href={`tel:${person.phone}`} className="text-gray-500 underline">{person.phone}</a>}
        </div>
      </div>
      {manage && (
        <div className="flex shrink-0 items-center gap-1">
          <span className="flex flex-col leading-none">
            <button type="button" onClick={() => reorder.mutate(move(peopleIds, index, -1))} disabled={index === 0} className="px-1 text-xs disabled:opacity-25" aria-label="Move up">▲</button>
            <button type="button" onClick={() => reorder.mutate(move(peopleIds, index, 1))} disabled={index === total - 1} className="px-1 text-xs disabled:opacity-25" aria-label="Move down">▼</button>
          </span>
          <button type="button" onClick={() => setEditing(true)} className="rounded border border-gray-300 px-2 py-0.5 text-xs hover:bg-black/5">Edit</button>
          <button type="button" onClick={() => { if (confirm(`Remove ${person.name} from the roster?`)) del.mutate(person.id); }} className="rounded border border-gray-300 px-2 py-0.5 text-xs text-red-600 hover:bg-black/5">Remove</button>
        </div>
      )}
    </div>
  );
}

// --- add / edit person form ------------------------------------------------
function PersonForm({ orgId, person, groupId, onDone }: { orgId: string; person?: RosterPerson; groupId?: string; onDone: () => void }) {
  const add = useAddRosterPerson(orgId);
  const update = useUpdateRosterPerson(orgId);
  const [name, setName] = useState(person?.name ?? '');
  const [role, setRole] = useState(person?.role ?? '');
  const [email, setEmail] = useState(person?.email ?? '');
  const [phone, setPhone] = useState(person?.phone ?? '');
  const [photoUrl, setPhotoUrl] = useState<string | null>(person?.photoUrl ?? null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setError(null);
    try { const m = await uploadMedia(orgId, file); setPhotoUrl(m.url); }
    catch (err) { setError(errorMessage(err)); }
    finally { setUploading(false); }
  }

  async function save() {
    if (!name.trim()) { setError('Please enter a name.'); return; }
    setError(null);
    const payload: PersonInput = { name, role, email, phone, photoUrl };
    try {
      if (person) await update.mutateAsync({ id: person.id, person: payload });
      else if (groupId) await add.mutateAsync({ groupId, person: payload });
      onDone();
    } catch (err) { setError(errorMessage(err)); }
  }

  const busy = add.isPending || update.isPending || uploading;

  return (
    <div className="rounded-lg border p-3" style={cardStyle}>
      <div className="flex items-center gap-3">
        <Avatar person={{ name: name || '?', photoUrl }} />
        <div className="flex flex-col gap-1">
          <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="rounded-full border px-3 py-1 text-xs font-semibold disabled:opacity-50" style={{ borderColor: 'rgba(0,0,0,0.2)' }}>
            {uploading ? 'Uploading…' : photoUrl ? 'Change photo' : 'Add photo'}
          </button>
          {photoUrl && !uploading && <button type="button" onClick={() => setPhotoUrl(null)} className="text-xs text-gray-500 underline">Remove photo</button>}
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickPhoto} />
        </div>
      </div>
      <div className="mt-3 flex flex-col gap-2">
        <input className={input} placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <input className={input} placeholder="Role / title (optional)" value={role} onChange={(e) => setRole(e.target.value)} />
        <input className={input} type="email" placeholder="Email (optional)" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className={input} type="tel" placeholder="Phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={save} disabled={busy || !name.trim()} className="rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ backgroundColor: 'var(--th-primary)', color: 'var(--th-primary-text)' }}>
          {busy ? 'Saving…' : person ? 'Save' : 'Add person'}
        </button>
        <button type="button" onClick={onDone} className="rounded-full px-4 py-2 text-sm">Cancel</button>
      </div>
    </div>
  );
}

function AddPerson({ orgId, groupId }: { orgId: string; groupId: string }) {
  const [open, setOpen] = useState(false);
  if (open) return <PersonForm orgId={orgId} groupId={groupId} onDone={() => setOpen(false)} />;
  return (
    <button type="button" onClick={() => setOpen(true)} className="self-start rounded-full border px-3 py-1 text-xs font-semibold hover:bg-black/5" style={{ borderColor: 'rgba(0,0,0,0.25)' }}>+ Add person</button>
  );
}

// --- group controls + add group -------------------------------------------
function GroupControls({ orgId, group, index, total, groupIds }: { orgId: string; group: { id: string; name: string }; index: number; total: number; groupIds: string[] }) {
  const rename = useRenameRosterGroup(orgId);
  const del = useDeleteRosterGroup(orgId);
  const reorder = useReorderRosterGroups(orgId);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(group.name);

  if (editing) {
    return (
      <div className="flex shrink-0 items-center gap-1">
        <input autoFocus className="w-32 rounded-md border border-gray-300 px-2 py-1 text-sm" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) { rename.mutate({ id: group.id, name }); setEditing(false); } }} />
        <button type="button" onClick={() => { if (name.trim()) { rename.mutate({ id: group.id, name }); setEditing(false); } }} className="rounded-full px-2 py-1 text-xs font-semibold" style={{ backgroundColor: 'var(--th-primary)', color: 'var(--th-primary-text)' }}>Save</button>
        <button type="button" onClick={() => { setEditing(false); setName(group.name); }} className="px-1 text-xs">✕</button>
      </div>
    );
  }

  return (
    <div className="flex shrink-0 items-center gap-1">
      <span className="flex flex-col leading-none">
        <button type="button" onClick={() => reorder.mutate(move(groupIds, index, -1))} disabled={index === 0} className="px-1 text-xs disabled:opacity-25" aria-label="Move group up">▲</button>
        <button type="button" onClick={() => reorder.mutate(move(groupIds, index, 1))} disabled={index === total - 1} className="px-1 text-xs disabled:opacity-25" aria-label="Move group down">▼</button>
      </span>
      <button type="button" onClick={() => setEditing(true)} className="rounded border border-gray-300 px-2 py-0.5 text-xs hover:bg-black/5">Rename</button>
      <button type="button" onClick={() => { if (confirm(`Delete group "${group.name}" and everyone in it?`)) del.mutate(group.id); }} className="rounded border border-gray-300 px-2 py-0.5 text-xs text-red-600 hover:bg-black/5">Delete</button>
    </div>
  );
}

function AddGroup({ orgId, parentId }: { orgId: string; parentId?: string | null }) {
  const create = useCreateRosterGroup(orgId);
  const [name, setName] = useState('');
  const sub = Boolean(parentId);
  const submit = () => { if (name.trim()) { create.mutate({ name, parentId: parentId ?? null }); setName(''); } };
  return (
    <div className={`flex gap-2 ${sub ? 'mt-1' : 'mt-3'}`}>
      <input className={input} placeholder={sub ? 'New subgroup (e.g. Middle School Boys)' : 'New group (e.g. Leadership Team)'} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />
      <button type="button" disabled={!name.trim() || create.isPending} onClick={submit} className="shrink-0 rounded-full border px-4 py-2 text-sm font-semibold disabled:opacity-50" style={sub ? { borderColor: 'rgba(0,0,0,0.25)' } : { backgroundColor: 'var(--th-primary)', color: 'var(--th-primary-text)', borderColor: 'transparent' }}>{sub ? '+ Subgroup' : '+ Group'}</button>
    </div>
  );
}

/** Swap item at `idx` with its neighbor in direction `dir` (-1 up / +1 down). */
function move(ids: string[], idx: number, dir: number): string[] {
  const next = [...ids];
  const j = idx + dir;
  if (j < 0 || j >= next.length) return next;
  [next[idx], next[j]] = [next[j], next[idx]];
  return next;
}

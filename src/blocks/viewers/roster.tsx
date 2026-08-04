import { useEffect, useRef, useState } from 'react';

import { useAuth } from '@/auth/AuthProvider';
import { useMembershipRole } from '@/auth/useMembership';
import { useOrganization } from '@/data/hooks';
import { errorMessage } from '@/lib/errors';
import { uploadMedia } from '@/lib/media';
import {
  useAddRosterPerson, useCreateRosterGroup, useCreateRosterRole, useDeleteRosterGroup,
  useDeleteRosterPerson, useDeleteRosterRole, useRenameRosterGroup, useRenameRosterRole,
  useReorderRosterGroups, useReorderRosterPeople, useReorderRosterRoles, useRosterGroups,
  useRosterAccountOptions, useRosterPeople, useRosterRoles, useSeedRosterRoles,
  useSetMyRosterPhoto, useUpdateRosterPerson,
  type PersonInput, type RosterAccountOption, type RosterGroup, type RosterPerson, type RosterRole,
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

function isCoach(p: { role: string | null }): boolean {
  return (p.role ?? '').trim().toLowerCase() === 'coach';
}
/** Coaches to the top, everyone else after — each keeps its added/sorted order
 *  (JS sort is stable), so multiple coaches stay in the order they were added. */
function coachFirst(list: RosterPerson[]): RosterPerson[] {
  return [...list].sort((a, b) => (isCoach(a) ? 0 : 1) - (isCoach(b) ? 0 : 1));
}

/** A person's title: Coaches get bold ALL-CAPS text so they stand out;
 *  other titles show as subtle gray text. */
function RoleTag({ role }: { role: string }) {
  if (isCoach({ role })) {
    return <span className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--th-heading)' }}>{role}</span>;
  }
  return <span className="text-sm text-gray-500">{role}</span>;
}

export function RosterView({ props, ctx }: { props: RosterProps; ctx: ViewerCtx }) {
  const { data: org } = useOrganization(ctx.orgSlug);
  const { role, canEdit, isLoading } = useMembershipRole(org?.id);
  const isAdmin = role === 'owner' || role === 'admin';
  const { data: groups } = useRosterGroups(org?.id);
  const { data: people } = useRosterPeople(org?.id);

  const title = props.title || 'Roster';
  const size: HeaderSize = props.headerSize ?? 'md';

  // Managers can flip into an editing mode; default on when the app is in Edit mode.
  const [manage, setManage] = useState(Boolean(ctx.editing));
  useEffect(() => { if (ctx.editing) setManage(true); }, [ctx.editing]);
  // Tapping a person (in the normal view) opens a large card of their info.
  const [viewing, setViewing] = useState<RosterPerson | null>(null);

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
            onOpen={setViewing}
          />
        ))}
      </div>

      {showManage && <AddGroup orgId={org.id} />}
      {showManage && isAdmin && <RoleListEditor orgId={org.id} />}

      {viewing && <PersonModal person={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

/** A large, easy-to-read card of one person's photo and info. */
function PersonModal({ person, onClose }: { person: RosterPerson; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-xs rounded-2xl bg-white p-6 text-center shadow-xl">
        <button type="button" onClick={onClose} aria-label="Close" className="absolute right-3 top-3 rounded-full px-2 text-2xl leading-none text-gray-400 hover:bg-black/5">×</button>
        <div className="flex justify-center"><Avatar person={person} size={144} /></div>
        <p className="mt-4 text-xl font-bold" style={{ color: 'var(--th-heading)' }}>{person.name}</p>
        {person.role && <div className="mt-1 flex justify-center"><RoleTag role={person.role} /></div>}
        {person.phone && (
          <a href={`tel:${person.phone}`} className="mt-4 inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium" style={{ borderColor: 'rgba(0,0,0,0.2)' }}>
            📞 {person.phone}
          </a>
        )}
      </div>
    </div>
  );
}

// --- one group: header, its people, and (top level only) its subgroups -----
function GroupBlock({ orgId, group, level, allGroups, people, collapsed, toggle, showManage, siblingIds, index, total, onOpen }: {
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
  onOpen: (p: RosterPerson) => void;
}) {
  const directPeople = coachFirst(people.filter((p) => p.groupId === group.id));
  const subs = level === 0 ? allGroups.filter((g) => g.parentId === group.id) : [];
  const subPeople = subs.reduce((n, s) => n + people.filter((p) => p.groupId === s.id).length, 0);
  const count = directPeople.length + subPeople;
  const open = !collapsed[group.id];
  const isTop = level === 0;
  // Top group: the app theme's Headings color as a solid bar, with the Button-
  // text color on top. Subgroup: a softened (lightened) version of that color.
  const headerBg = isTop ? 'var(--th-heading)' : 'color-mix(in srgb, var(--th-heading) 16%, white)';
  const headerFg = isTop ? 'var(--th-primary-text)' : 'var(--th-heading)';

  return (
    <div className="overflow-hidden rounded-xl border" style={{ ...cardStyle, ...(isTop ? { borderColor: 'rgba(0,0,0,0.18)' } : {}) }}>
      <div className="flex items-center gap-2 px-3 py-2.5" style={{ backgroundColor: headerBg }}>
        <button type="button" onClick={() => toggle(group.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-expanded={open}>
          <span className="shrink-0" aria-hidden style={{ color: headerFg, opacity: 0.85 }}>{open ? '▾' : '▸'}</span>
          <span
            className={isTop ? 'truncate font-bold uppercase tracking-wide' : 'truncate text-sm font-semibold'}
            style={{ color: headerFg }}
          >
            {group.name}
          </span>
          <span
            className="ml-auto shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold"
            style={isTop
              ? { backgroundColor: 'rgba(255,255,255,0.22)', color: headerFg }
              : { backgroundColor: 'rgba(255,255,255,0.65)', color: '#6b7280', border: '1px solid rgba(0,0,0,0.12)' }}
          >
            {count}
          </span>
        </button>
        {showManage && (
          <GroupControls orgId={orgId} group={group} index={index} total={total} groupIds={siblingIds} onDark={isTop} />
        )}
      </div>

      {open && (
        <div className="flex flex-col gap-2 px-3 pb-3">
          {directPeople.map((p, pi) => (
            <PersonRow key={p.id} orgId={orgId} person={p} manage={showManage} index={pi} total={directPeople.length} peopleIds={directPeople.map((x) => x.id)} onOpen={onOpen} />
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
                  onOpen={onOpen}
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
function PersonRow({ orgId, person, manage, index, total, peopleIds, onOpen }: { orgId: string; person: RosterPerson; manage: boolean; index: number; total: number; peopleIds: string[]; onOpen: (p: RosterPerson) => void }) {
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const del = useDeleteRosterPerson(orgId);
  const reorder = useReorderRosterPeople(orgId);
  const mine = Boolean(user && person.userId && person.userId === user.id);

  if (editing) {
    return <PersonForm orgId={orgId} person={person} onDone={() => setEditing(false)} />;
  }

  // In the normal view, tapping the person opens a large, readable card.
  const Info = (
    <>
      <Avatar person={person} />
      <div className="min-w-0 flex-1 text-left">
        <p className="truncate font-medium">{person.name}{mine && <span className="text-gray-400"> (you)</span>}</p>
        {person.role && <div className="mt-1"><RoleTag role={person.role} /></div>}
        {person.phone && (
          <div className="mt-1 text-xs text-gray-500">{manage ? <a href={`tel:${person.phone}`} className="underline">{person.phone}</a> : person.phone}</div>
        )}
      </div>
    </>
  );

  return (
    <div className="flex items-center gap-3 rounded-lg border p-2" style={cardStyle}>
      {manage ? (
        <div className="flex min-w-0 flex-1 items-center gap-3">{Info}</div>
      ) : (
        <button type="button" onClick={() => onOpen(person)} className="flex min-w-0 flex-1 items-center gap-3" aria-label={`View ${person.name}`}>{Info}</button>
      )}
      {manage ? (
        <div className="flex shrink-0 items-center gap-1">
          <span className="flex flex-col leading-none">
            <button type="button" onClick={() => reorder.mutate(move(peopleIds, index, -1))} disabled={index === 0} className="px-1 text-xs disabled:opacity-25" aria-label="Move up">▲</button>
            <button type="button" onClick={() => reorder.mutate(move(peopleIds, index, 1))} disabled={index === total - 1} className="px-1 text-xs disabled:opacity-25" aria-label="Move down">▼</button>
          </span>
          <button type="button" onClick={() => setEditing(true)} className="rounded border border-gray-300 px-2 py-0.5 text-xs hover:bg-black/5">Edit</button>
          <button type="button" onClick={() => { if (confirm(`Remove ${person.name} from the roster?`)) del.mutate(person.id); }} className="rounded border border-gray-300 px-2 py-0.5 text-xs text-red-600 hover:bg-black/5">Remove</button>
        </div>
      ) : mine ? (
        <MyPhotoButton orgId={orgId} person={person} />
      ) : null}
    </div>
  );
}

/** A member (linked to their account) changes just their own photo. */
function MyPhotoButton({ orgId, person }: { orgId: string; person: RosterPerson }) {
  const setPhoto = useSetMyRosterPhoto(orgId);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setBusy(true);
    try { const m = await uploadMedia(orgId, file); await setPhoto.mutateAsync(m.url); }
    catch { /* best-effort; the button re-enables */ }
    finally { setBusy(false); }
  }

  return (
    <div className="flex shrink-0 items-center gap-1">
      <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className="rounded border border-gray-300 px-2 py-0.5 text-xs hover:bg-black/5 disabled:opacity-50">
        {busy ? '…' : person.photoUrl ? 'Change photo' : 'Add photo'}
      </button>
      {person.photoUrl && !busy && (
        <button type="button" onClick={() => setPhoto.mutate(null)} className="rounded border border-gray-300 px-2 py-0.5 text-xs text-red-600 hover:bg-black/5">Remove</button>
      )}
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pick} />
    </div>
  );
}

// --- searchable account picker (type to filter a long member list) --------
function MemberPicker({ members, value, onPick }: { members: RosterAccountOption[]; value: string | null; onPick: (id: string | null) => void }) {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const selected = value ? members.find((m) => m.userId === value) : null;

  if (selected) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm">
        <span className="min-w-0 truncate">Linked to <span className="font-medium">{selected.name || selected.email}</span></span>
        <button type="button" onClick={() => onPick(null)} className="shrink-0 text-xs text-gray-500 underline">Unlink</button>
      </div>
    );
  }

  const q = query.trim().toLowerCase();
  const results = q
    ? members.filter((m) => (m.name || '').toLowerCase().includes(q) || m.email.toLowerCase().includes(q))
    : members;
  const open = focused || q.length > 0;

  return (
    <div className="relative">
      <input
        className={input}
        placeholder="Search by name or email…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
      />
      {open && (
        <ul className="mt-1 max-h-56 overflow-y-auto rounded-md border border-gray-200 bg-white">
          {results.map((m) => (
            <li key={m.userId}>
              <button type="button" onClick={() => { onPick(m.userId); setQuery(''); }} className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-black/5">
                <span className="font-medium">{m.name || m.email}</span>
                {m.name && <span className="text-xs text-gray-500">{m.email}</span>}
              </button>
            </li>
          ))}
          {results.length === 0 && <li className="px-3 py-2 text-xs text-gray-500">No matches.</li>}
        </ul>
      )}
    </div>
  );
}

// --- add / edit person form ------------------------------------------------
function PersonForm({ orgId, person, groupId, onDone }: { orgId: string; person?: RosterPerson; groupId?: string; onDone: () => void }) {
  const add = useAddRosterPerson(orgId);
  const update = useUpdateRosterPerson(orgId);
  const { data: members } = useRosterAccountOptions(orgId, true);
  const { data: roles } = useRosterRoles(orgId);
  const [name, setName] = useState(person?.name ?? '');
  const [role, setRole] = useState(person?.role ?? '');
  const [phone, setPhone] = useState(person?.phone ?? '');
  const [photoUrl, setPhotoUrl] = useState<string | null>(person?.photoUrl ?? null);
  const [userId, setUserId] = useState<string | null>(person?.userId ?? null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function pickMember(id: string) {
    if (!id) { setUserId(null); return; }
    const m = (members ?? []).find((x) => x.userId === id);
    setUserId(id);
    if (m) { setName(m.name || m.email); if (m.phone) setPhone(m.phone); }
  }

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
    const payload: PersonInput = { name, role, phone, photoUrl, userId };
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
      {members && members.length > 0 && (
        <div className="mt-3 flex flex-col gap-1 text-sm">
          <span className="font-medium">Link to an app account (optional)</span>
          <MemberPicker members={members} value={userId} onPick={(id) => pickMember(id ?? '')} />
          <span className="text-xs text-gray-500">Pulls in their name and sign-up phone; they can update their own photo from the roster.</span>
        </div>
      )}
      <div className="mt-3 flex flex-col gap-2">
        <input className={input} placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <select className={input} value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">No title</option>
          {(roles ?? []).map((r) => <option key={r.id} value={r.name}>{r.name}</option>)}
          {role && !(roles ?? []).some((r) => r.name === role) && <option value={role}>{role}</option>}
        </select>
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
function GroupControls({ orgId, group, index, total, groupIds, onDark }: { orgId: string; group: { id: string; name: string }; index: number; total: number; groupIds: string[]; onDark?: boolean }) {
  const rename = useRenameRosterGroup(orgId);
  const del = useDeleteRosterGroup(orgId);
  const reorder = useReorderRosterGroups(orgId);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(group.name);

  const btn = onDark ? 'rounded border px-2 py-0.5 text-xs' : 'rounded border border-gray-300 px-2 py-0.5 text-xs hover:bg-black/5';
  const btnStyle = onDark ? { borderColor: 'rgba(255,255,255,0.45)', color: '#fff' } : undefined;
  const delStyle = onDark ? { borderColor: 'rgba(255,255,255,0.45)', color: '#fecaca' } : undefined;
  const arrowStyle = onDark ? { color: '#fff' } : undefined;

  if (editing) {
    return (
      <div className="flex shrink-0 items-center gap-1">
        <input autoFocus className="w-32 rounded-md border border-gray-300 px-2 py-1 text-sm" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) { rename.mutate({ id: group.id, name }); setEditing(false); } }} />
        <button type="button" onClick={() => { if (name.trim()) { rename.mutate({ id: group.id, name }); setEditing(false); } }} className="rounded-full px-2 py-1 text-xs font-semibold" style={{ backgroundColor: 'var(--th-primary)', color: 'var(--th-primary-text)' }}>Save</button>
        <button type="button" onClick={() => { setEditing(false); setName(group.name); }} className="px-1 text-xs" style={onDark ? { color: '#fff' } : undefined}>✕</button>
      </div>
    );
  }

  return (
    <div className="flex shrink-0 items-center gap-1">
      <span className="flex flex-col leading-none">
        <button type="button" onClick={() => reorder.mutate(move(groupIds, index, -1))} disabled={index === 0} className="px-1 text-xs disabled:opacity-25" style={arrowStyle} aria-label="Move group up">▲</button>
        <button type="button" onClick={() => reorder.mutate(move(groupIds, index, 1))} disabled={index === total - 1} className="px-1 text-xs disabled:opacity-25" style={arrowStyle} aria-label="Move group down">▼</button>
      </span>
      <button type="button" onClick={() => setEditing(true)} className={btn} style={btnStyle}>Rename</button>
      <button type="button" onClick={() => { if (confirm(`Delete group "${group.name}" and everyone in it?`)) del.mutate(group.id); }} className={onDark ? btn : 'rounded border border-gray-300 px-2 py-0.5 text-xs text-red-600 hover:bg-black/5'} style={delStyle}>Delete</button>
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

// --- owner/admin: edit the list of titles/roles ---------------------------
function RoleListEditor({ orgId }: { orgId: string }) {
  const { data: roles } = useRosterRoles(orgId);
  const create = useCreateRosterRole(orgId);
  const seed = useSeedRosterRoles(orgId);
  const [open, setOpen] = useState(false);
  const [newRole, setNewRole] = useState('');
  const list = roles ?? [];
  const ids = list.map((r) => r.id);
  const submit = () => { if (newRole.trim()) { create.mutate(newRole); setNewRole(''); } };

  return (
    <div className="mt-4 rounded-lg border" style={cardStyle}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold" aria-expanded={open}>
        <span className="text-gray-400" aria-hidden>{open ? '▾' : '▸'}</span>
        ⚙︎ Titles / roles list
        <span className="ml-auto text-xs font-normal text-gray-400">{list.length}</span>
      </button>
      {open && (
        <div className="flex flex-col gap-2 px-3 pb-3">
          <p className="text-xs text-gray-500">The titles you can pick from when adding people. Only owners &amp; admins can edit this.</p>
          {list.length === 0 && (
            <button type="button" onClick={() => seed.mutate()} disabled={seed.isPending} className="self-start rounded-full border px-3 py-1 text-xs font-semibold disabled:opacity-50" style={{ borderColor: 'rgba(0,0,0,0.25)' }}>Add starter titles</button>
          )}
          {list.map((r, i) => <RoleRow key={r.id} orgId={orgId} role={r} index={i} total={list.length} ids={ids} />)}
          <div className="mt-1 flex gap-2">
            <input className={input} placeholder="Add a title (e.g. Worship)" value={newRole} onChange={(e) => setNewRole(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />
            <button type="button" disabled={!newRole.trim() || create.isPending} onClick={submit} className="shrink-0 rounded-full border px-3 py-2 text-xs font-semibold disabled:opacity-50" style={{ borderColor: 'rgba(0,0,0,0.25)' }}>+ Add</button>
          </div>
        </div>
      )}
    </div>
  );
}

function RoleRow({ orgId, role, index, total, ids }: { orgId: string; role: RosterRole; index: number; total: number; ids: string[] }) {
  const rename = useRenameRosterRole(orgId);
  const del = useDeleteRosterRole(orgId);
  const reorder = useReorderRosterRoles(orgId);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(role.name);

  if (editing) {
    return (
      <div className="flex items-center gap-1 rounded bg-black/5 px-2 py-1 text-sm">
        <input autoFocus className="min-w-0 flex-1 rounded-md border border-gray-300 px-2 py-1" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) { rename.mutate({ id: role.id, name }); setEditing(false); } }} />
        <button type="button" onClick={() => { if (name.trim()) { rename.mutate({ id: role.id, name }); setEditing(false); } }} className="rounded-full px-2 py-1 text-xs font-semibold" style={{ backgroundColor: 'var(--th-primary)', color: 'var(--th-primary-text)' }}>Save</button>
        <button type="button" onClick={() => { setEditing(false); setName(role.name); }} className="px-1 text-xs">✕</button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 rounded bg-black/5 px-2 py-1 text-sm">
      <span className="flex flex-col leading-none">
        <button type="button" onClick={() => reorder.mutate(move(ids, index, -1))} disabled={index === 0} className="px-1 text-xs disabled:opacity-25" aria-label="Move up">▲</button>
        <button type="button" onClick={() => reorder.mutate(move(ids, index, 1))} disabled={index === total - 1} className="px-1 text-xs disabled:opacity-25" aria-label="Move down">▼</button>
      </span>
      <span className="min-w-0 flex-1 truncate">{role.name}</span>
      <button type="button" onClick={() => setEditing(true)} className="rounded border border-gray-300 px-2 py-0.5 text-xs hover:bg-black/5">Rename</button>
      <button type="button" onClick={() => del.mutate(role.id)} className="rounded border border-gray-300 px-2 py-0.5 text-xs text-red-600 hover:bg-black/5">Delete</button>
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

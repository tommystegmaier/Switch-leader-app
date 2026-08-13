import { useEffect, useMemo, useState, type ReactNode } from 'react';
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
import { readableTextOn } from '@/lib/theme';
import { useOrganization } from '@/data/hooks';
import { errorMessage } from '@/lib/errors';
import {
  useAddSkip, useAddToRoster, useCreateRole, useCreateTeam, useDeleteRole, useDeleteTeam,
  useBirthdayConfig, useBirthdayOptIn, useSaveBirthdayConfig, useSetBirthdayOptIn,
  useMySchedule, useNotifyDefaults, useNotifyRoster, useOrgBirthdays, useRemoveFromRoster,
  useRemoveSkip, useReorderRoles, useReorderTeams, useRespondOccurrence, useRoster,
  useRosterStatus, useSaveNotifyDefaults, useScheduleMembers, useScheduleMute,
  useScheduleRoles, useScheduleTeams, useServeWeekday, useSetScheduleMute,
  useSetServeWeekday, useSkips, useSyncScheduleFromRoster,
  type MyOccurrence,
} from '@/data/scheduleHooks';
import type { ViewerCtx } from '../actions';

type HeaderSize = 'sm' | 'md' | 'lg';
interface ScheduleProps { title?: string; headerSize?: HeaderSize }

const HEADER_CLS: Record<HeaderSize, string> = { sm: 'text-sm', md: 'text-lg', lg: 'text-2xl' };
const ROLE_CLS: Record<HeaderSize, string> = { sm: 'text-sm', md: 'text-base', lg: 'text-lg' };

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function isoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}
/** Next `count` serving-day dates from today, excluding weeks off. */
function upcomingServeDates(weekday: number, skips: Set<string>, count = 8): string[] {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const start = new Date(today);
  start.setDate(today.getDate() + ((weekday - today.getDay() + 7) % 7));
  const out: string[] = [];
  for (let i = 0; out.length < count && i < count + 20; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i * 7);
    const iso = isoOf(d);
    if (!skips.has(iso)) out.push(iso);
  }
  return out;
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Awaiting', cls: 'bg-amber-100 text-amber-800' },
  confirmed: { label: 'Confirmed', cls: 'bg-green-100 text-green-800' },
  declined: { label: 'Declined', cls: 'bg-red-100 text-red-700' },
};
function Badge({ status }: { status: string }) {
  const b = STATUS_BADGE[status] ?? STATUS_BADGE.pending;
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${b.cls}`}>{b.label}</span>;
}

const card = 'rounded-xl border p-4';
const cardStyle = { borderColor: 'var(--th-hairline)' } as const;
const input = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus-visible:ring-2';

export function ScheduleView({ props, ctx }: { props: ScheduleProps; ctx: ViewerCtx }) {
  const { data: org } = useOrganization(ctx.orgSlug);
  const { user } = useAuth();
  const { canEdit, isLoading } = useMembershipRole(org?.id);
  const title = props.title || 'Serving schedule';
  const size: HeaderSize = props.headerSize ?? 'md';

  if (!org || isLoading) return <div className={card} style={cardStyle}><p className="text-sm text-gray-500">Loading schedule…</p></div>;
  if (!user) {
    return (
      <div className={card} style={cardStyle}>
        <p className="th-feature-title font-semibold" style={{ color: 'var(--th-heading)' }}>📅 {title}</p>
        <p className="mt-1 text-sm text-gray-600">Sign in to see the weeks you&apos;re scheduled to serve.</p>
        <a href={`/login?next=/o/${org.slug}`} className="mt-3 inline-block rounded-full px-5 py-2.5 text-sm font-semibold" style={{ backgroundColor: 'var(--th-primary)', color: 'var(--th-primary-text)' }}>Sign in</a>
      </div>
    );
  }
  return canEdit
    ? <ManagerSchedule orgId={org.id} userId={user.id} title={title} size={size} editing={Boolean(ctx.editing)} />
    : <VolunteerSchedule orgId={org.id} />;
}

/** Wrap a list in drag context only when editing; otherwise render plain. */
function SortableGroup({ enabled, items, sensors, onDragEnd, children }: { enabled: boolean; items: string[]; sensors: ReturnType<typeof useDragSensors>; onDragEnd: (e: DragEndEvent) => void; children: ReactNode }) {
  if (!enabled) return <>{children}</>;
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={items} strategy={verticalListSortingStrategy}>{children}</SortableContext>
    </DndContext>
  );
}

/** A row with a drag grip when editing; otherwise just its content. */
function MaybeSortable({ enabled, id, children }: { enabled: boolean; id: string; children: ReactNode }) {
  if (!enabled) return <>{children}</>;
  return <SortableRow id={id}>{children}</SortableRow>;
}

// ---------------------------------------------------------------------------
// Volunteer — my upcoming weeks
// ---------------------------------------------------------------------------
function VolunteerSchedule({ orgId }: { orgId: string }) {
  const { data: mine, isLoading } = useMySchedule(orgId, true);
  const respond = useRespondOccurrence(orgId);

  const rows = mine ?? [];
  const thisWeekDate = rows[0]?.serveDate;
  const thisWeek = rows.filter((r) => r.serveDate === thisWeekDate);
  const future = rows.filter((r) => r.serveDate !== thisWeekDate);

  return (
    <div className={card} style={cardStyle}>
      <p className="mb-3 font-semibold" style={{ color: 'var(--th-heading)' }}>📅 My Serving Schedule</p>
      {isLoading ? (
        <p className="text-sm text-gray-500">Loading your weeks…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500">You&apos;re not on the serving schedule right now. We&apos;ll let you know when you are.</p>
      ) : (
        <>
          <div className="mb-4">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">This week — {fmtDate(thisWeekDate)}</p>
            <ul className="flex flex-col gap-3">
              {thisWeek.map((a) => <AssignmentCard key={`${a.roleId}|${a.serveDate}`} occ={a} respond={respond} />)}
            </ul>
          </div>
          {future.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Upcoming weeks — respond early or block out a date</p>
              <ul className="flex flex-col gap-3">
                {future.map((a) => <AssignmentCard key={`${a.roleId}|${a.serveDate}`} occ={a} respond={respond} />)}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function AssignmentCard({ occ, respond }: { occ: MyOccurrence; respond: ReturnType<typeof useRespondOccurrence> }) {
  const [declining, setDeclining] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function react(status: 'confirmed' | 'declined', noteArg?: string) {
    setBusy(true); setError(null);
    try {
      await respond.mutateAsync({ roleId: occ.roleId, serveDate: occ.serveDate, status, note: noteArg });
      setDeclining(false); setNote('');
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  }

  return (
    <li className="rounded-lg border p-3" style={cardStyle}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{fmtDate(occ.serveDate)}</span>
        <Badge status={occ.status} />
      </div>
      <p className="mt-1 text-sm text-gray-600">{occ.teamName} · {occ.roleName}</p>
      {declining ? (
        <div className="mt-3">
          <textarea className={input} rows={2} placeholder="Optional: let the team know why (e.g. out of town)" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="mt-2 flex gap-2">
            <button type="button" disabled={busy} onClick={() => react('declined', note)} className="flex-1 rounded-full border px-4 py-2 text-sm font-semibold text-red-600 disabled:opacity-50" style={{ borderColor: 'var(--th-hairline-strong)' }}>Send decline</button>
            <button type="button" onClick={() => { setDeclining(false); setNote(''); }} className="rounded-full px-4 py-2 text-sm">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex gap-2">
          <button type="button" disabled={busy || occ.status === 'confirmed'} onClick={() => react('confirmed')} className="flex-1 rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ backgroundColor: 'var(--th-primary)', color: 'var(--th-primary-text)' }}>
            {occ.status === 'confirmed' ? '✓ Confirmed' : 'Confirm'}
          </button>
          <button type="button" disabled={busy} onClick={() => setDeclining(true)} className="flex-1 rounded-full border px-4 py-2 text-sm font-semibold text-red-600 disabled:opacity-50" style={{ borderColor: 'var(--th-hairline-strong)' }}>
            {occ.status === 'declined' ? "Declined — change" : "Can't make it"}
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Manager — roster, week statuses, setup
// ---------------------------------------------------------------------------
type Tab = 'roster' | 'teams' | 'weeks' | 'settings';

function ManagerSchedule({ orgId, userId, title, size, editing }: { orgId: string; userId: string; title: string; size: HeaderSize; editing: boolean }) {
  const [tab, setTab] = useState<Tab>('roster');
  return (
    <div className={card} style={cardStyle}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className={`font-semibold ${HEADER_CLS[size]}`} style={{ color: 'var(--th-heading)' }}>📅 {title}</p>
        <div className="flex flex-wrap gap-1 text-sm">
          {([['roster', 'Roster'], ['teams', 'Teams & roles'], ['weeks', 'Weeks off'], ['settings', 'Notifications']] as [Tab, string][]).map(([t, label]) => (
            <button key={t} type="button" onClick={() => setTab(t)} className={`rounded-full px-3 py-1 ${tab === t ? 'font-semibold' : 'opacity-60'}`} style={tab === t ? { backgroundColor: 'var(--th-primary)', color: 'var(--th-primary-text)' } : { border: '1px solid var(--th-hairline-strong)' }}>{label}</button>
          ))}
        </div>
      </div>
      {tab === 'roster' && <RosterTab orgId={orgId} userId={userId} size={size} editing={editing} />}
      {tab === 'teams' && <TeamsTab orgId={orgId} editing={editing} />}
      {tab === 'weeks' && <WeeksTab orgId={orgId} />}
      {tab === 'settings' && <SettingsTab orgId={orgId} userId={userId} />}
    </div>
  );
}

function RosterTab({ orgId, userId, size, editing }: { orgId: string; userId: string; size: HeaderSize; editing: boolean }) {
  const { data: teams } = useScheduleTeams(orgId);
  const { data: roles } = useScheduleRoles(orgId);
  const { data: roster } = useRoster(orgId, true);
  const { data: members } = useScheduleMembers(orgId, true);
  const { data: weekday = 0 } = useServeWeekday(orgId);
  const { data: skips } = useSkips(orgId);
  const addToRoster = useAddToRoster(orgId);
  const removeFromRoster = useRemoveFromRoster(orgId);
  const respond = useRespondOccurrence(orgId);
  const reorderTeams = useReorderTeams(orgId);
  const reorderRoles = useReorderRoles(orgId);
  const sensors = useDragSensors();

  const dates = useMemo(() => upcomingServeDates(weekday, new Set(skips ?? [])), [weekday, skips]);
  const [dateIdx, setDateIdx] = useState(0);
  const selectedDate = dates[dateIdx];
  const { data: statuses } = useRosterStatus(orgId, selectedDate, true);
  const [assignRole, setAssignRole] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Remember which teams are collapsed on this device, so they stay that way.
  const collapseKey = `sched-collapsed-${orgId}`;
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem(collapseKey) || '{}'); } catch { return {}; }
  });
  useEffect(() => {
    try { localStorage.setItem(collapseKey, JSON.stringify(collapsed)); } catch { /* ignore */ }
  }, [collapseKey, collapsed]);
  const toggleTeam = (id: string) => setCollapsed((c) => ({ ...c, [id]: !c[id] }));

  const teamList = teams ?? [];
  const onTeamDrag = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = teamList.map((t) => t.id);
    reorderTeams.mutate(arrayMove(ids, ids.indexOf(active.id as string), ids.indexOf(over.id as string)));
  };
  const onRoleDrag = (teamRoles: typeof roles, e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = (teamRoles ?? []).map((r) => r.id);
    reorderRoles.mutate(arrayMove(ids, ids.indexOf(active.id as string), ids.indexOf(over.id as string)));
  };

  const statusFor = (roleId: string, userId: string) =>
    (statuses ?? []).find((s) => s.roleId === roleId && s.userId === userId)?.status ?? 'pending';
  const noteFor = (roleId: string, userId: string) =>
    (statuses ?? []).find((s) => s.roleId === roleId && s.userId === userId)?.note ?? null;

  const needsSetup = (teams ?? []).length === 0 || (roles ?? []).length === 0;
  if (needsSetup) {
    return <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Add a team and at least one role in the <strong>Teams &amp; roles</strong> tab first. Then assign people to roles here — they&apos;ll be scheduled every week automatically.</p>;
  }

  async function assign(roleId: string, userId: string) {
    setError(null);
    try { await addToRoster.mutateAsync({ roleId, userId }); setAssignRole(null); }
    catch (e) { setError(errorMessage(e)); }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Week selector for confirm/decline statuses */}
      {dates.length > 0 && (
        <div className="flex items-center justify-between rounded-lg border p-2 text-sm" style={cardStyle}>
          <button type="button" disabled={dateIdx === 0} onClick={() => setDateIdx((i) => Math.max(0, i - 1))} className="rounded px-2 py-1 disabled:opacity-30">‹</button>
          <span className="font-medium">Responses for {fmtDate(selectedDate)}</span>
          <button type="button" disabled={dateIdx >= dates.length - 1} onClick={() => setDateIdx((i) => Math.min(dates.length - 1, i + 1))} className="rounded px-2 py-1 disabled:opacity-30">›</button>
        </div>
      )}

      <div className="flex items-center justify-between">
        {editing ? <span className="text-xs text-gray-500">Hold the ⠿ grip to drag a team or role.</span> : <span />}
        <button
          type="button"
          className="text-xs text-gray-500 underline"
          onClick={() => {
            const anyOpen = teamList.some((t) => !collapsed[t.id]);
            setCollapsed(Object.fromEntries(teamList.map((t) => [t.id, anyOpen])));
          }}
        >
          {teamList.some((t) => !collapsed[t.id]) ? 'Collapse all' : 'Expand all'}
        </button>
      </div>
      <SortableGroup enabled={editing} items={teamList.map((t) => t.id)} sensors={sensors} onDragEnd={onTeamDrag}>
          {teamList.map((t) => {
            const teamRoles = (roles ?? []).filter((r) => r.teamId === t.id);
            return (
              <MaybeSortable enabled={editing} id={t.id} key={t.id}>
                <div>
                  <button type="button" onClick={() => toggleTeam(t.id)} className="mb-1 flex w-full items-center gap-2 text-left" aria-expanded={!collapsed[t.id]}>
                    <span className="text-gray-400" aria-hidden>{collapsed[t.id] ? '▸' : '▾'}</span>
                    <span className={`font-semibold ${HEADER_CLS[size]}`} style={{ color: 'var(--th-heading)' }}>{t.name}</span>
                    <span className="ml-auto text-xs font-normal text-gray-400">{teamRoles.length} role{teamRoles.length === 1 ? '' : 's'}</span>
                  </button>
                  {!collapsed[t.id] && (
                  <SortableGroup enabled={editing} items={teamRoles.map((r) => r.id)} sensors={sensors} onDragEnd={(e) => onRoleDrag(teamRoles, e)}>
                      <div className="flex flex-col gap-2">
                        {teamRoles.map((r) => {
                          const people = (roster ?? []).filter((rr) => rr.roleId === r.id);
                          const availableMembers = (members ?? []).filter((m) => !people.some((p) => p.userId === m.userId));
                          return (
                            <MaybeSortable enabled={editing} id={r.id} key={r.id}>
                              <div className="rounded-lg border p-2" style={cardStyle}>
                                <p className={`font-medium ${ROLE_CLS[size]}`}>{r.name}</p>
                                <ul className="mt-1 flex flex-col gap-1">
                                  {people.map((p) => (
                                    <li key={p.userId} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                                      <span className="min-w-0 flex-1 truncate">{p.name || p.email}{p.userId === userId && <span className="text-gray-400"> (you)</span>}</span>
                                      <div className="flex shrink-0 items-center gap-2">
                                        {p.userId === userId && selectedDate ? (
                                          <>
                                            <button type="button" onClick={() => respond.mutate({ roleId: r.id, serveDate: selectedDate, status: 'confirmed' })} disabled={statusFor(r.id, p.userId) === 'confirmed'} className="rounded-full px-3 py-0.5 text-xs font-semibold disabled:opacity-50" style={{ backgroundColor: 'var(--th-primary)', color: 'var(--th-primary-text)' }}>{statusFor(r.id, p.userId) === 'confirmed' ? '✓ Confirmed' : 'Confirm'}</button>
                                            <button type="button" onClick={() => respond.mutate({ roleId: r.id, serveDate: selectedDate, status: 'declined' })} disabled={statusFor(r.id, p.userId) === 'declined'} className="rounded-full border px-3 py-0.5 text-xs font-semibold text-red-600 disabled:opacity-50" style={{ borderColor: 'var(--th-hairline-strong)' }}>{statusFor(r.id, p.userId) === 'declined' ? "Can't" : "Can't make it"}</button>
                                          </>
                                        ) : (
                                          <Badge status={statusFor(r.id, p.userId)} />
                                        )}
                                        <button type="button" onClick={() => removeFromRoster.mutate({ roleId: r.id, userId: p.userId })} className="rounded border border-gray-300 px-2 py-0.5 text-xs text-red-600 hover:bg-black/5">Remove</button>
                                      </div>
                                      {statusFor(r.id, p.userId) === 'declined' && noteFor(r.id, p.userId) && (
                                        <p className="w-full text-xs text-gray-500">Reason: {noteFor(r.id, p.userId)}</p>
                                      )}
                                    </li>
                                  ))}
                                  {people.length === 0 && <li className="text-xs text-gray-400">No one assigned yet.</li>}
                                </ul>
                                {assignRole === r.id ? (
                                  <select autoFocus className={input + ' mt-2'} defaultValue="" onChange={(e) => { if (e.target.value) assign(r.id, e.target.value); }}>
                                    <option value="">Choose a person…</option>
                                    {availableMembers.map((m) => <option key={m.userId} value={m.userId}>{m.name || m.email}</option>)}
                                  </select>
                                ) : (
                                  <button type="button" onClick={() => setAssignRole(r.id)} className="mt-2 rounded-full border px-3 py-1 text-xs font-semibold hover:bg-black/5" style={{ borderColor: 'var(--th-hairline-strong)' }}>+ Assign someone</button>
                                )}
                              </div>
                            </MaybeSortable>
                          );
                        })}
                      </div>
                  </SortableGroup>
                  )}
                </div>
              </MaybeSortable>
            );
          })}
      </SortableGroup>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

/** Move item at `idx` by `dir` (-1 up / +1 down) and return the new id order. */
function moved<T extends { id: string }>(list: T[], idx: number, dir: number): string[] {
  const ids = list.map((x) => x.id);
  const j = idx + dir;
  if (j < 0 || j >= ids.length) return ids;
  [ids[idx], ids[j]] = [ids[j], ids[idx]];
  return ids;
}

function useDragSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
}

/** A draggable row: a grip handle you can hold + drag, plus its content. */
function SortableRow({ id, children }: { id: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1, zIndex: isDragging ? 10 : undefined }}
      className="flex items-center gap-1"
    >
      <button type="button" className="cursor-grab touch-none px-1 text-gray-400 hover:text-gray-600" aria-label="Hold and drag to reorder" {...attributes} {...listeners}>⠿</button>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function TeamsTab({ orgId, editing }: { orgId: string; editing: boolean }) {
  const { data: teams } = useScheduleTeams(orgId);
  const { data: roles } = useScheduleRoles(orgId);
  const createTeam = useCreateTeam(orgId);
  const deleteTeam = useDeleteTeam(orgId);
  const createRole = useCreateRole(orgId);
  const deleteRole = useDeleteRole(orgId);
  const reorderTeams = useReorderTeams(orgId);
  const reorderRoles = useReorderRoles(orgId);
  const syncRoster = useSyncScheduleFromRoster(orgId);
  const [newTeam, setNewTeam] = useState('');
  const [roleDraft, setRoleDraft] = useState<Record<string, string>>({});
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const sensors = useDragSensors();

  async function runSync() {
    setSyncMsg(null);
    try {
      const r = await syncRoster.mutateAsync();
      setSyncMsg(`Synced from Roster — ${r.peopleAdded} added${r.teamsCreated ? `, ${r.teamsCreated} new team(s)` : ''}.`);
    } catch (e) { setSyncMsg(errorMessage(e)); }
  }

  const teamList = teams ?? [];

  const onTeamDrag = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = teamList.map((t) => t.id);
    reorderTeams.mutate(arrayMove(ids, ids.indexOf(active.id as string), ids.indexOf(over.id as string)));
  };
  const onRoleDrag = (teamRoles: typeof roles, e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = (teamRoles ?? []).map((r) => r.id);
    reorderRoles.mutate(arrayMove(ids, ids.indexOf(active.id as string), ids.indexOf(over.id as string)));
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <input className={input} placeholder="New team (e.g. Sunday AM)" value={newTeam} onChange={(e) => setNewTeam(e.target.value)} />
        <button type="button" disabled={!newTeam.trim() || createTeam.isPending} onClick={async () => { await createTeam.mutateAsync(newTeam); setNewTeam(''); }} className="shrink-0 rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ backgroundColor: 'var(--th-primary)', color: 'var(--th-primary-text)' }}>+ Team</button>
      </div>

      <div className="rounded-lg border p-3" style={cardStyle}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-medium">Fill from the Roster</span>
          <button type="button" onClick={runSync} disabled={syncRoster.isPending} className="rounded-full border px-3 py-1.5 text-xs font-semibold disabled:opacity-50" style={{ borderColor: 'var(--th-hairline-strong)' }}>
            {syncRoster.isPending ? 'Syncing…' : '⟳ Sync from Roster'}
          </button>
        </div>
        <p className="mt-1 text-xs text-gray-500">Turns each Roster group into a team and adds everyone with an account (their title becomes their role). It only adds — it won&apos;t remove anyone you scheduled by hand.</p>
        {syncMsg && <p className="mt-2 text-xs text-green-700">{syncMsg}</p>}
      </div>
      <p className="text-xs text-gray-500">{editing ? 'Hold the ⠿ grip and drag to reorder, or use ▲▼.' : 'Use ▲▼ to reorder (drag is available in Edit mode).'}</p>
      <SortableGroup enabled={editing} items={teamList.map((t) => t.id)} sensors={sensors} onDragEnd={onTeamDrag}>
          {teamList.map((t, ti) => {
            const teamRoles = (roles ?? []).filter((r) => r.teamId === t.id);
            return (
              <MaybeSortable enabled={editing} id={t.id} key={t.id}>
                <div className="rounded-lg border p-3" style={cardStyle}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1">
                      <ReorderButtons up={() => reorderTeams.mutate(moved(teamList, ti, -1))} down={() => reorderTeams.mutate(moved(teamList, ti, 1))} first={ti === 0} last={ti === teamList.length - 1} />
                      <span className="font-medium">{t.name}</span>
                    </div>
                    <button type="button" onClick={() => { if (confirm(`Delete team "${t.name}" and its roles?`)) deleteTeam.mutate(t.id); }} className="rounded border border-gray-300 px-2 py-0.5 text-xs text-red-600 hover:bg-black/5">Delete team</button>
                  </div>
                  <div className="mt-2 flex flex-col gap-1">
                    <SortableGroup enabled={editing} items={teamRoles.map((r) => r.id)} sensors={sensors} onDragEnd={(e) => onRoleDrag(teamRoles, e)}>
                        {teamRoles.map((r, ri) => (
                          <MaybeSortable enabled={editing} id={r.id} key={r.id}>
                            <div className="flex items-center justify-between gap-2 rounded bg-black/5 px-2 py-1 text-sm">
                              <div className="flex items-center gap-1">
                                <ReorderButtons up={() => reorderRoles.mutate(moved(teamRoles, ri, -1))} down={() => reorderRoles.mutate(moved(teamRoles, ri, 1))} first={ri === 0} last={ri === teamRoles.length - 1} />
                                <span>{r.name}</span>
                              </div>
                              <button type="button" onClick={() => deleteRole.mutate(r.id)} className="text-xs text-red-600" aria-label={`Remove ${r.name}`}>Remove</button>
                            </div>
                          </MaybeSortable>
                        ))}
                    </SortableGroup>
                  </div>
                  <div className="mt-2 flex gap-2">
                    <input className={input} placeholder="Add a role (e.g. Greeter)" value={roleDraft[t.id] ?? ''} onChange={(e) => setRoleDraft((d) => ({ ...d, [t.id]: e.target.value }))} />
                    <button type="button" disabled={!(roleDraft[t.id] ?? '').trim()} onClick={async () => { await createRole.mutateAsync({ teamId: t.id, name: roleDraft[t.id] }); setRoleDraft((d) => ({ ...d, [t.id]: '' })); }} className="shrink-0 rounded-full border px-3 py-2 text-sm font-semibold disabled:opacity-50" style={{ borderColor: 'var(--th-hairline-strong)' }}>+ Role</button>
                  </div>
                </div>
              </MaybeSortable>
            );
          })}
      </SortableGroup>
      {teamList.length === 0 && <p className="text-sm text-gray-500">No teams yet. Add one above.</p>}
    </div>
  );
}

function ReorderButtons({ up, down, first, last }: { up: () => void; down: () => void; first: boolean; last: boolean }) {
  return (
    <span className="flex flex-col leading-none">
      <button type="button" onClick={up} disabled={first} className="px-1 text-xs disabled:opacity-25" aria-label="Move up">▲</button>
      <button type="button" onClick={down} disabled={last} className="px-1 text-xs disabled:opacity-25" aria-label="Move down">▼</button>
    </span>
  );
}

function WeeksTab({ orgId }: { orgId: string }) {
  const { data: weekday = 0 } = useServeWeekday(orgId);
  const setWeekday = useSetServeWeekday(orgId);
  const { data: skips } = useSkips(orgId);
  const addSkip = useAddSkip(orgId);
  const removeSkip = useRemoveSkip(orgId);
  const [newSkip, setNewSkip] = useState('');

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Serving day of the week</span>
        <select className={input} value={weekday} onChange={(e) => setWeekday.mutate(Number(e.target.value))}>
          {WEEKDAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
        </select>
        <span className="text-xs text-gray-500">Everyone on the roster is scheduled for this day every week.</span>
      </label>

      <div className="rounded-lg border p-3" style={cardStyle}>
        <p className="text-sm font-medium">Weeks off (no one scheduled)</p>
        <div className="mt-2 flex gap-2">
          <input type="date" className={input} value={newSkip} onChange={(e) => setNewSkip(e.target.value)} />
          <button type="button" disabled={!newSkip} onClick={() => { addSkip.mutate(newSkip); setNewSkip(''); }} className="shrink-0 rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ backgroundColor: 'var(--th-primary)', color: 'var(--th-primary-text)' }}>+ Week off</button>
        </div>
        <ul className="mt-2 flex flex-col gap-1">
          {(skips ?? []).filter((d) => d >= todayIso()).map((d) => (
            <li key={d} className="flex items-center justify-between gap-2 text-sm">
              <span>{fmtDate(d)}</span>
              <button type="button" onClick={() => removeSkip.mutate(d)} className="rounded border border-gray-300 px-2 py-0.5 text-xs hover:bg-black/5">Undo</button>
            </li>
          ))}
          {(skips ?? []).filter((d) => d >= todayIso()).length === 0 && <li className="text-xs text-gray-400">No upcoming weeks off.</li>}
        </ul>
        <p className="mt-2 text-xs text-gray-500">Tip: pick the actual serving-day date you want to skip.</p>
      </div>
    </div>
  );
}

const DEFAULT_NOTIFY_TITLE = "You're scheduled to serve";
const DEFAULT_NOTIFY_MESSAGE = 'The schedule is posted — open the app to confirm or decline your serving times.';

function SettingsTab({ orgId, userId }: { orgId: string; userId: string }) {
  const { data: muted } = useScheduleMute(orgId, userId, true);
  const setMute = useSetScheduleMute(orgId, userId);
  const { data: defaults } = useNotifyDefaults(orgId);
  const saveDefaults = useSaveNotifyDefaults(orgId);
  const notify = useNotifyRoster(orgId);
  const { data: weekday = 0 } = useServeWeekday(orgId);
  const { data: skips } = useSkips(orgId);

  const [title, setTitle] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Seed the fields from saved defaults (or the built-in defaults) once loaded.
  const titleVal = title ?? (defaults?.title || DEFAULT_NOTIFY_TITLE);
  const messageVal = message ?? (defaults?.message || DEFAULT_NOTIFY_MESSAGE);
  // The next serving day the notification is about.
  const nextDate = useMemo(() => upcomingServeDates(weekday, new Set(skips ?? []), 1)[0], [weekday, skips]);

  async function send() {
    setError(null); setResult(null);
    try {
      const body = nextDate ? `${messageVal}\n\nServing date: ${fmtDate(nextDate)}` : messageVal;
      const r = await notify.mutateAsync({ title: titleVal, message: body, url: window.location.pathname });
      setResult(r.total === 0 ? 'No one on the roster has notifications turned on yet.' : `Sent to ${r.sent} of ${r.total} device(s).`);
    } catch (e) { setError(errorMessage(e)); }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border p-3" style={cardStyle}>
        <p className="text-sm font-medium">Notify volunteers the schedule is posted</p>
        <p className="mt-0.5 text-xs text-gray-500">Sends a push to everyone on the roster for the next serving day{nextDate ? ` (${fmtDate(nextDate)})` : ''} so they can confirm or decline. Edit the message or save it as your default.</p>
        <label className="mt-2 block text-xs font-medium">Title</label>
        <input className={input} value={titleVal} onChange={(e) => setTitle(e.target.value)} />
        <label className="mt-2 block text-xs font-medium">Message</label>
        <textarea className={input} rows={3} value={messageVal} onChange={(e) => setMessage(e.target.value)} />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button type="button" onClick={send} disabled={notify.isPending} className="rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ backgroundColor: 'var(--th-primary)', color: 'var(--th-primary-text)' }}>
            {notify.isPending ? 'Sending…' : 'Send to scheduled volunteers'}
          </button>
          <button type="button" onClick={() => saveDefaults.mutate({ title: titleVal, message: messageVal })} className="rounded-full border px-4 py-2 text-sm font-semibold" style={{ borderColor: 'var(--th-hairline-strong)' }}>
            {saveDefaults.isPending ? 'Saving…' : 'Save as default'}
          </button>
        </div>
        {result && <p className="mt-2 text-sm text-green-700">{result}</p>}
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>

      <label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm" style={cardStyle}>
        <span>
          <span className="block font-medium">Notify me when someone confirms or declines</span>
          <span className="block text-xs text-gray-500">Turn off to stop these push notifications (only affects you).</span>
        </span>
        <input type="checkbox" className="h-5 w-5" checked={!muted} onChange={(e) => setMute.mutate(!e.target.checked)} />
      </label>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Birthdays block — managers only. Pulls from what people entered at signup.
// ---------------------------------------------------------------------------
interface BirthdaysProps { title?: string; upcomingWeeks?: number }

/** MM-DD key from a 'YYYY-MM-DD' (or 'MM-DD') birthday. */
function monthDay(b: string): string {
  const parts = b.split('-');
  return parts.length === 3 ? `${parts[1]}-${parts[2]}` : b;
}
/** Days until the next occurrence of this month/day from today. */
function daysUntil(md: string): number {
  const [m, d] = md.split('-').map(Number);
  if (!m || !d) return 999;
  const now = new Date(); now.setHours(0, 0, 0, 0);
  let next = new Date(now.getFullYear(), m - 1, d);
  if (next < now) next = new Date(now.getFullYear() + 1, m - 1, d);
  return Math.round((next.getTime() - now.getTime()) / 86400000);
}
function fmtMonthDay(md: string): string {
  const [m, d] = md.split('-').map(Number);
  if (!m || !d) return md;
  return new Date(2000, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function BirthdaysView({ props, ctx }: { props: BirthdaysProps; ctx: ViewerCtx }) {
  const { data: org } = useOrganization(ctx.orgSlug);
  const { canEdit } = useMembershipRole(org?.id);
  const { user } = useAuth();
  const { data: birthdays } = useOrgBirthdays(org?.id, Boolean(org) && canEdit);
  const title = props.title || 'Birthdays';
  const weeks = Math.max(1, Math.min(8, Number(props.upcomingWeeks) || 2));

  if (ctx.editing) {
    return (
      <div className={card} style={cardStyle}>
        <p className="th-feature-title font-semibold" style={{ color: 'var(--th-heading)' }}>🎂 {title}</p>
        <p className="mt-1 text-sm text-gray-500">The birthday list is managers-only. Anyone can turn on their own daily birthday reminder here.</p>
      </div>
    );
  }
  if (!org) return <></>;

  // Everyone with an account can opt into birthday reminders — but only managers
  // see the actual list of people's birthdays. A signed-out viewer sees nothing.
  if (!canEdit) {
    if (!user) return <></>;
    return (
      <div className={card} style={cardStyle}>
        <p className="font-semibold uppercase tracking-wide" style={{ color: 'var(--th-heading)' }}>🎂 {title}</p>
        <BirthdayNotifyToggle orgId={org.id} />
      </div>
    );
  }

  const withDays = [...(birthdays ?? [])]
    .map((b) => ({ ...b, md: monthDay(b.birthday), days: daysUntil(monthDay(b.birthday)) }))
    .sort((a, b) => a.days - b.days);
  const today = withDays.filter((b) => b.days === 0);
  const upcoming = withDays.filter((b) => b.days >= 1 && b.days <= weeks * 7);

  return (
    <div className={card} style={cardStyle}>
      <p className="mb-3 font-semibold uppercase tracking-wide" style={{ color: 'var(--th-heading)' }}>🎂 {title}</p>

      <div className="mb-4">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Today</p>
        {today.length === 0 ? (
          <p className="text-sm text-gray-400">No birthdays today.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {today.map((b) => <BirthdayRow key={b.userId} b={b} highlight />)}
          </ul>
        )}
      </div>

      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Upcoming (next {weeks === 1 ? 'week' : `${weeks} weeks`})</p>
        {upcoming.length === 0 ? (
          <p className="text-sm text-gray-400">Nothing in the next {weeks === 1 ? 'week' : `${weeks} weeks`}.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {upcoming.map((b) => <BirthdayRow key={b.userId} b={b} />)}
          </ul>
        )}
      </div>

      {withDays.length === 0 && (
        <p className="mt-2 text-sm text-gray-500">Birthdays appear here once people add theirs at sign-up.</p>
      )}

      <BirthdayNotifyToggle orgId={org.id} />
      <BirthdayAlertSettings orgId={org.id} />
    </div>
  );
}

/** Anyone: opt in/out of receiving the daily birthday reminder yourself. */
function BirthdayNotifyToggle({ orgId }: { orgId: string }) {
  const { data: on } = useBirthdayOptIn(orgId);
  const setOptIn = useSetBirthdayOptIn(orgId);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="mt-4 rounded-lg border p-3" style={cardStyle}>
      <label className="flex items-center justify-between gap-3 text-sm">
        <span>
          <span className="block font-medium">🎂 Notify me about birthdays</span>
          <span className="block text-xs text-gray-500">Get today&apos;s birthdays on your phone. Only you control this.</span>
        </span>
        <input
          type="checkbox"
          className="h-5 w-5"
          checked={Boolean(on)}
          disabled={busy}
          onChange={async (e) => {
            setBusy(true); setErr(null);
            try { await setOptIn.mutateAsync(e.target.checked); }
            catch (ex) { setErr(errorMessage(ex)); }
            finally { setBusy(false); }
          }}
        />
      </label>
      {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
    </div>
  );
}

/** Readable label color for text sitting on the workspace accent. */
function accentLabel(): string {
  const accent = typeof window !== 'undefined'
    ? getComputedStyle(document.documentElement).getPropertyValue('--th-accent').trim()
    : '';
  return readableTextOn(accent || '#e23b2e');
}

function BirthdayRow({ b, highlight }: { b: { userId: string; name: string | null; email: string; phone: string | null; md: string; days: number }; highlight?: boolean }) {
  return (
    <li className="flex items-center justify-between gap-2 rounded-lg border p-3 text-sm" style={{ ...cardStyle, ...(highlight ? { backgroundColor: 'rgba(226,59,46,0.06)' } : {}) }}>
      <span className="min-w-0">
        <span className="block truncate font-medium">🎂 {b.name || b.email}</span>
        {b.phone && <a href={`tel:${b.phone}`} className="text-xs text-gray-500 underline">{b.phone}</a>}
      </span>
      {b.days <= 1 ? (
        // TODAY / TOMORROW as a filled accent pill. Plain accent-colored text
        // vanished against a dark background whenever the workspace accent was
        // itself dark; the label color here is derived from the accent so it
        // stays readable whatever accent is chosen, in either theme.
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-xs font-bold tracking-wide"
          style={{ backgroundColor: 'var(--th-accent)', color: accentLabel() }}
        >
          {b.days === 0 ? 'TODAY' : 'TOMORROW'}
        </span>
      ) : (
        <span className="shrink-0 text-right font-semibold" style={{ color: 'var(--th-text)' }}>
          {fmtMonthDay(b.md)}
        </span>
      )}
    </li>
  );
}

/** Managers-only: enable the daily birthday feature and pick the send time.
 *  Who actually receives it is each person's own choice (the toggle above). */
function BirthdayAlertSettings({ orgId }: { orgId: string }) {
  const { data: cfg } = useBirthdayConfig(orgId, true);
  const save = useSaveBirthdayConfig(orgId);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const enabledVal = enabled ?? cfg?.enabled ?? false;
  const timeVal = time ?? cfg?.notifyTime ?? '08:00';
  const tz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } })();

  function persist(next: { enabled: boolean; notifyTime: string }) {
    save.mutate({ enabled: next.enabled, notifyTime: next.notifyTime, timezone: tz });
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="mt-4 rounded-lg border p-3" style={cardStyle}>
      <label className="flex items-center justify-between gap-3 text-sm">
        <span>
          <span className="block font-medium">🔔 Daily birthday alerts (feature)</span>
          <span className="block text-xs text-gray-500">Turns the feature on and sets the time. Each person chooses to receive it above.</span>
        </span>
        <input type="checkbox" className="h-5 w-5" checked={enabledVal} onChange={(e) => { setEnabled(e.target.checked); persist({ enabled: e.target.checked, notifyTime: timeVal }); }} />
      </label>
      {enabledVal && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">Send at</span>
          <input type="time" className="rounded-md border border-gray-300 px-2 py-1.5 text-sm" value={timeVal} onChange={(e) => { setTime(e.target.value); persist({ enabled: enabledVal, notifyTime: e.target.value }); }} />
          <span className="text-xs text-gray-500">your time ({tz.split('/').pop()})</span>
        </div>
      )}
      {saved && <p className="mt-1 text-xs text-green-700">Saved ✓</p>}
    </div>
  );
}

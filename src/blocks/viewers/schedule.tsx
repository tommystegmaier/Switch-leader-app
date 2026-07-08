import { useMemo, useState } from 'react';

import { useAuth } from '@/auth/AuthProvider';
import { useMembershipRole } from '@/auth/useMembership';
import { useOrganization } from '@/data/hooks';
import { errorMessage } from '@/lib/errors';
import {
  useCreateAssignment, useCreateRole, useCreateTeam, useDeleteAssignment,
  useDeleteRole, useDeleteTeam, useFullSchedule, useMySchedule, useRespond,
  useScheduleMembers, useScheduleMute, useScheduleRoles, useScheduleTeams,
  useSetScheduleMute,
  type ScheduleRow,
} from '@/data/scheduleHooks';
import type { ViewerCtx } from '../actions';

interface ScheduleProps { title?: string }

/** Today's date as YYYY-MM-DD (local). */
function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Awaiting response', cls: 'bg-amber-100 text-amber-800' },
  confirmed: { label: 'Confirmed', cls: 'bg-green-100 text-green-800' },
  declined: { label: 'Declined', cls: 'bg-red-100 text-red-700' },
};

function Badge({ status }: { status: string }) {
  const b = STATUS_BADGE[status] ?? STATUS_BADGE.pending;
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${b.cls}`}>{b.label}</span>;
}

const card = 'rounded-xl border p-4';
const cardStyle = { borderColor: 'rgba(0,0,0,0.12)' } as const;
const input = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus-visible:ring-2';

export function ScheduleView({ props, ctx }: { props: ScheduleProps; ctx: ViewerCtx }) {
  const { data: org } = useOrganization(ctx.orgSlug);
  const { user } = useAuth();
  const { canEdit, isLoading } = useMembershipRole(org?.id);
  const title = props.title || 'Serving schedule';

  // In the editor surface, show a static placeholder so drag/reorder isn't
  // fighting the interactive controls. Managers use it live (Edit off).
  if (ctx.editing) {
    return (
      <div className={card} style={cardStyle}>
        <p className="font-semibold" style={{ color: 'var(--th-heading)' }}>📅 {title}</p>
        <p className="mt-1 text-sm text-gray-500">
          Volunteers see their own assignments here and confirm or decline. Turn off Edit to manage teams, assign people, and view responses.
        </p>
      </div>
    );
  }

  if (!org || isLoading) return <div className={card} style={cardStyle}><p className="text-sm text-gray-500">Loading schedule…</p></div>;

  if (!user) {
    return (
      <div className={card} style={cardStyle}>
        <p className="font-semibold" style={{ color: 'var(--th-heading)' }}>📅 {title}</p>
        <p className="mt-1 text-sm text-gray-600">Sign in to see the serving assignments you&apos;ve been given.</p>
        <a href={`/login?next=/o/${org.slug}`} className="mt-3 inline-block rounded-full px-5 py-2.5 text-sm font-semibold" style={{ backgroundColor: 'var(--th-primary)', color: 'var(--th-primary-text)' }}>Sign in</a>
      </div>
    );
  }

  return canEdit
    ? <ManagerSchedule orgId={org.id} userId={user.id} title={title} />
    : <VolunteerSchedule orgId={org.id} title={title} />;
}

// ---------------------------------------------------------------------------
// Volunteer view — only their own assignments.
// ---------------------------------------------------------------------------
function VolunteerSchedule({ orgId, title }: { orgId: string; title: string }) {
  const { data: mine, isLoading } = useMySchedule(orgId, true);
  const respond = useRespond(orgId);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const upcoming = (mine ?? []).filter((a) => a.serveDate >= todayIso());

  async function react(id: string, status: 'confirmed' | 'declined') {
    setError(null); setPendingId(id);
    try { await respond.mutateAsync({ id, status }); }
    catch (e) { setError(errorMessage(e)); }
    finally { setPendingId(null); }
  }

  return (
    <div className={card} style={cardStyle}>
      <p className="mb-3 font-semibold" style={{ color: 'var(--th-heading)' }}>📅 {title}</p>
      {isLoading ? (
        <p className="text-sm text-gray-500">Loading your assignments…</p>
      ) : upcoming.length === 0 ? (
        <p className="text-sm text-gray-500">You have no upcoming serving assignments. We&apos;ll let you know when you&apos;re scheduled.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {upcoming.map((a) => (
            <li key={a.id} className="rounded-lg border p-3" style={cardStyle}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{fmtDate(a.serveDate)}</span>
                <Badge status={a.status} />
              </div>
              <p className="mt-1 text-sm text-gray-600">{a.teamName} · {a.roleName}</p>
              {a.note && <p className="mt-1 text-xs text-gray-500">{a.note}</p>}
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={pendingId === a.id || a.status === 'confirmed'}
                  onClick={() => react(a.id, 'confirmed')}
                  className="flex-1 rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-50"
                  style={{ backgroundColor: 'var(--th-primary)', color: 'var(--th-primary-text)' }}
                >
                  {a.status === 'confirmed' ? '✓ Confirmed' : 'Confirm'}
                </button>
                <button
                  type="button"
                  disabled={pendingId === a.id || a.status === 'declined'}
                  onClick={() => react(a.id, 'declined')}
                  className="flex-1 rounded-full border px-4 py-2 text-sm font-semibold text-red-600 disabled:opacity-50"
                  style={{ borderColor: 'rgba(0,0,0,0.2)' }}
                >
                  {a.status === 'declined' ? "Can't serve" : "Can't make it"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Manager view — build teams/roles, assign people, see all responses.
// ---------------------------------------------------------------------------
type Tab = 'schedule' | 'teams' | 'settings';

function ManagerSchedule({ orgId, userId, title }: { orgId: string; userId: string; title: string }) {
  const [tab, setTab] = useState<Tab>('schedule');
  return (
    <div className={card} style={cardStyle}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold" style={{ color: 'var(--th-heading)' }}>📅 {title}</p>
        <div className="flex gap-1 text-sm">
          {(['schedule', 'teams', 'settings'] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded-full px-3 py-1 ${tab === t ? 'font-semibold' : 'opacity-60'}`}
              style={tab === t ? { backgroundColor: 'var(--th-primary)', color: 'var(--th-primary-text)' } : { border: '1px solid rgba(0,0,0,0.15)' }}
            >
              {t === 'schedule' ? 'Schedule' : t === 'teams' ? 'Teams & roles' : 'Notifications'}
            </button>
          ))}
        </div>
      </div>
      {tab === 'schedule' && <ManagerScheduleTab orgId={orgId} />}
      {tab === 'teams' && <ManagerTeamsTab orgId={orgId} />}
      {tab === 'settings' && <ManagerSettingsTab orgId={orgId} userId={userId} />}
    </div>
  );
}

function ManagerScheduleTab({ orgId }: { orgId: string }) {
  const { data: teams } = useScheduleTeams(orgId);
  const { data: roles } = useScheduleRoles(orgId);
  const { data: members } = useScheduleMembers(orgId, true);
  const { data: rows, isLoading } = useFullSchedule(orgId, true, todayIso());
  const createAssignment = useCreateAssignment(orgId);
  const deleteAssignment = useDeleteAssignment(orgId);

  const [teamId, setTeamId] = useState('');
  const [roleId, setRoleId] = useState('');
  const [personId, setPersonId] = useState('');
  const [serveDate, setServeDate] = useState(todayIso());
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const rolesForTeam = (roles ?? []).filter((r) => r.teamId === teamId);

  async function add() {
    setError(null);
    if (!roleId || !personId || !serveDate) { setError('Pick a team, role, person and date.'); return; }
    try {
      await createAssignment.mutateAsync({ roleId, userId: personId, serveDate, note });
      setPersonId(''); setNote('');
    } catch (e) { setError(errorMessage(e)); }
  }

  const needsSetup = (teams ?? []).length === 0 || (roles ?? []).length === 0;

  // Group rows by date for display.
  const grouped = useMemo(() => groupByDate(rows ?? []), [rows]);

  return (
    <div className="flex flex-col gap-4">
      {needsSetup ? (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">First add a team and at least one role under the <strong>Teams &amp; roles</strong> tab, then you can schedule people here.</p>
      ) : (
        <div className="rounded-lg border p-3" style={cardStyle}>
          <p className="mb-2 text-sm font-medium">Assign someone</p>
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-2">
              <select className={input + ' flex-1'} value={teamId} onChange={(e) => { setTeamId(e.target.value); setRoleId(''); }}>
                <option value="">Team…</option>
                {(teams ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <select className={input + ' flex-1'} value={roleId} onChange={(e) => setRoleId(e.target.value)} disabled={!teamId}>
                <option value="">Role…</option>
                {rolesForTeam.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            <select className={input} value={personId} onChange={(e) => setPersonId(e.target.value)}>
              <option value="">Person…</option>
              {(members ?? []).map((m) => <option key={m.userId} value={m.userId}>{m.name || m.email}</option>)}
            </select>
            <div className="flex flex-wrap gap-2">
              <input type="date" className={input + ' flex-1'} value={serveDate} onChange={(e) => setServeDate(e.target.value)} />
              <input type="text" className={input + ' flex-1'} placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <button type="button" onClick={add} disabled={createAssignment.isPending} className="self-start rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ backgroundColor: 'var(--th-primary)', color: 'var(--th-primary-text)' }}>
              {createAssignment.isPending ? 'Adding…' : '+ Add to schedule'}
            </button>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
        </div>
      )}

      <div>
        <p className="mb-2 text-sm font-medium">Upcoming</p>
        {isLoading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : grouped.length === 0 ? (
          <p className="text-sm text-gray-500">Nothing scheduled yet.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {grouped.map(([date, items]) => (
              <div key={date}>
                <p className="mb-1 text-sm font-semibold" style={{ color: 'var(--th-heading)' }}>{fmtDate(date)}</p>
                <ul className="flex flex-col gap-1">
                  {items.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2 text-sm" style={cardStyle}>
                      <span className="min-w-0 flex-1 truncate">
                        <span className="font-medium">{a.personName || a.personEmail}</span>
                        <span className="text-gray-500"> — {a.teamName} · {a.roleName}</span>
                      </span>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge status={a.status} />
                        <button type="button" onClick={() => deleteAssignment.mutate(a.id)} className="rounded border border-gray-300 px-2 py-0.5 text-xs text-red-600 hover:bg-black/5">Remove</button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function groupByDate(rows: ScheduleRow[]): [string, ScheduleRow[]][] {
  const map = new Map<string, ScheduleRow[]>();
  for (const r of rows) {
    const list = map.get(r.serveDate) ?? [];
    list.push(r);
    map.set(r.serveDate, list);
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function ManagerTeamsTab({ orgId }: { orgId: string }) {
  const { data: teams } = useScheduleTeams(orgId);
  const { data: roles } = useScheduleRoles(orgId);
  const createTeam = useCreateTeam(orgId);
  const deleteTeam = useDeleteTeam(orgId);
  const createRole = useCreateRole(orgId);
  const deleteRole = useDeleteRole(orgId);
  const [newTeam, setNewTeam] = useState('');
  const [roleDraft, setRoleDraft] = useState<Record<string, string>>({});

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <input className={input} placeholder="New team name (e.g. Sunday AM)" value={newTeam} onChange={(e) => setNewTeam(e.target.value)} />
        <button type="button" disabled={!newTeam.trim() || createTeam.isPending} onClick={async () => { await createTeam.mutateAsync(newTeam); setNewTeam(''); }} className="shrink-0 rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ backgroundColor: 'var(--th-primary)', color: 'var(--th-primary-text)' }}>+ Team</button>
      </div>

      {(teams ?? []).map((t) => (
        <div key={t.id} className="rounded-lg border p-3" style={cardStyle}>
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">{t.name}</span>
            <button type="button" onClick={() => { if (confirm(`Delete team "${t.name}" and its roles?`)) deleteTeam.mutate(t.id); }} className="rounded border border-gray-300 px-2 py-0.5 text-xs text-red-600 hover:bg-black/5">Delete team</button>
          </div>
          <ul className="mt-2 flex flex-wrap gap-1">
            {(roles ?? []).filter((r) => r.teamId === t.id).map((r) => (
              <li key={r.id} className="flex items-center gap-1 rounded-full bg-black/5 px-2 py-0.5 text-xs">
                {r.name}
                <button type="button" onClick={() => deleteRole.mutate(r.id)} className="text-red-600" aria-label={`Remove ${r.name}`}>×</button>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex gap-2">
            <input className={input} placeholder="Add a role (e.g. Greeter)" value={roleDraft[t.id] ?? ''} onChange={(e) => setRoleDraft((d) => ({ ...d, [t.id]: e.target.value }))} />
            <button type="button" disabled={!(roleDraft[t.id] ?? '').trim()} onClick={async () => { await createRole.mutateAsync({ teamId: t.id, name: roleDraft[t.id] }); setRoleDraft((d) => ({ ...d, [t.id]: '' })); }} className="shrink-0 rounded-full border px-3 py-2 text-sm font-semibold disabled:opacity-50" style={{ borderColor: 'rgba(0,0,0,0.2)' }}>+ Role</button>
          </div>
        </div>
      ))}
      {(teams ?? []).length === 0 && <p className="text-sm text-gray-500">No teams yet. Add one above.</p>}
    </div>
  );
}

function ManagerSettingsTab({ orgId, userId }: { orgId: string; userId: string }) {
  const { data: muted } = useScheduleMute(orgId, userId, true);
  const setMute = useSetScheduleMute(orgId, userId);
  return (
    <div className="flex flex-col gap-2">
      <label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm" style={cardStyle}>
        <span>
          <span className="block font-medium">Notify me when someone confirms or declines</span>
          <span className="block text-xs text-gray-500">Turn this off to stop receiving those push notifications (only affects you).</span>
        </span>
        <input
          type="checkbox"
          className="h-5 w-5"
          checked={!muted}
          onChange={(e) => setMute.mutate(!e.target.checked)}
        />
      </label>
    </div>
  );
}

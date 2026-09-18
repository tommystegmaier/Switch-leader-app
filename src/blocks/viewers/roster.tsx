import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  DndContext, PointerSensor, closestCenter, useSensor, useSensors,
  type DragEndEvent, type DraggableAttributes,
} from '@dnd-kit/core';
import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { useAuth } from '@/auth/AuthProvider';
import { useMembershipRole } from '@/auth/useMembership';
import { useOrganization } from '@/data/hooks';
import { useDark } from '@/lib/darkMode';
import { errorMessage } from '@/lib/errors';
import { uploadMedia } from '@/lib/media';
import {
  useAddRosterPerson, useCreateRosterGroup, useCreateRosterRole, useDeleteRosterGroup,
  useDeleteRosterPerson, useDeleteRosterRole, useRenameRosterGroup, useRenameRosterRole,
  useReorderRosterGroups, useReorderRosterPeople, useReorderRosterRoles, useRosterGroups,
  useRosterAccountOptions, useRosterGroupsAll, useRosterPeople, useRosterRoles, useSeedRosterRoles,
  useSetMyRosterPhoto, useUpdateRosterPerson,
  type PersonInput, type RosterAccountOption, type RosterGroup, type RosterPerson, type RosterRole,
} from '@/data/rosterHooks';
import type { ViewerCtx } from '../actions';

/**
 * Drag-to-reorder for a vertical list.
 *
 * Dragging only starts from the ⠿ handle, so everywhere else on a row still
 * scrolls normally — on a phone a whole-row drag target makes the list feel
 * stuck. The arrows stay: they're better for moving one place precisely, and
 * they're the only way to do this without a pointer.
 */
function SortableList({ ids, onReorder, children }: {
  ids: string[];
  onReorder: (ids: string[]) => void;
  children: ReactNode;
}) {
  // A few pixels of movement before a drag begins, so a tap on the handle is
  // still a tap.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    onReorder(arrayMove(ids, from, to));
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>{children}</SortableContext>
    </DndContext>
  );
}

/**
 * The grip. touchAction 'none' is what stops the browser scrolling the page
 * when a finger moves on it — without that, dragging on a phone just scrolls.
 */
function DragHandle({ attributes, listeners }: {
  attributes: DraggableAttributes;
  listeners: SyntheticListenerMap | undefined;
}) {
  return (
    <button
      type="button"
      {...attributes}
      {...listeners}
      className="shrink-0 cursor-grab px-1 text-gray-400 active:cursor-grabbing"
      style={{ touchAction: 'none' }}
      aria-label="Drag to reorder"
      title="Drag to reorder"
    >
      ⠿
    </button>
  );
}

/**
 * How deep group nesting is drawn. Generous enough that no real roster hits it,
 * low enough that a group accidentally made its own ancestor can't hang the
 * page. Anyone below it is still listed — see the "Elsewhere on the roster"
 * section, which catches whatever the tree didn't draw.
 */
const MAX_GROUP_DEPTH = 6;

type HeaderSize = 'sm' | 'md' | 'lg';
/** 'leader' is the leader roster; 'student' is the student roster. */
type RosterKind = 'leader' | 'student';
interface RosterProps { title?: string; headerSize?: HeaderSize; kind?: RosterKind }

// Roster keeps its own Small/Medium/Large control, but expressed as a multiple
// of the workspace's feature-heading size — so Medium matches every other
// feature header at any global setting, instead of drifting from them.
const HEADER_SCALE: Record<HeaderSize, number> = { sm: 0.8, md: 1, lg: 1.3 };
const headerSizeStyle = (size: HeaderSize) => ({
  fontSize: `calc(var(--th-feature-title, 1.125rem) * ${HEADER_SCALE[size]})`,
  lineHeight: 1.3,
});

const card = 'rounded-xl border p-4';
const cardStyle = { borderColor: 'var(--th-hairline)' } as const;
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

/**
 * The grades a small-group leader can be assigned to.
 *
 * Two different orders are needed here, which is why each entry carries its own
 * rank rather than the array position doing double duty:
 *
 *  • ARRAY ORDER is what the dropdown shows. The numbered grades come first,
 *    then the two catch-all bands at the bottom, so the common choices are the
 *    ones nearest the top when a manager opens the list.
 *  • RANK is how the roster sorts, youngest to oldest. Lowerclassmen sits
 *    between 10th and 11th, so those leaders group with the younger students
 *    they actually have, even though the dropdown lists them last.
 *
 * Every grade is numbered rather than named: Freshman and 9th Grade are the
 * same year, and offering both meant two leaders with identical assignments
 * could be tagged differently and never group together. One vocabulary, no
 * synonyms to keep straight.
 *
 * Keeping both orders on one object means a grade cannot exist in one and be
 * missing from the other. To add a grade a campus runs, add it once, here.
 */
export const GRADES = [
  { name: '6th Grade', rank: 1 },
  { name: '7th Grade', rank: 2 },
  { name: '8th Grade', rank: 3 },
  { name: '9th Grade', rank: 4 },
  { name: '10th Grade', rank: 5 },
  { name: '11th Grade', rank: 7 },
  { name: '12th Grade', rank: 8 },
  // Listed after 12th Grade, but ranked before 11th — see above.
  { name: 'Lowerclassmen', rank: 6 },
  { name: 'Upperclassmen', rank: 9 },
] as const;

/** Sort rank for a person's grade; anything unrecognised (or blank) sorts last. */
function gradeRank(p: { grade: string | null }): number {
  const g = (p.grade ?? '').trim().toLowerCase();
  if (!g) return Number.MAX_SAFE_INTEGER;
  return GRADES.find((o) => o.name.toLowerCase() === g)?.rank ?? Number.MAX_SAFE_INTEGER;
}

/**
 * Coaches first, then everyone else youngest grade to oldest.
 *
 * Coaches keep the top whatever grade they're tagged with — they lead the
 * group rather than sitting inside its age order. People with no grade fall to
 * the bottom of their section rather than the top, so an untagged person can't
 * split a run of tagged ones. Ties keep their existing order, because the sort
 * is stable and the list arrives already ordered by the manager's own sort.
 */
function coachFirst(list: RosterPerson[]): RosterPerson[] {
  return [...list].sort((a, b) => {
    const coach = (isCoach(a) ? 0 : 1) - (isCoach(b) ? 0 : 1);
    if (coach !== 0) return coach;
    if (isCoach(a)) return 0; // coaches among themselves: leave as-is
    return gradeRank(a) - gradeRank(b);
  });
}

/**
 * The grade a leader is assigned to, as a small pill.
 *
 * Deliberately distinct from the role text next to it — one says what they do,
 * the other says who they have — so a glance down the list picks out grades
 * without reading every card.
 */
function GradeTag({ grade }: { grade: string }) {
  return (
    <span
      className="inline-block rounded-full px-2 py-0.5 text-[0.7rem] font-semibold"
      style={{ backgroundColor: 'color-mix(in srgb, var(--th-primary) 14%, transparent)', color: 'var(--th-heading)' }}
    >
      {grade}
    </span>
  );
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
  // Youth Pastor only, and collapsed. See the note where it's rendered.
  const isYouthPastor = role === 'owner';
  const kind: RosterKind = props.kind === 'student' ? 'student' : 'leader';
  const reorderGroups = useReorderRosterGroups(org?.id ?? '', kind);
  const { data: groups } = useRosterGroups(org?.id, kind);
  // People come back filtered by RLS, then narrowed to this roster's groups —
  // a leader who is in both a leader group and a student group appears in
  // each, which is the point of being able to add them to both.
  const { data: allPeople } = useRosterPeople(org?.id);
  // Every group on this side, including the ones the board doesn't draw, so a
  // person in one of those can be named rather than silently dropped.
  const { data: everyGroup } = useRosterGroupsAll(org?.id, kind);
  const groupIdSet = new Set((groups ?? []).map((g) => g.id));
  const people = (allPeople ?? []).filter((p) => groupIdSet.has(p.groupId));

  // Anyone on this side of the roster whose group the tree above never drew —
  // an "All Leaders"/auto group, or something nested deeper than MAX_GROUP_DEPTH.
  // They used to just not appear, which is the worst way for a roster to fail.
  const groupById = new Map((everyGroup ?? []).map((g) => [g.id, g]));
  const elsewhere = (allPeople ?? []).filter(
    (p) => !groupIdSet.has(p.groupId) && groupById.has(p.groupId),
  );

  /**
   * Would clearing this entry cost the person their place in that channel?
   *
   * A role channel ("Coaches") contains anyone holding that role on ANY roster
   * entry. So the duplicate entry inside the Coaches group is usually pointless
   * — UNLESS it is that person's only Coach entry, in which case deleting it
   * quietly ejects them from the Coaches chat. That distinction is the whole
   * reason this isn't a plain Remove button.
   */
  const clearingIsSafe = (p: RosterPerson): boolean => {
    const g = groupById.get(p.groupId);
    if (!g) return true;
    // All-leaders entries never grant anything: membership there is simply
    // "you're on the roster", so an explicit row is always redundant.
    if (g.isAll) return true;
    if (!g.autoRole) return true;
    // An entry with no account attached grants nobody anything — channel
    // membership is looked up by account — so it can never be load-bearing.
    // Without this it would be flagged as one, and the warning would claim
    // somebody will "leave the chat" when they were never in it.
    if (!p.userId) return true;
    // A role channel: safe only if the role survives somewhere else. Note this
    // checks the ROLE, not merely being in another group: somebody listed as a
    // Group Leader elsewhere is still only a Coach by virtue of this entry.
    return (allPeople ?? []).some((other) => other.id !== p.id
      && other.userId && other.userId === p.userId
      && other.role === g.autoRole);
  };
  const safeToClear = elsewhere.filter(clearingIsSafe);

  const title = props.title || (kind === 'student' ? 'Student Roster' : 'Leader Roster');
  const size: HeaderSize = props.headerSize ?? 'md';

  // Managers can flip into an editing mode; default on when the app is in Edit mode.
  const [manage, setManage] = useState(Boolean(ctx.editing));
  useEffect(() => { if (ctx.editing) setManage(true); }, [ctx.editing]);
  // Tapping a person (in the normal view) opens a large card of their info.
  const [viewing, setViewing] = useState<RosterPerson | null>(null);
  const [showElsewhere, setShowElsewhere] = useState(false);
  // Clearing a stray roster entry. RLS already restricts this to
  // owner/admin/editor, and the panel itself is Youth Pastor only.
  const delPerson = useDeleteRosterPerson(org?.id ?? '');

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
        <p className="font-semibold" style={{ color: 'var(--th-heading)', ...headerSizeStyle(size) }}>👥 {title}</p>
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
            <button type="button" onClick={() => setManage((m) => !m)} className="rounded-full border px-3 py-1 text-xs font-semibold" style={{ borderColor: 'var(--th-hairline-strong)' }}>
              {manage ? 'Done' : '✎ Edit'}
            </button>
          )}
        </div>
      </div>

      {allGroups.length === 0 && !showManage && (
        <p className="text-sm text-gray-500">No one added to the roster yet.</p>
      )}

      <div className="flex flex-col gap-3">
        <SortableList ids={topGroups.map((g) => g.id)} onReorder={(ids) => reorderGroups.mutate(ids)}>
        {topGroups.map((g, gi) => (
          <GroupBlock
            key={g.id}
            orgId={org.id}
            kind={kind}
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
        </SortableList>
      </div>

      {/* The catch-all, folded away.
          It exists so the roster can't quietly be missing a person — but in
          practice almost everything in it is a Coach sitting in the automatic
          "Coaches" channel, which is correct and not worth a box on the page.
          So it's a quiet line you open when you're actually asking the
          question, and only the Youth Pastor sees it: it's a plumbing check,
          not something a leader browsing the roster needs to reason about. */}
      {isYouthPastor && elsewhere.length > 0 && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowElsewhere((v) => !v)}
            aria-expanded={showElsewhere}
            className="text-xs text-gray-500 underline"
          >
            {showElsewhere ? 'Hide details' : `Details · ${elsewhere.length} in groups not shown here`}
          </button>
          {showElsewhere && (
            <div className="mt-2 rounded-xl border p-3" style={cardStyle}>
              <p className="text-xs text-gray-500">
                These people have a roster entry in a group this page doesn&rsquo;t draw — normally
                the automatic all-{kind === 'student' ? 'students' : 'leaders'} or role channels,
                which are worked out from the roster rather than edited here. Nothing is wrong
                with them being listed; they&rsquo;ll also appear in their real groups above.
              </p>
              <ul className="mt-2 flex flex-col gap-1.5">
                {elsewhere.map((p) => {
                  const g = groupById.get(p.groupId);
                  const safe = clearingIsSafe(p);
                  return (
                    <li key={p.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                      <span className="font-medium">{p.name}</span>
                      <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs text-gray-600">
                        {g?.name}
                      </span>
                      {p.role && <span className="text-xs text-gray-500">{p.role}</span>}
                      {!safe && (
                        <span className="text-xs" style={{ color: '#b45309' }}>
                          only entry — keeps them in the chat
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          const msg = safe
                            ? `Clear ${p.name}'s duplicate entry in ${g?.name}?\n\n`
                              + `They stay in the ${g?.name} chat — they hold that role in a real group too. `
                              + 'Nothing else changes.'
                            : `Clear ${p.name}'s entry in ${g?.name}?\n\n`
                              + `WARNING: this is their ONLY "${g?.autoRole}" entry, so they will LEAVE the `
                              + `${g?.name} chat.\n\nIf you want them to stay, first set their role to `
                              + `"${g?.autoRole}" in one of their normal groups.`;
                          if (confirm(msg)) delPerson.mutate(p.id);
                        }}
                        className="ml-auto rounded px-2 py-0.5 text-xs text-red-600 underline"
                      >
                        Clear
                      </button>
                    </li>
                  );
                })}
              </ul>
              {safeToClear.length > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    if (!confirm(
                      `Clear ${safeToClear.length} duplicate entr${safeToClear.length === 1 ? 'y' : 'ies'}?\n\n`
                      + 'Only the ones that change nothing are cleared. Anyone whose entry is keeping '
                      + 'them in a chat is left alone.'
                    )) return;
                    for (const p of safeToClear) delPerson.mutate(p.id);
                  }}
                  className="mt-3 rounded-full border px-3 py-1.5 text-xs font-semibold"
                  style={{ borderColor: 'var(--th-hairline-strong)' }}
                >
                  Clear the {safeToClear.length} that change nothing
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {showManage && <AddGroup orgId={org.id} kind={kind} />}
      {showManage && isAdmin && <RoleListEditor orgId={org.id} kind={kind} />}

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
        {(person.role || person.grade) && (
          <div className="mt-1 flex flex-wrap items-center justify-center gap-1.5">
            {person.role && <RoleTag role={person.role} />}
            {person.grade && <GradeTag grade={person.grade} />}
          </div>
        )}
        {person.phone && (
          <div className="mt-4 flex flex-col items-center gap-2">
            <p className="text-sm text-gray-500">{person.phone}</p>
            <div className="flex justify-center gap-2">
              <a href={`tel:${person.phone}`} className="inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium" style={{ borderColor: 'var(--th-hairline-strong)' }}>
                📞 Call
              </a>
              <a href={`sms:${person.phone}`} className="inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium" style={{ borderColor: 'var(--th-hairline-strong)' }}>
                💬 Text
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// --- one group: header, its people, and (top level only) its subgroups -----
function GroupBlock({ orgId, kind, group, level, allGroups, people, collapsed, toggle, showManage, siblingIds, index, total, onOpen }: {
  orgId: string;
  kind: RosterKind;
  group: RosterGroup;
  /** 0 = a top group. Any depth is drawn; see the note on `subs`. */
  level: number;
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
  const reorderPeople = useReorderRosterPeople(orgId);
  const reorderGroups = useReorderRosterGroups(orgId, kind);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: group.id });
  const groupDragStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
    position: isDragging ? ('relative' as const) : undefined,
  };
  const directPeople = coachFirst(people.filter((p) => p.groupId === group.id));
  // Subgroups at ANY depth.
  //
  // This used to be `level === 0 ? … : []`, so a group nested three deep was
  // never drawn — and because `people` is narrowed to the groups that ARE
  // drawn, everyone inside it disappeared off the roster entirely while
  // staying in their chat. A roster that can silently omit a person is the
  // wrong tool for checking who is in a group.
  //
  // MAX_DEPTH is a guard, not a design limit: a group whose parent chain loops
  // back on itself would otherwise recurse until the tab dies.
  const subs = level < MAX_GROUP_DEPTH ? allGroups.filter((g) => g.parentId === group.id) : [];
  const subPeople = subs.reduce((n, s) => n + people.filter((p) => p.groupId === s.id).length, 0);
  const count = directPeople.length + subPeople;
  const open = !collapsed[group.id];
  const isTop = level === 0;
  const dark = useDark();
  // Top group: the app theme's Headings color as a solid bar, with the Button-
  // text color on top. Subgroup: a softened (lightened) version of that color.
  // In dark mode the Headings color is near-white, so a raised slate bar (with
  // light text) stands in for it — otherwise it'd be white-on-white.
  const headerBg = isTop
    ? (dark ? '#343c49' : 'var(--th-heading)')
    : (dark ? '#20262e' : 'color-mix(in srgb, var(--th-heading) 16%, white)');
  const headerFg = isTop
    ? (dark ? '#f2f4f7' : 'var(--th-primary-text)')
    : (dark ? '#c7cdd6' : 'var(--th-heading)');

  return (
    <div ref={setNodeRef} className="overflow-hidden rounded-xl border" style={{ ...cardStyle, ...(isTop ? { borderColor: 'var(--th-hairline-strong)' } : {}), ...groupDragStyle }}>
      <div className="flex items-center gap-2 px-3 py-2.5" style={{ backgroundColor: headerBg }}>
        {showManage && <DragHandle attributes={attributes} listeners={listeners} />}
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
              : dark
                ? { backgroundColor: 'rgba(255,255,255,0.12)', color: '#c7cdd6', border: '1px solid rgba(255,255,255,0.14)' }
                : { backgroundColor: 'rgba(255,255,255,0.65)', color: '#6b7280', border: '1px solid var(--th-hairline)' }}
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
          <SortableList
            ids={directPeople.map((x) => x.id)}
            onReorder={(ids) => reorderPeople.mutate(ids)}
          >
            {directPeople.map((p, pi) => (
              <PersonRow kind={kind} key={p.id} orgId={orgId} person={p} manage={showManage} index={pi} total={directPeople.length} peopleIds={directPeople.map((x) => x.id)} onOpen={onOpen} />
            ))}
          </SortableList>
          {showManage && <AddPerson orgId={orgId} kind={kind} groupId={group.id} />}

          {subs.length > 0 && (
            <div className="mt-1 flex flex-col gap-2 border-l-2 pl-3" style={{ borderColor: 'var(--th-hairline)' }}>
              <SortableList ids={subs.map((x) => x.id)} onReorder={(ids) => reorderGroups.mutate(ids)}>
              {subs.map((sub, si) => (
                <GroupBlock
                  key={sub.id}
                  orgId={orgId}
                  kind={kind}
                  group={sub}
                  level={level + 1}
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
              </SortableList>
            </div>
          )}

          {showManage && level === 0 && <AddGroup orgId={orgId} parentId={group.id} kind={kind} />}
          {!showManage && directPeople.length === 0 && subs.length === 0 && (
            <p className="text-xs text-gray-400">No one in this group yet.</p>
          )}
        </div>
      )}
    </div>
  );
}

// --- read-only + manage person row ----------------------------------------
function PersonRow({ orgId, kind, person, manage, index, total, peopleIds, onOpen }: { orgId: string; kind: RosterKind; person: RosterPerson; manage: boolean; index: number; total: number; peopleIds: string[]; onOpen: (p: RosterPerson) => void }) {
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const del = useDeleteRosterPerson(orgId);
  const reorder = useReorderRosterPeople(orgId);
  const mine = Boolean(user && person.userId && person.userId === user.id);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: person.id });
  const dragStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    // Lift the row being dragged above its neighbours.
    zIndex: isDragging ? 10 : undefined,
    position: isDragging ? ('relative' as const) : undefined,
  };

  if (editing) {
    return <PersonForm orgId={orgId} kind={kind} person={person} onDone={() => setEditing(false)} />;
  }

  // In the normal view, tapping the person opens a large, readable card.
  const Info = (
    <>
      <Avatar person={person} />
      <div className="min-w-0 flex-1 text-left">
        <p className="truncate font-medium">{person.name}{mine && <span className="text-gray-400"> (you)</span>}</p>
        {(person.role || person.grade) && (
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {person.role && <RoleTag role={person.role} />}
            {person.grade && <GradeTag grade={person.grade} />}
          </div>
        )}
        {person.phone && (
          <div className="mt-1 text-xs text-gray-500">{manage ? <a href={`sms:${person.phone}`} className="underline">{person.phone}</a> : person.phone}</div>
        )}
      </div>
    </>
  );

  return (
    <div ref={setNodeRef} className="flex items-center gap-3 rounded-lg border p-2" style={{ ...cardStyle, ...dragStyle }}>
      {manage && <DragHandle attributes={attributes} listeners={listeners} />}
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
function PersonForm({ orgId, kind, person, groupId, onDone }: { orgId: string; kind: RosterKind; person?: RosterPerson; groupId?: string; onDone: () => void }) {
  const add = useAddRosterPerson(orgId);
  const update = useUpdateRosterPerson(orgId);
  const { data: members } = useRosterAccountOptions(orgId, true);
  // Titles are per side: a leader roster needs a long, varied list and a
  // student roster needs about three entries.
  const { data: roles } = useRosterRoles(orgId, kind);
  const [name, setName] = useState(person?.name ?? '');
  const [role, setRole] = useState(person?.role ?? '');
  const [phone, setPhone] = useState(person?.phone ?? '');
  const [grade, setGrade] = useState(person?.grade ?? '');
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
    const payload: PersonInput = { name, role, phone, grade, photoUrl, userId };
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
          <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="rounded-full border px-3 py-1 text-xs font-semibold disabled:opacity-50" style={{ borderColor: 'var(--th-hairline-strong)' }}>
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
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Grade they lead <span className="font-normal text-gray-500">(optional)</span></span>
          <select className={input} value={grade} onChange={(e) => setGrade(e.target.value)}>
            <option value="">No grade</option>
            {GRADES.map((g) => <option key={g.name} value={g.name}>{g.name}</option>)}
            {/* A value saved before this list changed stays selectable, so
                editing someone's phone number can't silently clear it. */}
            {grade && !GRADES.some((g) => g.name === grade) && <option value={grade}>{grade}</option>}
          </select>
          <span className="text-xs text-gray-500">Tagged leaders are listed youngest grade first, under the coach.</span>
        </label>
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

function AddPerson({ orgId, kind, groupId }: { orgId: string; kind: RosterKind; groupId: string }) {
  const [open, setOpen] = useState(false);
  if (open) return <PersonForm orgId={orgId} kind={kind} groupId={groupId} onDone={() => setOpen(false)} />;
  return (
    <button type="button" onClick={() => setOpen(true)} className="self-start rounded-full border px-3 py-1 text-xs font-semibold hover:bg-black/5" style={{ borderColor: 'var(--th-hairline-strong)' }}>+ Add person</button>
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
        <input autoFocus className="w-32 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) { rename.mutate({ id: group.id, name }); setEditing(false); } }} />
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

function AddGroup({ orgId, parentId, kind }: { orgId: string; parentId?: string | null; kind: RosterKind }) {
  const create = useCreateRosterGroup(orgId, kind);
  const [name, setName] = useState('');
  const sub = Boolean(parentId);
  const submit = () => { if (name.trim()) { create.mutate({ name, parentId: parentId ?? null }); setName(''); } };
  return (
    <div className={`flex gap-2 ${sub ? 'mt-1' : 'mt-3'}`}>
      <input className={input} placeholder={sub ? 'New subgroup (e.g. Middle School Boys)' : 'New group (e.g. Leadership Team)'} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />
      <button type="button" disabled={!name.trim() || create.isPending} onClick={submit} className="shrink-0 rounded-full border px-4 py-2 text-sm font-semibold disabled:opacity-50" style={sub ? { borderColor: 'var(--th-hairline-strong)' } : { backgroundColor: 'var(--th-primary)', color: 'var(--th-primary-text)', borderColor: 'transparent' }}>{sub ? '+ Subgroup' : '+ Group'}</button>
    </div>
  );
}

// --- owner/admin: edit the list of titles/roles ---------------------------
function RoleListEditor({ orgId, kind }: { orgId: string; kind: RosterKind }) {
  const { data: roles } = useRosterRoles(orgId, kind);
  const create = useCreateRosterRole(orgId, kind);
  const seed = useSeedRosterRoles(orgId, kind);
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
            <button type="button" onClick={() => seed.mutate()} disabled={seed.isPending} className="self-start rounded-full border px-3 py-1 text-xs font-semibold disabled:opacity-50" style={{ borderColor: 'var(--th-hairline-strong)' }}>Add starter titles</button>
          )}
          {list.map((r, i) => <RoleRow key={r.id} orgId={orgId} role={r} index={i} total={list.length} ids={ids} />)}
          <div className="mt-1 flex gap-2">
            <input className={input} placeholder="Add a title (e.g. Worship)" value={newRole} onChange={(e) => setNewRole(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />
            <button type="button" disabled={!newRole.trim() || create.isPending} onClick={submit} className="shrink-0 rounded-full border px-3 py-2 text-xs font-semibold disabled:opacity-50" style={{ borderColor: 'var(--th-hairline-strong)' }}>+ Add</button>
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

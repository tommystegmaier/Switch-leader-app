import { useState } from 'react';

import { useCreateInvite, useInvites, useRevokeInvite } from '@/data/inviteHooks';
import {
  useAddRosterPerson, useDeleteRosterPerson, useRosterGroups, useRosterPeople,
} from '@/data/rosterHooks';
import {
  useDeleteStudent, useResetStudentPassword, useStudents, type Student,
} from '@/data/studentHooks';
import { errorMessage } from '@/lib/errors';

/**
 * Students — the sign-up link, and everyone who has used it.
 *
 * Separate from Team & access on purpose. Students aren't leaders with fewer
 * permissions: they join a different way, they have no email, and the thing a
 * Youth Pastor does most often here (reset a password for someone standing in
 * front of them) has no equivalent on the leader side.
 *
 * Youth Pastor and Coach only.
 */
export function StudentsSection({ orgId }: { orgId: string }) {
  const { data: students, isLoading } = useStudents(orgId);
  const { data: invites } = useInvites(orgId, true);
  const createInvite = useCreateInvite(orgId);
  const revokeInvite = useRevokeInvite(orgId);
  const removeStudent = useDeleteStudent(orgId);

  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [resetting, setResetting] = useState<Student | null>(null);
  const [grouping, setGrouping] = useState<Student | null>(null);

  // Student groups double as the Student Messaging channels, so putting
  // someone in a group here is the same act as putting them in the chat.
  const { data: studentGroups } = useRosterGroups(orgId, 'student');
  const { data: rosterPeople } = useRosterPeople(orgId);

  const groupNames = new Map((studentGroups ?? []).map((g) => [g.id, g.name]));
  const groupsFor = (userId: string) => (rosterPeople ?? [])
    .filter((p) => p.userId === userId && groupNames.has(p.groupId))
    .map((p) => ({ rowId: p.id, groupId: p.groupId, name: groupNames.get(p.groupId)! }));

  const inNoGroup = (students ?? []).filter((s) => groupsFor(s.userId).length === 0);

  // One link for everyone. A student link is meant to be read out from the
  // front or dropped in a group text, so a fresh code per student would be
  // unusable — and the code is only ever a door into sign-up, never access to
  // anything, because a new student sees no chat until a leader adds them.
  const studentInvite = (invites ?? []).find((i) => i.role === 'student');
  const link = studentInvite
    ? `${window.location.origin}/student?code=${studentInvite.code}`
    : null;

  async function makeLink() {
    setError(null);
    try {
      await createInvite.mutateAsync({ role: 'student' });
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <section className="mt-8">
      <h2 className="text-lg font-bold" style={{ color: 'var(--th-heading)' }}>Students</h2>
      <p className="mt-1 text-sm text-gray-500">
        Students sign up with their phone number instead of an email. Share the link below —
        anyone who uses it joins as a Student and can see student pages right away, but
        won&rsquo;t see any group chat until a leader adds them to a group.
      </p>

      {/* --- the sign-up link --- */}
      <div className="mt-3 rounded-lg border p-3" style={{ borderColor: 'var(--th-hairline)' }}>
        {link ? (
          <>
            <p className="mb-2 text-sm font-medium">Student sign-up link</p>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={link}
                onFocus={(e) => e.currentTarget.select()}
                className="min-w-0 flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
              <button
                type="button"
                className="rounded-md border border-gray-300 px-3 py-2 text-sm hover:bg-black/5"
                onClick={() => { void navigator.clipboard?.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <button
              type="button"
              className="mt-2 text-xs text-red-600 underline"
              onClick={() => { if (confirm('Turn off this link? Anyone who still has it won’t be able to sign up. Students who already joined keep their accounts.')) revokeInvite.mutate(studentInvite!.id); }}
            >
              Turn off this link
            </button>
          </>
        ) : (
          <>
            <p className="mb-2 text-sm text-gray-600">No student sign-up link yet.</p>
            <button
              type="button"
              onClick={makeLink}
              disabled={createInvite.isPending}
              className="rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-50"
              style={{ backgroundColor: 'var(--th-primary)', color: 'var(--th-primary-text)' }}
            >
              {createInvite.isPending ? 'Creating…' : 'Create a student sign-up link'}
            </button>
          </>
        )}
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>

      {inNoGroup.length > 0 && (
        <div className="mt-3 rounded-lg border p-3" style={{ borderColor: 'var(--th-hairline)' }}>
          <p className="text-sm font-semibold">
            {inNoGroup.length} student{inNoGroup.length === 1 ? ' isn\u2019t' : 's aren\u2019t'} in a group yet
          </p>
          <p className="mt-1 text-xs text-gray-600">
            A student sees no group chat at all until they&rsquo;re in one. Tap
            <span className="font-medium"> Groups </span> on their row below to put them in.
          </p>
        </div>
      )}

      {/* --- who has joined --- */}
      <div className="mt-4">
        <p className="mb-2 text-sm font-medium">
          {isLoading ? 'Loading…' : `${students?.length ?? 0} student${students?.length === 1 ? '' : 's'}`}
        </p>
        {(students ?? []).length === 0 && !isLoading && (
          <p className="text-sm text-gray-500">Nobody has signed up yet.</p>
        )}
        <ul className="flex flex-col gap-1.5">
          {(students ?? []).map((s) => (
            <li
              key={s.userId}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border p-2.5 text-sm"
              style={{ borderColor: 'var(--th-hairline)' }}
            >
              <span className="font-medium">{s.fullName}</span>
              {s.grade && <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs">{s.grade}</span>}
              {s.phone && <span className="text-xs text-gray-500">{s.phone}</span>}
              {groupsFor(s.userId).map((g) => (
                <span key={g.rowId} className="rounded-full bg-black/5 px-2 py-0.5 text-xs">{g.name}</span>
              ))}
              <span className="ml-auto flex items-center gap-2">
                <button type="button" onClick={() => setGrouping(s)} className="rounded px-2 py-1 text-xs underline">
                  Groups
                </button>
                <button type="button" onClick={() => setResetting(s)} className="rounded px-2 py-1 text-xs underline">
                  Reset password
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!confirm(
                      `Remove ${s.fullName}'s account?\n\n`
                      + 'Their messages and everything else about them is deleted for good. '
                      + 'Their phone number is freed, so if they come back they can sign up '
                      + 'again with the same student link.'
                    )) return;
                    setError(null);
                    removeStudent.mutate(s.userId, { onError: (e) => setError(errorMessage(e)) });
                  }}
                  className="rounded px-2 py-1 text-xs text-red-600 underline"
                >
                  Remove
                </button>
              </span>
            </li>
          ))}
        </ul>
      </div>

      {resetting && <ResetPasswordDialog student={resetting} onClose={() => setResetting(null)} />}
      {grouping && <GroupsDialog orgId={orgId} student={grouping} onClose={() => setGrouping(null)} />}
    </section>
  );
}

/**
 * Set a student a new password.
 *
 * Shows the password in plain text rather than hiding it, because the whole
 * point is that the leader reads it out to the student standing there. A
 * masked field they can't see would make this useless.
 */
function ResetPasswordDialog({ student, onClose }: { student: Student; onClose: () => void }) {
  const reset = useResetStudentPassword();
  const [password, setPassword] = useState(() => suggestPassword());
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setError(null);
    try {
      await reset.mutateAsync({ userId: student.userId, password });
      setDone(true);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl">
        <h3 className="mb-1 text-lg font-bold">Reset password</h3>
        <p className="mb-3 text-sm text-gray-500">for {student.fullName}</p>

        {done ? (
          <>
            <p className="mb-2 text-sm">Done. Their new password is:</p>
            <p className="mb-3 rounded-lg bg-black/5 p-3 text-center font-mono text-lg">{password}</p>
            <p className="mb-3 text-xs text-gray-500">
              Read it to them now — this is the only time it&rsquo;s shown, and it can&rsquo;t be emailed
              to them.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-full px-6 py-3 font-semibold"
              style={{ backgroundColor: 'var(--th-primary)', color: 'var(--th-primary-text)' }}
            >
              Close
            </button>
          </>
        ) : (
          <>
            <label className="mb-1 block text-sm font-medium">New password</label>
            <input
              className="mb-1 w-full rounded-md border border-gray-300 px-3 py-2 font-mono"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button type="button" className="mb-3 text-xs underline" onClick={() => setPassword(suggestPassword())}>
              Suggest another
            </button>
            {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="flex-1 rounded-full border border-gray-300 px-4 py-3 font-semibold">
                Cancel
              </button>
              <button
                type="button"
                onClick={go}
                disabled={password.length < 8 || reset.isPending}
                className="flex-1 rounded-full px-4 py-3 font-semibold disabled:opacity-50"
                style={{ backgroundColor: 'var(--th-primary)', color: 'var(--th-primary-text)' }}
              >
                {reset.isPending ? 'Setting…' : 'Set password'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Two short words and two digits — long enough to be a real password, easy
 * enough to say out loud once and type on a phone keyboard. No ambiguous
 * letters, and no words that could land badly in a church.
 */
const WORDS = [
  'river', 'maple', 'tiger', 'amber', 'stone', 'cedar', 'falcon', 'harbor',
  'lemon', 'cobalt', 'summit', 'meadow', 'walnut', 'copper', 'lantern', 'canyon',
];
function suggestPassword(): string {
  const pick = () => WORDS[Math.floor(Math.random() * WORDS.length)];
  const n = 10 + Math.floor(Math.random() * 90);
  return `${pick()}-${pick()}${n}`;
}


/**
 * Which group chats a student is in.
 *
 * This exists because the honest answer to "how do I get a student into a
 * chat?" was "leave here, find the page with the student roster on it, add a
 * person, then link them to their account" — four steps, in a different part
 * of the app from where you just signed them up. A student group IS the chat
 * channel, so ticking a box here is the same act, done where you already are.
 *
 * The roster board still works and is still the place to arrange groups. This
 * is the shortcut for the thing you do every week.
 */
function GroupsDialog({ orgId, student, onClose }: { orgId: string; student: Student; onClose: () => void }) {
  const { data: groups } = useRosterGroups(orgId, 'student');
  const { data: people } = useRosterPeople(orgId);
  const add = useAddRosterPerson(orgId);
  const remove = useDeleteRosterPerson(orgId);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Their existing row in each group, so untick can delete the right one.
  const rowFor = (groupId: string) =>
    (people ?? []).find((p) => p.userId === student.userId && p.groupId === groupId);

  async function toggle(groupId: string) {
    setError(null);
    setBusy(groupId);
    try {
      const existing = rowFor(groupId);
      if (existing) {
        await remove.mutateAsync(existing.id);
      } else {
        await add.mutateAsync({
          groupId,
          person: {
            name: student.fullName,
            phone: student.phone,
            grade: student.grade,
            userId: student.userId,
          },
        });
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl">
        <h3 className="mb-1 text-lg font-bold">Group chats</h3>
        <p className="mb-3 text-sm text-gray-500">{student.fullName}</p>

        {(groups ?? []).length === 0 ? (
          <p className="mb-3 text-sm text-gray-600">
            There are no student groups yet. Add a <span className="font-medium">Roster</span> block
            set to <span className="font-medium">Student roster</span> on a page, and make your
            groups there first.
          </p>
        ) : (
          <ul className="mb-3 flex flex-col gap-1">
            {(groups ?? []).map((g) => {
              const inIt = Boolean(rowFor(g.id));
              return (
                <li key={g.id}>
                  <button
                    type="button"
                    onClick={() => toggle(g.id)}
                    disabled={busy !== null}
                    className="flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm disabled:opacity-50"
                    style={{ borderColor: inIt ? 'var(--th-primary)' : 'var(--th-hairline)' }}
                  >
                    <span aria-hidden className="text-base">{inIt ? '☑' : '☐'}</span>
                    <span className="flex-1">{g.name}</span>
                    {busy === g.id && <span className="text-xs text-gray-400">…</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
        <p className="mb-3 text-xs text-gray-500">
          They&rsquo;ll see a group&rsquo;s chat as soon as it&rsquo;s ticked, and lose it when unticked.
        </p>
        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-full px-6 py-3 font-semibold"
          style={{ backgroundColor: 'var(--th-primary)', color: 'var(--th-primary-text)' }}
        >
          Done
        </button>
      </div>
    </div>
  );
}

import { useState } from 'react';

import { useCreateInvite, useInvites, useRevokeInvite, type Invite } from '@/data/inviteHooks';
import { errorMessage } from '@/lib/errors';
import { ROLE_LABEL_LONG } from '@/lib/roles';
import type { Role } from '@/types';

/**
 * One join link per role — the whole invite feature.
 *
 * It used to be a composer: type an email or phone to tie a link to one
 * person, press create, get a new row. Nobody used the targeting, and every
 * press minted another row, so the list filled up with identical "Leader"
 * entries that couldn't be told apart. A link per role is what was actually
 * wanted, and there is no way to accumulate duplicates because a role either
 * has its link or doesn't.
 *
 * Links are made on demand rather than up front: five rows of links nobody
 * asked for is five more things that work if they leak.
 */
export function InviteLinks({ orgId, isOwner }: { orgId: string; isOwner: boolean }) {
  const { data: invites } = useInvites(orgId, true);
  const create = useCreateInvite(orgId);
  const revoke = useRevokeInvite(orgId);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<Role | null>(null);
  const [busy, setBusy] = useState<Role | null>(null);

  // Least access first, so the safe one is the one under your thumb. Youth
  // Pastor only appears for a Youth Pastor: handing out your own level of
  // access shouldn't be one tap away for a Coach.
  const roles: Role[] = ['viewer', 'editor', 'admin', ...(isOwner ? ['owner' as Role] : []), 'student'];

  /** A general link has no email or phone on it. One per role is the point. */
  const generalFor = (role: Role): Invite | undefined =>
    (invites ?? []).find((i) => i.role === role && !i.email && !i.phone);

  /**
   * Everything the rows above don't show: links tied to one person by the old
   * composer, AND any SECOND general link for a role left over from when every
   * press made a new one.
   *
   * The duplicates matter. A row only shows the first link for its role, so a
   * spare would be invisible here while still working perfectly well — a live
   * way into the app with no way to turn it off. Listing them is the point.
   */
  const extras = (invites ?? []).filter((i) => {
    if (i.email || i.phone) return true;
    const first = generalFor(i.role);
    return first ? first.id !== i.id : false;
  });

  const linkFor = (inv: Invite) => (inv.role === 'student'
    // Students have their own form: no email asked for, and it collects a
    // graduation year and birthday.
    ? `${window.location.origin}/student?code=${inv.code}`
    : `${window.location.origin}/join?code=${inv.code}`);

  async function copyLink(role: Role) {
    setError(null);
    setBusy(role);
    try {
      let inv = generalFor(role);
      if (!inv) {
        const code = await create.mutateAsync({ role });
        inv = { id: '', code, role, email: null, phone: null, expiresAt: null };
      }
      await navigator.clipboard?.writeText(linkFor(inv));
      setCopied(role);
      setTimeout(() => setCopied(null), 2000);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <p className="mb-3 text-sm text-gray-500">
        One link per role. Copy the one you want and text it to whoever needs it — they open it,
        make an account, and they&rsquo;re in with that role. Anyone who has the link can use it,
        so turn it off if it gets passed around.
      </p>

      <ul className="flex flex-col gap-1.5">
        {roles.map((role) => {
          const inv = generalFor(role);
          return (
            <li
              key={role}
              className="flex flex-wrap items-center gap-2 rounded-lg border p-2.5 text-sm"
              style={{ borderColor: 'var(--th-hairline)' }}
            >
              <span className="min-w-0 flex-1">{ROLE_LABEL_LONG[role]}</span>
              <button
                type="button"
                onClick={() => copyLink(role)}
                disabled={busy !== null}
                className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                style={{ backgroundColor: 'var(--th-primary)', color: 'var(--th-primary-text)' }}
              >
                {copied === role ? 'Copied ✓' : busy === role ? 'Working…' : inv ? 'Copy link' : 'Create link'}
              </button>
              {inv && (
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`Turn off the ${ROLE_LABEL_LONG[role]} link?\n\nAnyone still holding it won't be able to join. People who already joined keep their access.`)) {
                      revoke.mutate(inv.id);
                    }
                  }}
                  className="shrink-0 rounded px-2 py-1 text-xs text-red-600 underline"
                >
                  Turn off
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {/* Spare links the rows above don't show — old targeted ones, and second
          copies for a role. All of them still work, so they are listed here
          rather than left live and invisible. */}
      {extras.length > 0 && (
        <div className="mt-4">
          <p className="mb-1 text-xs font-semibold text-gray-500">
            Extra links still working ({extras.length})
          </p>
          <p className="mb-2 text-xs text-gray-500">
            Left over from before there was one link per role. They all still let
            someone in — turn off any you don&rsquo;t need.
          </p>
          <ul className="flex flex-col gap-1">
            {extras.map((inv) => (
              <li key={inv.id} className="flex items-center gap-2 text-xs">
                <span className="min-w-0 flex-1 truncate rounded bg-black/5 px-2 py-1">
                  {ROLE_LABEL_LONG[inv.role] ?? inv.role}
                  <span className="text-gray-500">
                    {' · '}
                    {inv.email || inv.phone || 'spare link'}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    // The role rows above confirm; these didn't. Same action,
                    // same consequence — somebody part-way through signing up
                    // loses their link — so the same question.
                    if (confirm(
                      `Turn off this ${ROLE_LABEL_LONG[inv.role] ?? inv.role} link?\n\n`
                      + 'Anyone still holding it won\u2019t be able to join. People who already '
                      + 'joined keep their access.'
                    )) revoke.mutate(inv.id);
                  }}
                  className="shrink-0 rounded px-2 py-1 text-red-600 underline"
                >
                  Turn off
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}

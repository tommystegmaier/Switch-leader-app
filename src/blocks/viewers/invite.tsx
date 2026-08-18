import { useState } from 'react';

import { useMembershipRole } from '@/auth/useMembership';
import { useOrganization } from '@/data/hooks';
import { useCreateInvite, useInvites, useRevokeInvite } from '@/data/inviteHooks';
import { errorMessage } from '@/lib/errors';
import type { Role } from '@/types';
import type { ViewerCtx } from '../actions';

interface InviteProps { title?: string }

const ROLE_LABEL: Record<string, string> = {
  owner: 'Owner (full control)',
  admin: 'Admin (can edit + manage people)',
  editor: 'Editor (can edit the app)',
  viewer: 'Viewer (can only look)',
};

const card = 'rounded-xl border p-4';
const cardStyle = { borderColor: 'var(--th-hairline)' } as const;
const input = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus-visible:ring-2';

/**
 * Invite-a-teammate as a placeable block. Only owners/admins see the composer
 * (they're the only ones who can create invites); for everyone else it renders
 * nothing so it can safely live on a shared page.
 */
export function InviteView({ props, ctx }: { props: InviteProps; ctx: ViewerCtx }) {
  const { data: org } = useOrganization(ctx.orgSlug);
  const { role } = useMembershipRole(org?.id);
  const title = props.title || 'Invite a teammate';
  const isAdmin = role === 'owner' || role === 'admin';
  const isOwner = role === 'owner';

  const { data: invites } = useInvites(org?.id, Boolean(org) && isAdmin);
  const createInvite = useCreateInvite(org?.id ?? '');
  const revokeInvite = useRevokeInvite(org?.id ?? '');

  // Viewer by default: most invites go to leaders who only need to look, and a
  // role is far easier to raise later than to discover you handed out by
  // accident. Anything more has to be chosen deliberately.
  const [inviteRole, setInviteRole] = useState<Role>('viewer');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  if (ctx.editing) {
    return (
      <div className={card} style={cardStyle}>
        <p className="th-feature-title font-semibold" style={{ color: 'var(--th-heading)' }}>✉️ {title}</p>
        <p className="mt-1 text-sm text-gray-500">Owners/admins get an invite composer here (create a join link with a role). Hidden from everyone else.</p>
      </div>
    );
  }
  if (!org || !isAdmin) return <></>;

  const joinLinkFor = (code: string) => `${window.location.origin}/join?code=${code}`;
  async function copy(text: string) {
    try { await navigator.clipboard?.writeText(text); setCopied(text); setTimeout(() => setCopied(null), 2000); } catch { /* clipboard unavailable */ }
  }
  async function onCreate() {
    setError(null);
    try {
      const code = await createInvite.mutateAsync({ role: inviteRole, email, phone });
      setEmail('');
      setPhone('');
      await copy(joinLinkFor(code));
    } catch (e) { setError(errorMessage(e)); }
  }

  return (
    <div className={card} style={cardStyle}>
      {/* Collapsible: the pending-invite list grows over time and this sits on
          a page managers scroll past constantly. Collapsed by default. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span className="th-feature-title font-semibold" style={{ color: 'var(--th-heading)' }}>
          ✉️ {title}
          {!open && invites && invites.length > 0 && (
            <span className="ml-2 text-sm font-normal text-gray-500">{invites.length} pending</span>
          )}
        </span>
        <span aria-hidden className="shrink-0 text-gray-400 transition-transform" style={{ transform: open ? 'rotate(90deg)' : 'none' }}>›</span>
      </button>
      {!open ? null : (
      <>
      <p className="mb-3 mt-2 text-sm text-gray-500">Create a join link with a role. Optionally tie it to someone&apos;s email or phone number so only they can use it.</p>

      <div className="flex flex-col gap-2">
        <input type="email" className={input} placeholder="Their email (optional — ties the link to them)" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input type="tel" autoComplete="tel" className={input} placeholder="Or their phone number (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <div className="flex flex-wrap items-center gap-2">
          {/* Viewer first as well as default — the list reads least-access-first,
              so the safe choice is the one under your thumb. */}
          <select className="rounded-md border border-gray-300 px-2 py-2 text-sm" value={inviteRole} onChange={(e) => setInviteRole(e.target.value as Role)}>
            <option value="viewer">{ROLE_LABEL.viewer}</option>
            <option value="editor">{ROLE_LABEL.editor}</option>
            <option value="admin">{ROLE_LABEL.admin}</option>
            {isOwner && <option value="owner">{ROLE_LABEL.owner}</option>}
          </select>
          <button type="button" onClick={onCreate} disabled={createInvite.isPending} className="rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ backgroundColor: 'var(--th-primary)', color: 'var(--th-primary-text)' }}>
            {createInvite.isPending ? 'Creating…' : 'Create invite link'}
          </button>
        </div>
        <p className="text-xs text-gray-500">The link is copied to your clipboard — text or email it to the person. They open it, create an account, and they&apos;re in.</p>
      </div>

      {(invites ?? []).length > 0 && (
        <ul className="mt-3 flex flex-col gap-1 text-sm">
          {(invites ?? []).map((inv) => {
            const link = joinLinkFor(inv.code);
            return (
              <li key={inv.id} className="flex items-center justify-between gap-2">
                <span className="min-w-0 flex-1 truncate rounded bg-black/5 px-2 py-1 text-xs">
                  {ROLE_LABEL[inv.role] ?? inv.role}
                  {inv.email && <span className="text-gray-500"> · {inv.email}</span>}
                  {inv.phone && <span className="text-gray-500"> · {inv.phone}</span>}
                </span>
                <div className="flex shrink-0 items-center gap-2">
                  <button type="button" className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-black/5" onClick={() => copy(link)}>{copied === link ? 'Copied ✓' : 'Copy link'}</button>
                  <button type="button" className="rounded border border-gray-300 px-2 py-1 text-xs text-red-600 hover:bg-black/5" onClick={() => revokeInvite.mutate(inv.id)}>Revoke</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </>
      )}
    </div>
  );
}

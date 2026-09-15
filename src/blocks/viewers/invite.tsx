import { useState } from 'react';

import { useMembershipRole } from '@/auth/useMembership';
import { useOrganization } from '@/data/hooks';
import { useInvites } from '@/data/inviteHooks';
import { InviteLinks } from '@/editor/InviteLinks';
import type { ViewerCtx } from '../actions';

interface InviteProps { title?: string }

const card = 'rounded-xl border p-4';
const cardStyle = { borderColor: 'var(--th-hairline)' } as const;

/**
 * Invite-to-app as a placeable block. Only owners/admins can create invites,
 * so for everyone else it renders nothing and can safely live on a shared page.
 */
export function InviteView({ props, ctx }: { props: InviteProps; ctx: ViewerCtx }) {
  const { data: org } = useOrganization(ctx.orgSlug);
  const { role } = useMembershipRole(org?.id);
  const title = props.title || 'Invite to App';
  const isAdmin = role === 'owner' || role === 'admin';
  const isOwner = role === 'owner';

  const { data: invites } = useInvites(org?.id, Boolean(org) && isAdmin);
  const [open, setOpen] = useState(false);

  if (ctx.editing) {
    return (
      <div className={card} style={cardStyle}>
        <p className="th-feature-title font-semibold" style={{ color: 'var(--th-heading)' }}>✉️ {title}</p>
        <p className="mt-1 text-sm text-gray-500">
          A join link for each role — Leader, Leader with edit access, Coach, Youth Pastor, Student.
          Only the Youth Pastor and Coaches see it; hidden from everyone else.
        </p>
      </div>
    );
  }
  if (!org || !isAdmin) return <></>;

  const live = (invites ?? []).length;

  return (
    <div className={card} style={cardStyle}>
      {/* Collapsible: this sits on a page managers scroll past constantly. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span className="th-feature-title font-semibold" style={{ color: 'var(--th-heading)' }}>
          ✉️ {title}
          {!open && live > 0 && (
            <span className="ml-2 text-sm font-normal text-gray-500">{live} live</span>
          )}
        </span>
        <span aria-hidden className="shrink-0 text-gray-400 transition-transform" style={{ transform: open ? 'rotate(90deg)' : 'none' }}>›</span>
      </button>
      {open && (
        <div className="mt-3">
          <InviteLinks orgId={org.id} isOwner={isOwner} />
        </div>
      )}
    </div>
  );
}

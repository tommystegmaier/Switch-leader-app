import { useMembershipRole } from '@/auth/useMembership';
import { useOrganization } from '@/data/hooks';
import { TeamAccessSection } from '@/editor/SettingsPage';
import type { ViewerCtx } from '../actions';

interface TeamAccessProps { title?: string }

/**
 * The "Team & access" panel (people, roles, invites, notification status) as a
 * placeable block. Owners/admins only — everyone else sees nothing, so it's
 * safe to drop on any page. Reuses the exact same panel as Settings.
 */
export function TeamAccessBlockView({ ctx }: { props: TeamAccessProps; ctx: ViewerCtx }) {
  const { data: org } = useOrganization(ctx.orgSlug);
  const { role } = useMembershipRole(org?.id);
  const isAdmin = role === 'owner' || role === 'admin';

  if (ctx.editing) {
    return (
      <div className="rounded-xl border p-4" style={{ borderColor: 'var(--th-hairline)' }}>
        <p className="font-semibold" style={{ color: 'var(--th-heading)' }}>👥 Team &amp; access</p>
        <p className="mt-1 text-sm text-gray-500">Manage people, roles, and invites — and see who has notifications on. Only owners &amp; admins can see this block.</p>
      </div>
    );
  }
  if (!org || !isAdmin) return <></>;
  return <TeamAccessSection orgId={org.id} currentRole={role} />;
}

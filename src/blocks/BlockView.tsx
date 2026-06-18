import type { Block, Role, VisibilityRule } from '@/types';
import type { ViewerCtx } from './actions';
import { getBlockDef } from './registry';

/**
 * Renders one block by looking it up in the registry. Unknown types degrade
 * gracefully (e.g. a block added by a newer build). This replaces the Phase 1
 * placeholder renderer.
 */
export function BlockView({ block, ctx }: { block: Block; ctx: ViewerCtx }) {
  const def = getBlockDef(block.type);
  if (!def) {
    return (
      <div className="rounded-md border border-dashed border-gray-300 p-3 text-sm text-gray-500">
        Unknown block type "{block.type}".
      </div>
    );
  }
  const Viewer = def.Viewer;
  return <Viewer props={block.props as never} ctx={ctx} />;
}

/**
 * Visibility check used by the read-only Viewer. Phase 1 audiences:
 * "everyone" (default) and "admins" (staging). Forward-compatible with named
 * roles. NOTE: this is a display rule layered on top of RLS, which already
 * guarantees a viewer can't *write* anything.
 */
export function isVisibleTo(rule: VisibilityRule | undefined, role: Role | null): boolean {
  if (!rule || rule.kind === 'everyone') return true;
  const isEditor = role === 'owner' || role === 'admin' || role === 'editor';
  if (rule.kind === 'admins') return isEditor;
  if (rule.kind === 'roles') {
    // Named-role gating (future): editors always see; otherwise role must match.
    return isEditor || (role !== null && rule.roles.includes(role));
  }
  return true;
}

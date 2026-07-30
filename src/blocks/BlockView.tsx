import { useEffect, type CSSProperties } from 'react';

import type { Block, Role, VisibilityRule } from '@/types';
import type { ViewerCtx } from './actions';
import { getBlockDef } from './registry';

export type BlockWidth = 'full' | 'half' | 'third';

/** The chosen layout width for a block (defaults: 2-col cards → half, else full). */
export function blockWidth(block: Block): BlockWidth {
  const w = (block.props as { __width?: string }).__width;
  if (w === 'half' || w === 'third') return w;
  if (block.type === 'card' && (block.props as { columns?: number }).columns === 2) return 'half';
  return 'full';
}

/** Flex sizing so half/third-width blocks sit side by side (gap-4 = 1rem). */
export function blockFlexStyle(block: Block): CSSProperties {
  switch (blockWidth(block)) {
    case 'half':
      return { flexBasis: 'calc(50% - 0.5rem)', maxWidth: 'calc(50% - 0.5rem)', flexGrow: 1 };
    case 'third':
      return { flexBasis: 'calc(33.333% - 0.667rem)', maxWidth: 'calc(33.333% - 0.667rem)', flexGrow: 1 };
    default:
      return { flexBasis: '100%', maxWidth: '100%' };
  }
}

/**
 * Renders one block by looking it up in the registry. Unknown types degrade
 * gracefully (e.g. a block added by a newer build). This replaces the Phase 1
 * placeholder renderer.
 */
export function BlockView({ block, ctx }: { block: Block; ctx: ViewerCtx }) {
  const def = getBlockDef(block.type);
  if (!def) return <StaleBlockNotice />;
  const Viewer = def.Viewer;
  return <Viewer props={block.props as never} ctx={{ ...ctx, blockId: block.id }} />;
}

/**
 * An unrecognized block type almost always means this browser is running an
 * older cached build (e.g. a desktop tab left open before a new block shipped).
 * Instead of a dead "unknown block" message, pull the newest version and reload
 * once (guarded so it can't loop); if that doesn't resolve it, offer a button.
 */
function StaleBlockNotice() {
  useEffect(() => {
    if (sessionStorage.getItem('th-stale-reloaded')) return;
    sessionStorage.setItem('th-stale-reloaded', '1');
    const reload = () => window.location.reload();
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration()
        .then((reg) => (reg ? reg.update().catch(() => {}) : undefined))
        .finally(reload);
    } else {
      reload();
    }
  }, []);

  return (
    <div className="rounded-xl border p-4 text-center text-sm text-gray-600" style={{ borderColor: 'rgba(0,0,0,0.12)' }}>
      <p className="font-medium" style={{ color: 'var(--th-heading)' }}>Updating to the latest version…</p>
      <p className="mt-1 text-gray-500">If this doesn&apos;t refresh on its own, tap below.</p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mt-3 rounded-full px-5 py-2 text-sm font-semibold"
        style={{ backgroundColor: 'var(--th-primary)', color: 'var(--th-primary-text)' }}
      >
        Refresh
      </button>
    </div>
  );
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

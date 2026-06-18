import { safeUrl } from './sanitize';

/** A tap action shared by button, card, and list-row blocks. */
export interface BlockAction {
  type: 'url' | 'page' | 'email' | 'phone';
  /** url = href, page = page slug, email = address, phone = number. */
  target: string;
}

export interface ViewerCtx {
  orgSlug: string;
  navigate: (to: string) => void;
}

/**
 * Resolves a BlockAction to either an href (for native link semantics, good for
 * accessibility / new tabs) or an onClick (for client-side page navigation).
 * Returns null when the action has no usable target.
 */
export function resolveAction(
  action: BlockAction | undefined,
  ctx: ViewerCtx,
  opts: { openInNewTab?: boolean } = {},
): { href?: string; onClick?: () => void; newTab: boolean } | null {
  if (!action || !action.target) return null;
  const newTab = Boolean(opts.openInNewTab);

  switch (action.type) {
    case 'page':
      return { onClick: () => ctx.navigate(`/o/${ctx.orgSlug}/${action.target}`), newTab: false };
    case 'email': {
      return { href: `mailto:${action.target}`, newTab: false };
    }
    case 'phone':
      return { href: `tel:${action.target}`, newTab: false };
    case 'url':
    default: {
      const url = safeUrl(action.target);
      return url ? { href: url, newTab } : null;
    }
  }
}

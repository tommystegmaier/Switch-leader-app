import type { ReactNode } from 'react';

import { resolveAction, type ViewerCtx } from '../actions';
import type {
  ButtonProps,
  CardProps,
  LinkProps,
  ListProps,
} from '../blockProps';
import { safeUrl } from '../sanitize';

/**
 * The button — the workhorse: tall fully-rounded pill, full-width by default,
 * centered label with optional leading emoji. Colors come from props or theme.
 */
export function ButtonView({ props, ctx }: { props: ButtonProps; ctx: ViewerCtx }) {
  const resolved = resolveAction(props.action, ctx, { openInNewTab: props.openInNewTab });
  const filled = props.style !== 'outline';
  const bg = props.bgColor || 'var(--th-primary)';
  const fg = props.textColor || 'var(--th-primary-text)';

  const style = filled
    ? { backgroundColor: bg, color: fg }
    : { border: `2px solid ${bg}`, color: bg };

  const className = `inline-flex items-center justify-center gap-2 rounded-full px-6 py-4 text-base font-semibold transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
    props.fullWidth ? 'w-full' : ''
  }`;

  const wrapJustify =
    props.align === 'center' ? 'justify-center' : props.align === 'right' ? 'justify-end' : 'justify-start';

  const content = (
    <>
      {props.icon && safeUrl(props.icon) && (
        <img src={safeUrl(props.icon) as string} alt="" className="h-5 w-5 object-contain" />
      )}
      <span>{props.label}</span>
    </>
  );

  const inner =
    resolved?.href != null ? (
      <a
        href={resolved.href}
        target={resolved.newTab ? '_blank' : undefined}
        rel={resolved.newTab ? 'noopener noreferrer' : undefined}
        className={className}
        style={style}
      >
        {content}
      </a>
    ) : (
      <button type="button" onClick={resolved?.onClick} className={className} style={style}>
        {content}
      </button>
    );

  return <div className={`flex ${wrapJustify}`}>{inner}</div>;
}

/** Build a favicon URL for a site (Google's public favicon service). */
export function faviconFor(url: string): string | null {
  const clean = safeUrl(url);
  if (!clean) return null;
  try {
    const host = new URL(clean).hostname;
    return `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(host)}`;
  } catch {
    return null;
  }
}

export function LinkView({ props }: { props: LinkProps }) {
  const url = safeUrl(props.url);
  const customIcon = safeUrl(props.iconUrl ?? '');
  const auto = props.autoIcon !== false; // default on
  const favicon = auto ? faviconFor(props.url) : null;

  // Icon priority: custom image → emoji → auto favicon → default link glyph.
  let iconEl: ReactNode = <span aria-hidden>🔗</span>;
  if (customIcon) {
    iconEl = <img src={customIcon} alt="" className="h-6 w-6 rounded object-contain" />;
  } else if (props.icon) {
    iconEl = <span aria-hidden className="text-xl">{props.icon}</span>;
  } else if (favicon) {
    iconEl = <img src={favicon} alt="" className="h-6 w-6 rounded object-contain" loading="lazy" />;
  }

  const bg = props.bgColor?.trim();
  const fg = props.textColor?.trim() || 'var(--th-text)';
  return (
    <a
      href={url ?? '#'}
      target={props.openInNewTab ? '_blank' : undefined}
      rel={props.openInNewTab ? 'noopener noreferrer' : undefined}
      className="flex items-center gap-3 rounded-lg border px-4 py-3 transition-opacity hover:opacity-90"
      style={{ backgroundColor: bg || 'transparent', borderColor: bg ? 'transparent' : 'rgba(0,0,0,0.12)' }}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center">{iconEl}</span>
      <span className="min-w-0">
        <span className="block font-medium underline" style={{ color: fg }}>
          {props.label || url}
        </span>
        {props.description && (
          <span className="mt-0.5 block text-sm" style={{ color: fg, opacity: 0.75 }}>{props.description}</span>
        )}
      </span>
    </a>
  );
}

/** Card(s) — squared black tile, centered icon/image + title. 1 or 2 per row. */
export function CardView({ props, ctx }: { props: CardProps; ctx: ViewerCtx }) {
  const resolved = resolveAction(props.action, ctx);
  const img = safeUrl(props.imageUrl ?? '');

  const body = (
    <div
      className="flex h-full flex-col items-center justify-center gap-2 rounded-2xl p-6 text-center"
      style={{ backgroundColor: 'var(--th-primary)', color: 'var(--th-primary-text)' }}
    >
      {img ? (
        <img src={img} alt="" className="mb-1 h-16 w-16 rounded-lg object-cover" />
      ) : props.icon ? (
        <span className="text-4xl" aria-hidden>{props.icon}</span>
      ) : null}
      <span className="text-lg font-semibold">{props.title}</span>
      {props.body && <span className="text-sm opacity-90">{props.body}</span>}
    </div>
  );

  // `columns` is a per-card hint; the page renderer groups consecutive cards.
  const interactive = resolved != null;
  if (!interactive) return body;
  return resolved.href != null ? (
    <a href={resolved.href} target={resolved.newTab ? '_blank' : undefined} rel={resolved.newTab ? 'noopener noreferrer' : undefined} className="block h-full">
      {body}
    </a>
  ) : (
    <button type="button" onClick={resolved.onClick} className="block h-full w-full text-left">
      {body}
    </button>
  );
}

/** Tappable list — title + rows, each with optional emoji, sublabel, action. */
export function ListView({ props, ctx }: { props: ListProps; ctx: ViewerCtx }) {
  return (
    <div>
      {props.title && (
        <h3 className="mb-2 text-lg font-semibold" style={{ color: 'var(--th-heading)' }}>
          {props.title}
        </h3>
      )}
      <ul className="divide-y rounded-xl border" style={{ borderColor: 'rgba(0,0,0,0.12)' }}>
        {props.items.map((item, i) => {
          const resolved = resolveAction(item.action, ctx);
          const row = (
            <div className="flex items-center gap-3 px-4 py-3">
              {item.icon && <span className="text-xl" aria-hidden>{item.icon}</span>}
              <div className="min-w-0">
                <div className="font-medium" style={{ color: 'var(--th-text)' }}>{item.label}</div>
                {item.sublabel && <div className="truncate text-sm text-gray-500">{item.sublabel}</div>}
              </div>
              {resolved && <span className="ml-auto text-gray-400" aria-hidden>›</span>}
            </div>
          );
          return (
            <li key={i}>
              {resolved?.href != null ? (
                <a href={resolved.href} target={resolved.newTab ? '_blank' : undefined} rel={resolved.newTab ? 'noopener noreferrer' : undefined} className="block hover:bg-black/5">{row}</a>
              ) : resolved?.onClick ? (
                <button type="button" onClick={resolved.onClick} className="block w-full text-left hover:bg-black/5">{row}</button>
              ) : (
                row
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

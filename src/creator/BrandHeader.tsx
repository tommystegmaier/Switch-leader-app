import type { ReactNode } from 'react';

import { PLATFORM_NAME } from '@/lib/appMetadata';

/**
 * The product masthead for platform-level screens (the app hub and the command
 * center) — the ones that sit outside any single app and used to read like a
 * generic workspace builder. These are Switch Leader, so they say so.
 *
 * The logo isn't a bundled asset: it's whichever logo the apps themselves
 * already carry, passed in by the caller. A separate platform-logo setting
 * would just be a second place to keep in sync, and would start out empty.
 */
export function BrandHeader({ logoUrl, subtitle, action }: { logoUrl: string | null; subtitle: string; action?: ReactNode }) {
  return (
    <header className="mb-6 flex items-center gap-4 border-b pb-5" style={{ borderColor: 'var(--th-hairline)' }}>
      <BrandMark logoUrl={logoUrl} />
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-3xl font-extrabold leading-tight tracking-tight" style={{ color: 'var(--th-heading)' }}>
          {PLATFORM_NAME}
        </h1>
        <p className="mt-0.5 text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--th-primary)' }}>
          {subtitle}
        </p>
      </div>
      {action && <div className="shrink-0 self-start">{action}</div>}
    </header>
  );
}

/**
 * The logo tile. Falls back to a lettermark rather than an empty gap, so the
 * header keeps its shape while the apps (and their logos) are still loading —
 * this sits at the very top of the page, where a jump is most obvious.
 */
function BrandMark({ logoUrl }: { logoUrl: string | null }) {
  if (logoUrl) {
    return <img src={logoUrl} alt={`${PLATFORM_NAME} logo`} className="h-14 w-14 shrink-0 rounded-2xl object-cover" />;
  }
  return (
    <span
      aria-hidden
      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-xl font-extrabold"
      style={{ backgroundColor: 'var(--th-primary)', color: 'var(--th-primary-text)' }}
    >
      {PLATFORM_NAME.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
    </span>
  );
}

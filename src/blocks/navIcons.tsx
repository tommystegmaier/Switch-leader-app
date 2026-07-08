import type { ReactElement } from 'react';

/**
 * A small set of simple, monochrome line icons for the bottom icon bar (the
 * "Bible app" look). Each renders with `currentColor` so it takes the bar's
 * text color — no colorful emoji. A tab's `icon` field can be one of these
 * names, or any emoji/text (which is rendered as-is).
 */

const P = (d: string) => <path d={d} />;

const ICONS: Record<string, ReactElement> = {
  home: <>{P('M3 9.5 12 3l9 6.5')}<path d="M5 9v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9" /></>,
  book: <><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v18H6.5A2.5 2.5 0 0 0 4 22.5z" /><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /></>,
  calendar: <><rect x="3" y="4.5" width="18" height="16" rx="2" /><path d="M3 9h18M8 2.5v4M16 2.5v4" /></>,
  check: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="m8 12 3 3 5-6" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m21 21-4-4" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2 21v-1a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v1" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 21v-1a5 5 0 0 0-3-4.58" /></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-2.5 8.5-2.5 8.5h17S18 15 18 8Z" /><path d="M10.5 20a2 2 0 0 0 3 0" /></>,
  map: <><path d="M21 10c0 6-9 12-9 12s-9-6-9-12a9 9 0 0 1 18 0Z" /><circle cx="12" cy="10" r="3" /></>,
  chat: <path d="M21 11.5a8 8 0 0 1-11.5 7.2L3 21l2.3-6.5A8 8 0 1 1 21 11.5Z" />,
  link: <><path d="M10 13a5 5 0 0 0 7.5.5l3-3A5 5 0 0 0 13.4 3.4l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3A5 5 0 0 0 10.6 20.6l1.7-1.7" /></>,
  star: <path d="M12 3.5 14.6 9l6 .7-4.4 4.1 1.2 5.9L12 16.8 6.6 19.7l1.2-5.9L3.4 9.7l6-.7z" />,
  heart: <path d="M12 20s-7-4.5-9.2-9A4.8 4.8 0 0 1 12 6.5 4.8 4.8 0 0 1 21.2 11c-2.2 4.5-9.2 9-9.2 9Z" />,
  play: <path d="M6 4.5 19 12 6 19.5z" />,
  music: <><path d="M9 18V5l11-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="17" cy="16" r="3" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
  phone: <path d="M21 16.5v2.5a2 2 0 0 1-2.2 2 18 18 0 0 1-8-3 17 17 0 0 1-5.3-5.3 18 18 0 0 1-3-8.1A2 2 0 0 1 4.5 2.5H7a2 2 0 0 1 2 1.7c.1.9.3 1.7.6 2.5a2 2 0 0 1-.5 2.1L8 9.9a15 15 0 0 0 6 6l1.1-1.1a2 2 0 0 1 2.1-.5c.8.3 1.6.5 2.5.6a2 2 0 0 1 1.7 2z" />,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3.5 6.5 8.5 6 8.5-6" /></>,
  gift: <><path d="M20 12v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8" /><path d="M2.5 8h19v4h-19zM12 8v13M12 8S10.5 3.5 8 4.5 9 8 12 8Zm0 0s1.5-4.5 4-3.5S15 8 12 8Z" /></>,
  image: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9" r="1.5" /><path d="m4 17 5-5 4 4 3-3 4 4" /></>,
  clipboard: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4a3 3 0 0 1 6 0" /><path d="M9 4h6v2H9z" /></>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
};

/** Names available in the icon picker, in display order. */
export const NAV_ICON_NAMES = Object.keys(ICONS);

export function isNavIconName(name: string | undefined): boolean {
  return Boolean(name && name in ICONS);
}

/** Render a named line icon, or fall back to the raw string (emoji/text). */
export function NavIcon({ name, className }: { name: string; className?: string }) {
  const icon = ICONS[name];
  if (!icon) return <span className={className} aria-hidden>{name || '•'}</span>;
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      {icon}
    </svg>
  );
}

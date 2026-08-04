import type { AppSettings } from '@/types';
import { getDark } from './darkMode';

/**
 * Applies a workspace's theme to CSS custom properties on a root element.
 *
 * The whole UI reads `var(--th-*)`, so restyling a workspace is just setting
 * these variables — no per-workspace CSS, no hardcoded brand. This is what lets
 * any creator fully restyle their app (the Switch look is just one theme).
 *
 * Dark mode keeps the workspace's brand (buttons/accent) but swaps the page
 * background, surfaces, and text to a dark palette, and toggles the `.dark`
 * class that the CSS layer uses to flip the app's white/gray surfaces.
 */
export function applyTheme(
  settings: AppSettings,
  root: HTMLElement = document.documentElement,
  dark: boolean = getDark(),
) {
  const { theme, fontFamily } = settings;
  root.style.setProperty('--th-primary-text', theme.primaryText);
  root.style.setProperty('--th-accent', theme.accent);
  root.style.setProperty('--th-font', fontFamily);

  if (dark) {
    root.style.setProperty('--th-bg', '#0f141b');
    root.style.setProperty('--th-surface', '#1b2129');
    root.style.setProperty('--th-text', '#e6e8ec');
    root.style.setProperty('--th-heading', '#f7f8fa');
    // A near-black brand button (the common case) vanishes on the dark page, so
    // lift it to a raised slate that reads clearly as a button — like a native
    // dark theme. Bright brand colors already stand out, so keep those as-is.
    const lifted = isDark(theme.primary) ? '#2b323d' : theme.primary;
    root.style.setProperty('--th-primary', lifted);
    root.classList.add('dark');
  } else {
    root.style.setProperty('--th-primary', theme.primary);
    root.style.setProperty('--th-bg', theme.background);
    root.style.setProperty('--th-surface', '#ffffff');
    root.style.setProperty('--th-text', theme.text);
    root.style.setProperty('--th-heading', theme.heading);
    root.classList.remove('dark');
  }
}

/** Parse a #rgb / #rrggbb color to [r,g,b] (0–255), or null if unrecognized. */
function parseHex(input: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(input.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].replace(/(.)/g, '$1$1') : m[1];
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** True when a color is dark enough to disappear on a dark background. */
function isDark(color: string): boolean {
  const rgb = parseHex(color);
  if (!rgb) return true; // Unknown format → assume dark and lift it, to be safe.
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.2;
}

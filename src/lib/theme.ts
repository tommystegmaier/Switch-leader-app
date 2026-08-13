import type { AppSettings } from '@/types';
import { colorIsDark, DARK_SURFACE } from './colors';
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
    const lifted = colorIsDark(theme.primary) ? DARK_SURFACE : theme.primary;
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

/**
 * Pick black or white text for a background, whichever is easier to read.
 *
 * Uses WCAG relative luminance rather than a naive brightness average, so a
 * saturated accent (a mid green, say) still gets the right answer. Lets people
 * choose any accent color without the text on it becoming unreadable.
 * Falls back to white for anything we can't parse.
 */
export function readableTextOn(bg: string | undefined): string {
  const rgb = parseColor(bg);
  if (!rgb) return '#ffffff';
  const channel = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const lum = 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
  // Contrast against white vs black; pick the higher ratio.
  return (1.05 / (lum + 0.05)) >= ((lum + 0.05) / 0.05) ? '#ffffff' : '#0f1420';
}

/** #rgb, #rrggbb, or rgb()/rgba() → [r,g,b]; null if unrecognized. */
function parseColor(input: string | undefined): [number, number, number] | null {
  if (!input) return null;
  const s = input.trim();
  const hex = s.replace('#', '');
  if (/^[0-9a-f]{3}$/i.test(hex)) {
    return [parseInt(hex[0] + hex[0], 16), parseInt(hex[1] + hex[1], 16), parseInt(hex[2] + hex[2], 16)];
  }
  if (/^[0-9a-f]{6}$/i.test(hex)) {
    return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
  }
  const m = s.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  return null;
}

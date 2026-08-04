/**
 * Color helpers shared by the theme engine and block viewers to adapt
 * creator-picked colors for dark mode.
 *
 * Blocks let creators bake in a background/text color (a hex value) that was
 * chosen to look right on a light page. On the dark page those near-black
 * choices vanish, so we detect them and swap in dark-mode-safe equivalents.
 * Colors we can't parse (`var(--…)`, `transparent`, named colors) return
 * `false` from `colorIsDark` — the CSS-variable path handles those.
 */

/** A raised surface for near-black brand colors in dark mode (buttons/tiles). */
export const DARK_SURFACE = '#2b323d';

/** Readable light ink on the dark page (for text/outlines that were dark). */
export const DARK_INK = '#e6e8ec';

/** Parse `#rgb` / `#rrggbb` → [r,g,b] (0–255), or null if unrecognized. */
export function parseHexColor(input: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(input.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].replace(/(.)/g, '$1$1') : m[1];
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** True when a color is dark enough to disappear on a dark background. */
export function colorIsDark(input?: string | null): boolean {
  if (!input) return false;
  const rgb = parseHexColor(input);
  if (!rgb) return false;
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.2;
}

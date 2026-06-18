import type { AppSettings } from '@/types';

/**
 * Applies a workspace's theme to CSS custom properties on a root element.
 *
 * The whole UI reads `var(--th-*)`, so restyling a workspace is just setting
 * these variables — no per-workspace CSS, no hardcoded brand. This is what lets
 * any creator fully restyle their app (the Switch look is just one theme).
 */
export function applyTheme(settings: AppSettings, root: HTMLElement = document.documentElement) {
  const { theme, fontFamily } = settings;
  root.style.setProperty('--th-bg', theme.background);
  root.style.setProperty('--th-text', theme.text);
  root.style.setProperty('--th-primary', theme.primary);
  root.style.setProperty('--th-primary-text', theme.primaryText);
  root.style.setProperty('--th-accent', theme.accent);
  root.style.setProperty('--th-heading', theme.heading);
  root.style.setProperty('--th-font', fontFamily);
}

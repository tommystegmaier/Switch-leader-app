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
  root.style.setProperty('--th-primary', theme.primary);
  root.style.setProperty('--th-primary-text', theme.primaryText);
  root.style.setProperty('--th-accent', theme.accent);
  root.style.setProperty('--th-font', fontFamily);

  if (dark) {
    root.style.setProperty('--th-bg', '#0f141b');
    root.style.setProperty('--th-surface', '#1b2129');
    root.style.setProperty('--th-text', '#e6e8ec');
    root.style.setProperty('--th-heading', '#f7f8fa');
    root.classList.add('dark');
  } else {
    root.style.setProperty('--th-bg', theme.background);
    root.style.setProperty('--th-surface', '#ffffff');
    root.style.setProperty('--th-text', theme.text);
    root.style.setProperty('--th-heading', theme.heading);
    root.classList.remove('dark');
  }
}

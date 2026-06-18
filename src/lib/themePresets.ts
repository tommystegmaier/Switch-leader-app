import type { ThemeColors } from '@/types';

/**
 * Preset color schemes for the theme editor. Generic and brandable — the Switch
 * look is just one of them. Creators can start from a preset and fine-tune.
 */
export interface ThemePreset {
  id: string;
  name: string;
  colors: ThemeColors;
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'switch',
    name: 'Switch (near-black + red)',
    colors: { background: '#ffffff', text: '#0f1420', primary: '#0f1420', primaryText: '#ffffff', accent: '#e23b2e', heading: '#1c2541' },
  },
  {
    id: 'ocean',
    name: 'Ocean',
    colors: { background: '#ffffff', text: '#0b1f33', primary: '#0072b2', primaryText: '#ffffff', accent: '#00a3a3', heading: '#0b3d62' },
  },
  {
    id: 'forest',
    name: 'Forest',
    colors: { background: '#ffffff', text: '#14271c', primary: '#1f6f43', primaryText: '#ffffff', accent: '#e08a00', heading: '#10311f' },
  },
  {
    id: 'sunset',
    name: 'Sunset',
    colors: { background: '#fffaf6', text: '#2b1a14', primary: '#d2522d', primaryText: '#ffffff', accent: '#f2a900', heading: '#7a2f17' },
  },
  {
    id: 'grape',
    name: 'Grape',
    colors: { background: '#ffffff', text: '#1f1430', primary: '#5b2a86', primaryText: '#ffffff', accent: '#c4477a', heading: '#3a1d59' },
  },
  {
    id: 'midnight',
    name: 'Midnight (dark)',
    colors: { background: '#0f1420', text: '#e8eaf0', primary: '#4f7cff', primaryText: '#ffffff', accent: '#ff6b6b', heading: '#ffffff' },
  },
];

export const FONT_OPTIONS: { label: string; value: string }[] = [
  { label: 'System sans-serif', value: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
  { label: 'Rounded / friendly', value: '"Nunito", ui-rounded, "Segoe UI", system-ui, sans-serif' },
  { label: 'Classic serif', value: 'Georgia, "Times New Roman", serif' },
  { label: 'Geometric', value: '"Poppins", "Century Gothic", system-ui, sans-serif' },
  { label: 'Monospace', value: 'ui-monospace, "SF Mono", "Cascadia Code", monospace' },
];

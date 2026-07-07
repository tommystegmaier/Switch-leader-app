import type { BlockAction } from './actions';

/**
 * Per-block-type `props` shapes. These describe what each block stores in
 * `blocks.props` (JSONB). All defaults are GENERIC and theme-driven — nothing
 * here is specific to any workspace. The block registry pairs each shape with
 * a Viewer, an editor field list, and `defaultProps`.
 */

export type Align = 'left' | 'center' | 'right';

export interface HeadingProps {
  text: string;
  level: 1 | 2 | 3;
  align: Align;
  underline: boolean;
  color?: string; // optional override; defaults to theme heading color
}

export interface ParagraphProps {
  html: string; // sanitized rich text
  align: Align;
}

export interface ImageProps {
  url: string;
  alt: string;
  caption?: string;
  rounded: boolean;
  width: number; // percentage 10–100
  link?: BlockAction;
  overlay: boolean; // decorative doodle overlay, off by default
}

export interface GalleryImage {
  url: string;
  alt?: string;
  caption?: string;
}
export interface GalleryProps {
  images: GalleryImage[];
  layout: 'grid' | 'carousel';
  columns: 1 | 2 | 3 | 4;
}

export interface ButtonProps {
  label: string;
  icon?: string; // uploaded icon URL (Phase 5)
  action: BlockAction;
  style: 'filled' | 'outline';
  bgColor?: string;
  textColor?: string;
  align: Align;
  fullWidth: boolean;
  openInNewTab: boolean;
}

export interface LinkProps {
  label: string;
  url: string;
  description?: string;
  openInNewTab: boolean;
  /** Auto-pull the destination site's logo (favicon) as the icon. */
  autoIcon?: boolean;
  /** Emoji icon (used when not auto, and no custom image). */
  icon?: string;
  /** Custom uploaded icon image URL (overrides emoji + auto favicon). */
  iconUrl?: string;
}

export interface CardProps {
  imageUrl?: string;
  icon?: string; // large emoji / glyph
  title: string;
  body?: string;
  action?: BlockAction;
  columns: 1 | 2;
}

export interface ListItem {
  label: string;
  sublabel?: string;
  icon?: string;
  action?: BlockAction;
}
export interface ListProps {
  title?: string;
  items: ListItem[];
}

export interface DividerProps {
  color: string;
  thickness: number;
  margin: number;
}

export interface SpacerProps {
  height: number;
}

export interface VideoProps {
  url: string; // YouTube/Vimeo or direct file
}

export interface DocumentProps {
  title: string;
  url: string; // uploaded PDF (Phase 5) or pasted URL
  displayMode: 'inline' | 'link';
}

export interface EmbedProps {
  url: string; // allowlisted iframe src
  height: number;
  title: string;
}

export interface MapProps {
  query: string; // address or "lat,lng"
  height: number;
}

export interface QrProps {
  url: string;
  size: number;
  caption?: string;
}

export interface CountdownProps {
  label: string;
  target: string; // ISO datetime
}

export interface AccordionProps {
  title: string;
  html: string; // sanitized rich text
  openByDefault: boolean;
}

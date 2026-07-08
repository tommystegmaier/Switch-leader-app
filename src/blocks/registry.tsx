import type { ReactElement } from 'react';

import type { BlockType } from '@/types';
import type { ViewerCtx } from './actions';
import { ACTION_FIELD, ALIGN_FIELD, type FieldDef } from './fields';
import {
  AccordionView,
  DividerView,
  HeadingView,
  ParagraphView,
  SpacerView,
} from './viewers/text';
import {
  ButtonView,
  CardView,
  LinkView,
  ListView,
} from './viewers/interactive';
import {
  EmbedView,
  GalleryView,
  ImageView,
  VideoView,
} from './viewers/media';
import { DocumentView } from './viewers/document';
import { CountdownView, MapView, QrView } from './viewers/utility';
import { ScheduleView, BirthdaysView } from './viewers/schedule';

/**
 * THE BLOCK REGISTRY — the single source of truth for the creative palette.
 *
 * Adding a new block type is one entry here: { type, label, icon, description,
 * category, defaultProps, fields, Viewer }. The viewer renderer, the "+ Add
 * block" picker, and the property editor are all data-driven from this map, so
 * no other file needs to change. (See README → "Adding a block type".)
 *
 * None of these defaults are workspace-specific — they're generic and
 * theme-driven, so the same palette builds any app.
 */

export type BlockCategory = 'text' | 'media' | 'interactive' | 'layout' | 'advanced';

export interface BlockDef {
  type: BlockType;
  label: string;
  icon: string;
  description: string;
  category: BlockCategory;
  defaultProps: Record<string, unknown>;
  fields: FieldDef[];
  /** Viewer always receives { props, ctx }; ctx is ignored by static blocks. */
  Viewer: (p: { props: never; ctx: ViewerCtx }) => ReactElement;
}

// Small helper to keep each entry tidy while erasing per-prop generics for the
// heterogeneous registry map.
function def<P>(
  d: Omit<BlockDef, 'defaultProps' | 'Viewer'> & {
    defaultProps: P;
    Viewer: (p: { props: P; ctx: ViewerCtx }) => ReactElement;
  },
): BlockDef {
  return d as unknown as BlockDef;
}

export const BLOCK_REGISTRY: Record<BlockType, BlockDef> = {
  heading: def({
    type: 'heading',
    label: 'Heading',
    icon: '🔤',
    description: 'A section title (H1–H3) with optional underline.',
    category: 'text',
    defaultProps: { text: 'New heading', level: 2, align: 'left', underline: false },
    fields: [
      { key: 'text', label: 'Text', type: 'text', placeholder: 'Heading text (emoji ok)' },
      { key: 'level', label: 'Size', type: 'select', options: [
        { value: '1', label: 'Large (H1)' }, { value: '2', label: 'Medium (H2)' }, { value: '3', label: 'Small (H3)' },
      ] },
      ALIGN_FIELD,
      { key: 'underline', label: 'Underline', type: 'boolean' },
      { key: 'color', label: 'Text color (optional)', type: 'color' },
    ],
    Viewer: HeadingView,
  }),

  paragraph: def({
    type: 'paragraph',
    label: 'Text',
    icon: '📝',
    description: 'A rich-text box: bold, lists, links, colored text.',
    category: 'text',
    defaultProps: { html: '<p>Write something…</p>', align: 'left' },
    fields: [
      { key: 'html', label: 'Content', type: 'richtext' },
      ALIGN_FIELD,
    ],
    Viewer: ParagraphView,
  }),

  image: def({
    type: 'image',
    label: 'Image',
    icon: '🖼️',
    description: 'A single image with optional caption and link.',
    category: 'media',
    defaultProps: { url: '', alt: '', caption: '', width: 100, rounded: true, overlay: false },
    fields: [
      { key: 'url', label: 'Image', type: 'image' },
      { key: 'alt', label: 'Alt text', type: 'text', help: 'Describe the image for accessibility.' },
      { key: 'caption', label: 'Caption', type: 'text' },
      { key: 'width', label: 'Width (%)', type: 'number', min: 10, max: 100, step: 5 },
      { key: 'rounded', label: 'Rounded corners', type: 'boolean' },
      { key: 'overlay', label: 'Decorative overlay', type: 'boolean' },
      { key: 'link', label: 'Click-through', type: 'action' },
    ],
    Viewer: ImageView,
  }),

  gallery: def({
    type: 'gallery',
    label: 'Gallery',
    icon: '🏞️',
    description: 'A grid or carousel of photos with a fullscreen lightbox.',
    category: 'media',
    defaultProps: { images: [], layout: 'grid', columns: 2 },
    fields: [
      { key: 'layout', label: 'Layout', type: 'select', options: [
        { value: 'grid', label: 'Grid' }, { value: 'carousel', label: 'Carousel' },
      ] },
      { key: 'columns', label: 'Columns', type: 'select', options: [
        { value: '1', label: '1' }, { value: '2', label: '2' }, { value: '3', label: '3' }, { value: '4', label: '4' },
      ] },
      { key: 'images', label: 'Photos', type: 'items', itemDefault: { url: '', alt: '', caption: '' }, itemFields: [
        { key: 'url', label: 'Image', type: 'image' },
        { key: 'alt', label: 'Alt text', type: 'text' },
        { key: 'caption', label: 'Caption', type: 'text' },
      ] },
    ],
    Viewer: GalleryView,
  }),

  button: def({
    type: 'button',
    label: 'Button',
    icon: '🔘',
    description: 'A tall pill button — link, page jump, email, or phone.',
    category: 'interactive',
    defaultProps: {
      label: 'Button', action: { type: 'url', target: '' }, style: 'filled',
      align: 'center', fullWidth: true, openInNewTab: false,
    },
    fields: [
      { key: 'label', label: 'Label', type: 'text', placeholder: 'e.g. 📅 Calendar' },
      ACTION_FIELD,
      { key: 'style', label: 'Style', type: 'select', options: [
        { value: 'filled', label: 'Filled' }, { value: 'outline', label: 'Outline' },
      ] },
      { key: 'bgColor', label: 'Background color', type: 'color' },
      { key: 'textColor', label: 'Text color', type: 'color' },
      ALIGN_FIELD,
      { key: 'fullWidth', label: 'Full width', type: 'boolean' },
      { key: 'openInNewTab', label: 'Open in new tab', type: 'boolean' },
      { key: 'icon', label: 'Icon image (optional)', type: 'image' },
    ],
    Viewer: ButtonView,
  }),

  link: def({
    type: 'link',
    label: 'Link',
    icon: '🔗',
    description: 'A labeled hyperlink with an auto or custom logo.',
    category: 'interactive',
    defaultProps: { label: 'Visit link', url: '', description: '', openInNewTab: true, autoIcon: true, icon: '', iconUrl: '', bgColor: '', textColor: '' },
    fields: [
      { key: 'label', label: 'Label', type: 'text' },
      { key: 'url', label: 'URL', type: 'url' },
      { key: 'description', label: 'Description', type: 'text' },
      { key: 'openInNewTab', label: 'Open in new tab', type: 'boolean' },
      { key: 'bgColor', label: 'Background color', type: 'color', help: 'Leave empty for a plain outlined card.' },
      { key: 'textColor', label: 'Text color', type: 'color' },
      { key: 'autoIcon', label: 'Auto logo from the website', type: 'boolean', help: 'Pulls the destination site’s icon automatically.' },
      { key: 'icon', label: 'Emoji icon (if not auto)', type: 'text', placeholder: 'e.g. 📅' },
      { key: 'iconUrl', label: 'Custom icon image (overrides)', type: 'image' },
    ],
    Viewer: LinkView,
  }),

  card: def({
    type: 'card',
    label: 'Card',
    icon: '🃏',
    description: 'A tile with icon/image + title; 1 or 2 per row.',
    category: 'interactive',
    defaultProps: { title: 'Card title', icon: '⭐', body: '', columns: 2, action: { type: 'url', target: '' } },
    fields: [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'icon', label: 'Icon (emoji)', type: 'text', placeholder: 'e.g. 🎬' },
      { key: 'imageUrl', label: 'Image (optional)', type: 'image' },
      { key: 'body', label: 'Body', type: 'textarea' },
      { key: 'columns', label: 'Per row', type: 'select', options: [
        { value: '1', label: '1 (full width)' }, { value: '2', label: '2 side by side' },
      ] },
      ACTION_FIELD,
    ],
    Viewer: CardView,
  }),

  list: def({
    type: 'list',
    label: 'List',
    icon: '📋',
    description: 'A list of tappable rows with optional sublabels.',
    category: 'interactive',
    defaultProps: { title: '', items: [{ label: 'First item', sublabel: '', icon: '', action: { type: 'url', target: '' } }] },
    fields: [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'items', label: 'Rows', type: 'items', itemDefault: { label: 'New item', sublabel: '', icon: '', action: { type: 'url', target: '' } }, itemFields: [
        { key: 'label', label: 'Label', type: 'text' },
        { key: 'sublabel', label: 'Sublabel', type: 'text' },
        { key: 'icon', label: 'Icon (emoji)', type: 'text' },
        { key: 'action', label: 'When tapped', type: 'action' },
      ] },
    ],
    Viewer: ListView,
  }),

  divider: def({
    type: 'divider',
    label: 'Divider',
    icon: '➖',
    description: 'A horizontal rule to separate sections.',
    category: 'layout',
    defaultProps: { color: '#0f1420', thickness: 1, margin: 16 },
    fields: [
      { key: 'color', label: 'Color', type: 'color' },
      { key: 'thickness', label: 'Thickness (px)', type: 'number', min: 1, max: 12 },
      { key: 'margin', label: 'Vertical margin (px)', type: 'number', min: 0, max: 80 },
    ],
    Viewer: DividerView,
  }),

  spacer: def({
    type: 'spacer',
    label: 'Spacer',
    icon: '↕️',
    description: 'Adjustable empty vertical space.',
    category: 'layout',
    defaultProps: { height: 24 },
    fields: [{ key: 'height', label: 'Height (px)', type: 'number', min: 4, max: 200, step: 4 }],
    Viewer: SpacerView,
  }),

  video: def({
    type: 'video',
    label: 'Video',
    icon: '🎬',
    description: 'A responsive YouTube/Vimeo embed or uploaded file.',
    category: 'media',
    defaultProps: { url: '' },
    fields: [{ key: 'url', label: 'Video URL', type: 'url', placeholder: 'YouTube / Vimeo / .mp4' }],
    Viewer: VideoView,
  }),

  document: def({
    type: 'document',
    label: 'PDF / Document',
    icon: '📄',
    description: 'An inline PDF with page nav, zoom, and refresh.',
    category: 'media',
    defaultProps: { title: 'Document', url: '', displayMode: 'inline' },
    fields: [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'url', label: 'PDF', type: 'pdf' },
      { key: 'displayMode', label: 'Display', type: 'select', options: [
        { value: 'inline', label: 'Inline preview' }, { value: 'link', label: 'Open button' },
      ] },
    ],
    Viewer: DocumentView,
  }),

  embed: def({
    type: 'embed',
    label: 'Embed',
    icon: '🧩',
    description: 'An embedded iframe from an allowlisted provider.',
    category: 'advanced',
    defaultProps: { url: '', title: 'Embed', height: 400 },
    fields: [
      { key: 'url', label: 'Embed URL', type: 'url' },
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'height', label: 'Height (px)', type: 'number', min: 120, max: 1200, step: 20 },
    ],
    Viewer: EmbedView,
  }),

  map: def({
    type: 'map',
    label: 'Map',
    icon: '🗺️',
    description: 'An embedded map for an address or coordinates.',
    category: 'advanced',
    defaultProps: { query: '', height: 300 },
    fields: [
      { key: 'query', label: 'Address or lat,lng', type: 'text' },
      { key: 'height', label: 'Height (px)', type: 'number', min: 150, max: 800, step: 10 },
    ],
    Viewer: MapView,
  }),

  qr: def({
    type: 'qr',
    label: 'QR Code',
    icon: '🔲',
    description: 'A QR code that encodes a URL.',
    category: 'advanced',
    defaultProps: { url: '', size: 160, caption: '' },
    fields: [
      { key: 'url', label: 'URL to encode', type: 'url' },
      { key: 'size', label: 'Size (px)', type: 'number', min: 80, max: 400, step: 10 },
      { key: 'caption', label: 'Caption', type: 'text' },
    ],
    Viewer: QrView,
  }),

  countdown: def({
    type: 'countdown',
    label: 'Countdown',
    icon: '⏳',
    description: 'A live countdown to a date & time.',
    category: 'advanced',
    defaultProps: { label: 'Counting down to…', target: '' },
    fields: [
      { key: 'label', label: 'Label', type: 'text' },
      { key: 'target', label: 'Target date & time', type: 'date' },
    ],
    Viewer: CountdownView,
  }),

  accordion: def({
    type: 'accordion',
    label: 'Accordion',
    icon: '📂',
    description: 'A collapsible title + rich-text body.',
    category: 'text',
    defaultProps: { title: 'Section title', html: '<p>Hidden content…</p>', openByDefault: false },
    fields: [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'html', label: 'Content', type: 'richtext' },
      { key: 'openByDefault', label: 'Open by default', type: 'boolean' },
    ],
    Viewer: AccordionView,
  }),

  schedule: def({
    type: 'schedule',
    label: 'Serving schedule',
    icon: '📅',
    description: 'Schedule volunteers into team roles; they confirm or decline their own assignments.',
    category: 'advanced',
    defaultProps: { title: 'Serving schedule', headerSize: 'md' },
    fields: [
      { key: 'title', label: 'Title', type: 'text', placeholder: 'e.g. Sunday serving' },
      { key: 'headerSize', label: 'Header size', type: 'select', options: [
        { value: 'sm', label: 'Small' }, { value: 'md', label: 'Medium' }, { value: 'lg', label: 'Large' },
      ] },
    ],
    Viewer: ScheduleView,
  }),

  birthdays: def({
    type: 'birthdays',
    label: 'Birthdays',
    icon: '🎂',
    description: "Upcoming birthdays pulled from members' accounts. Only managers can see it.",
    category: 'advanced',
    defaultProps: { title: 'Birthdays' },
    fields: [
      { key: 'title', label: 'Title', type: 'text', placeholder: 'e.g. Birthdays & anniversaries' },
    ],
    Viewer: BirthdaysView,
  }),
};

/** Ordered list for the "+ Add block" picker, grouped by category. */
export const BLOCK_LIST: BlockDef[] = Object.values(BLOCK_REGISTRY);

export function getBlockDef(type: BlockType): BlockDef | undefined {
  return BLOCK_REGISTRY[type];
}

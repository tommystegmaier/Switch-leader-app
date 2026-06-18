import type {
  AppSettings,
  Block,
  Organization,
  Page,
} from '@/types';
import type { ContentRepository } from './contentRepository';

/**
 * In-memory sample repository used in Phase 1 (before Supabase is wired up).
 *
 * This is deliberately a GENERIC demo workspace built from generic blocks — it
 * is NOT the Switch starter content (that gets seeded as real data in Phase 7).
 * Its only job is to prove the Viewer shell renders pages/blocks through the
 * `ContentRepository` seam.
 */

const SAMPLE_ORG: Organization = {
  id: 'sample-org',
  name: 'Demo Team Hub',
  slug: 'demo',
  createdAt: new Date('2026-01-01').toISOString(),
};

const SAMPLE_SETTINGS: AppSettings = {
  orgId: SAMPLE_ORG.id,
  appName: 'Demo Team Hub',
  logoUrl: null,
  iconUrl: null,
  theme: {
    background: '#ffffff',
    text: '#0f1420',
    primary: '#0f1420',
    primaryText: '#ffffff',
    accent: '#e23b2e',
    heading: '#1c2541',
  },
  fontFamily:
    "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  splash: { background: '#0f1420', text: '#ffffff' },
  navStyle: 'top',
  viewerAccess: 'public',
};

const HOME_PAGE: Page = {
  id: 'sample-home',
  orgId: SAMPLE_ORG.id,
  name: 'Home',
  icon: '🏠',
  slug: 'home',
  sortOrder: 0,
  isPublished: true,
  visibility: { kind: 'everyone' },
};

const RESOURCES_PAGE: Page = {
  id: 'sample-resources',
  orgId: SAMPLE_ORG.id,
  name: 'Resources',
  icon: '📚',
  slug: 'resources',
  sortOrder: 1,
  isPublished: true,
  visibility: { kind: 'everyone' },
};

const SAMPLE_PAGES: Page[] = [HOME_PAGE, RESOURCES_PAGE];

// A small spread of generic blocks to exercise the renderer. Phase 3 adds the
// full registry and editor panels; these props match the generic shapes.
const SAMPLE_BLOCKS: Block[] = [
  {
    id: 'b1',
    orgId: SAMPLE_ORG.id,
    pageId: HOME_PAGE.id,
    sectionId: null,
    type: 'heading',
    sortOrder: 0,
    props: { text: 'Welcome 👋', level: 1, align: 'center', underline: true },
    visibility: { kind: 'everyone' },
  },
  {
    id: 'b2',
    orgId: SAMPLE_ORG.id,
    pageId: HOME_PAGE.id,
    sectionId: null,
    type: 'paragraph',
    sortOrder: 1,
    props: {
      html: 'This is a <strong>sample workspace</strong> rendered by the Viewer shell through the data-layer seam. Real content comes from Supabase in Phase 2.',
      align: 'center',
    },
    visibility: { kind: 'everyone' },
  },
  {
    id: 'b3',
    orgId: SAMPLE_ORG.id,
    pageId: HOME_PAGE.id,
    sectionId: null,
    type: 'divider',
    sortOrder: 2,
    props: { color: '#0f1420', thickness: 1, margin: 16 },
    visibility: { kind: 'everyone' },
  },
  {
    id: 'b4',
    orgId: SAMPLE_ORG.id,
    pageId: HOME_PAGE.id,
    sectionId: null,
    type: 'button',
    sortOrder: 3,
    props: {
      label: '📚 Open Resources',
      action: { type: 'page', target: 'resources' },
      style: 'filled',
      fullWidth: true,
      align: 'center',
      openInNewTab: false,
    },
    visibility: { kind: 'everyone' },
  },
  {
    id: 'b5',
    orgId: SAMPLE_ORG.id,
    pageId: HOME_PAGE.id,
    sectionId: null,
    type: 'button',
    sortOrder: 4,
    props: {
      label: '🔗 Visit example.com',
      action: { type: 'url', target: 'https://example.com' },
      style: 'outline',
      fullWidth: true,
      align: 'center',
      openInNewTab: true,
    },
    visibility: { kind: 'everyone' },
  },
  {
    id: 'b6',
    orgId: SAMPLE_ORG.id,
    pageId: RESOURCES_PAGE.id,
    sectionId: null,
    type: 'heading',
    sortOrder: 0,
    props: { text: 'Resources 📚', level: 2, align: 'left', underline: false },
    visibility: { kind: 'everyone' },
  },
  {
    id: 'b7',
    orgId: SAMPLE_ORG.id,
    pageId: RESOURCES_PAGE.id,
    sectionId: null,
    type: 'paragraph',
    sortOrder: 1,
    props: {
      html: 'Add links, documents, images, and more here once the block palette lands in Phase 3.',
      align: 'left',
    },
    visibility: { kind: 'everyone' },
  },
];

export const sampleContentRepository: ContentRepository = {
  async getOrganizationBySlug(slug) {
    return slug === SAMPLE_ORG.slug ? SAMPLE_ORG : null;
  },
  async getAppSettings(orgId) {
    return orgId === SAMPLE_ORG.id ? SAMPLE_SETTINGS : null;
  },
  async getPublishedPages(orgId) {
    if (orgId !== SAMPLE_ORG.id) return [];
    return [...SAMPLE_PAGES]
      .filter((p) => p.isPublished)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  },
  async getPageBlocks(orgId, pageId) {
    if (orgId !== SAMPLE_ORG.id) return [];
    return SAMPLE_BLOCKS.filter((b) => b.pageId === pageId).sort(
      (a, b) => a.sortOrder - b.sortOrder,
    );
  },
};

/** The slug of the bundled sample workspace, handy for default redirects. */
export const SAMPLE_ORG_SLUG = SAMPLE_ORG.slug;

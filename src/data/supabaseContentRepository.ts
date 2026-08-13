import type { SupabaseClient } from '@supabase/supabase-js';

import { getSupabase } from '@/lib/supabase';
import type {
  AppSettings,
  Block,
  Organization,
  Page,
} from '@/types';
import type { ContentRepository } from './contentRepository';

/**
 * Supabase-backed content repository.
 *
 * Implements the SAME `ContentRepository` interface as the sample repo, so the
 * UI is unchanged. All access goes through the anon/auth client and is gated
 * by RLS: anonymous callers only ever see published content of public
 * workspaces; members see their workspace; nobody sees another tenant's data.
 *
 * DB columns are snake_case; the app uses camelCase domain types, so each
 * fetch maps rows explicitly (no leaky `any` shapes reaching the UI).
 */

function client(): SupabaseClient {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error('Supabase client requested but not configured.');
  }
  return supabase;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapOrg(row: any): Organization {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    createdAt: row.created_at,
    // Older rows predate the column; treat missing as allowed.
    chatMediaEnabled: row.chat_media_enabled !== false,
  };
}

function mapSettings(row: any): AppSettings {
  return {
    orgId: row.org_id,
    appName: row.app_name,
    logoUrl: row.logo_url ?? null,
    iconUrl: row.icon_url ?? null,
    theme: row.theme,
    fontFamily: row.font_family,
    splash: row.splash,
    navStyle: row.nav_style,
    viewerAccess: row.viewer_access,
    tabs: row.tabs ?? [],
  };
}

function mapPage(row: any): Page {
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    icon: row.icon ?? null,
    slug: row.slug,
    sortOrder: row.sort_order,
    isPublished: row.is_published,
    visibility: row.visibility,
  };
}

function mapBlock(row: any): Block {
  return {
    id: row.id,
    orgId: row.org_id,
    pageId: row.page_id,
    sectionId: row.section_id ?? null,
    type: row.type,
    sortOrder: row.sort_order,
    props: row.props ?? {},
    visibility: row.visibility,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export const supabaseContentRepository: ContentRepository = {
  async getOrganizationBySlug(slug) {
    const { data, error } = await client()
      .from('organizations')
      .select('*')
      .eq('slug', slug)
      .maybeSingle();
    if (error) throw error;
    return data ? mapOrg(data) : null;
  },

  // The following three read the PUBLISHED SNAPSHOT (published_content), not the
  // live tables — so viewers only ever see content that has been published.
  // Editors use the separate "live" hooks while editing the draft.
  async getAppSettings(orgId) {
    const { data, error } = await client()
      .from('published_content')
      .select('settings')
      .eq('org_id', orgId)
      .maybeSingle();
    if (error) throw error;
    return data?.settings ? mapSettings(data.settings) : null;
  },

  async getPublishedPages(orgId) {
    const { data, error } = await client()
      .from('published_content')
      .select('pages')
      .eq('org_id', orgId)
      .maybeSingle();
    if (error) throw error;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pages = (data?.pages ?? []) as any[];
    return pages
      .map(mapPage)
      .filter((p) => p.isPublished)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  },

  async getPageBlocks(orgId, pageId) {
    const { data, error } = await client()
      .from('published_content')
      .select('blocks')
      .eq('org_id', orgId)
      .maybeSingle();
    if (error) throw error;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const blocks = (data?.blocks ?? []) as any[];
    return blocks
      .map(mapBlock)
      .filter((b) => b.pageId === pageId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  },
};

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { getSupabase } from '@/lib/supabase';
import { slugify } from '@/data/workspaceHooks';
import type { Page, VisibilityRule } from '@/types';

/**
 * Page management writes (Edit Mode): create, rename/update, reorder, publish
 * toggle, visibility, duplicate (with all blocks), and delete. All RLS-guarded
 * to editor+ of the org.
 */
export function usePageMutations(orgId: string) {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['org', orgId, 'all-pages'] });
    qc.invalidateQueries({ queryKey: ['org', orgId, 'pages'] });
    qc.invalidateQueries({ queryKey: ['org', orgId, 'publish-status'] });
  };

  function db() {
    const s = getSupabase();
    if (!s) throw new Error('Editing requires a configured Supabase backend.');
    return s;
  }

  /** Ensure a slug is unique within the org by appending -2, -3, … if needed. */
  async function uniqueSlug(base: string, excludeId?: string): Promise<string> {
    const root = slugify(base) || 'page';
    let candidate = root;
    let n = 1;
    // Pull existing slugs once.
    const { data } = await db().from('pages').select('id, slug').eq('org_id', orgId);
    const taken = new Set((data ?? []).filter((p) => p.id !== excludeId).map((p) => p.slug));
    while (taken.has(candidate)) {
      n += 1;
      candidate = `${root}-${n}`;
    }
    return candidate;
  }

  const createPage = useMutation({
    mutationFn: async (name: string) => {
      const { data: existing } = await db().from('pages').select('sort_order').eq('org_id', orgId).order('sort_order', { ascending: false }).limit(1);
      const nextOrder = (existing?.[0]?.sort_order ?? -1) + 1;
      const slug = await uniqueSlug(name);
      // Included in the live app by default; the workspace stays in draft until
      // the user clicks Publish. The per-page toggle just hides a page if needed.
      const { data, error } = await db()
        .from('pages')
        .insert({ org_id: orgId, name, slug, sort_order: nextOrder, is_published: true, visibility: { kind: 'everyone' } })
        .select()
        .single();
      if (error) throw error;
      return data.slug as string;
    },
    onSuccess: invalidate,
  });

  const updatePage = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<{ name: string; icon: string | null; slug: string; isPublished: boolean; visibility: VisibilityRule }> }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const row: any = {};
      if (patch.name !== undefined) row.name = patch.name;
      if (patch.icon !== undefined) row.icon = patch.icon;
      if (patch.slug !== undefined) row.slug = await uniqueSlug(patch.slug, id);
      if (patch.isPublished !== undefined) row.is_published = patch.isPublished;
      if (patch.visibility !== undefined) row.visibility = patch.visibility;
      const { error } = await db().from('pages').update(row).eq('id', id).eq('org_id', orgId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const reorderPages = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      await Promise.all(orderedIds.map((id, i) => db().from('pages').update({ sort_order: i }).eq('id', id).eq('org_id', orgId)));
    },
    onSuccess: invalidate,
  });

  const deletePage = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db().from('pages').delete().eq('id', id).eq('org_id', orgId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const duplicatePage = useMutation({
    mutationFn: async (page: Page) => {
      const newSlug = await uniqueSlug(`${page.slug}-copy`);
      const { data: existing } = await db().from('pages').select('sort_order').eq('org_id', orgId).order('sort_order', { ascending: false }).limit(1);
      const nextOrder = (existing?.[0]?.sort_order ?? -1) + 1;
      // Copy the page row.
      const { data: newPage, error: pErr } = await db()
        .from('pages')
        .insert({ org_id: orgId, name: `${page.name} (copy)`, icon: page.icon, slug: newSlug, sort_order: nextOrder, is_published: false, visibility: page.visibility })
        .select()
        .single();
      if (pErr) throw pErr;
      // Copy all blocks of the source page.
      const { data: blocks } = await db().from('blocks').select('*').eq('org_id', orgId).eq('page_id', page.id).order('sort_order', { ascending: true });
      if (blocks && blocks.length > 0) {
        const copies = blocks.map((b) => ({ org_id: orgId, page_id: newPage.id, section_id: null, type: b.type, sort_order: b.sort_order, props: b.props, visibility: b.visibility }));
        const { error: bErr } = await db().from('blocks').insert(copies);
        if (bErr) throw bErr;
      }
      return newPage.slug as string;
    },
    onSuccess: invalidate,
  });

  return { createPage, updatePage, reorderPages, deletePage, duplicatePage };
}

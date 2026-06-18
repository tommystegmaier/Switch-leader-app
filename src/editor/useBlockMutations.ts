import { useMutation, useQueryClient } from '@tanstack/react-query';

import { getSupabase } from '@/lib/supabase';
import { liveBlocksKey } from '@/data/liveContent';
import type { Block, BlockType } from '@/types';
import { getBlockDef } from '@/blocks/registry';

/**
 * Write operations for blocks (Edit Mode only).
 *
 * All writes go through the anon/auth Supabase client and are authorized by
 * RLS — only owner/admin/editor of the org can succeed, so this is safe even
 * though it runs in the browser. Edits land in the LIVE (draft) tables; the
 * viewer's published snapshot only changes when the user hits Publish. After
 * each change we invalidate the live block query so the editor preview updates.
 */
export function useBlockMutations(orgId: string, pageId: string) {
  const qc = useQueryClient();
  const key = liveBlocksKey(orgId, pageId);
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: ['org', orgId, 'publish-status'] });
  };

  function db() {
    const s = getSupabase();
    if (!s) throw new Error('Editing requires a configured Supabase backend.');
    return s;
  }

  /** Renumber a set of block ids to sort_order = index (used after reorder). */
  async function persistOrder(orderedIds: string[]) {
    await Promise.all(
      orderedIds.map((id, i) =>
        db().from('blocks').update({ sort_order: i }).eq('id', id).eq('org_id', orgId),
      ),
    );
  }

  const addBlock = useMutation({
    mutationFn: async ({ type, atIndex }: { type: BlockType; atIndex?: number }) => {
      const current = (qc.getQueryData<Block[]>(key) ?? []).slice();
      const def = getBlockDef(type);
      if (!def) throw new Error(`Unknown block type ${type}`);
      const index = atIndex ?? current.length;

      const { data, error } = await db()
        .from('blocks')
        .insert({
          org_id: orgId,
          page_id: pageId,
          type,
          sort_order: index, // temporary; reconciled below
          props: def.defaultProps,
          visibility: { kind: 'everyone' },
        })
        .select()
        .single();
      if (error) throw error;

      // Insert into the order at the requested index and renumber.
      const ids = current.map((b) => b.id);
      ids.splice(index, 0, data.id as string);
      await persistOrder(ids);
      return data.id as string;
    },
    onSuccess: invalidate,
  });

  const updateProps = useMutation({
    mutationFn: async ({ id, props }: { id: string; props: Record<string, unknown> }) => {
      const { error } = await db()
        .from('blocks')
        .update({ props })
        .eq('id', id)
        .eq('org_id', orgId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const deleteBlock = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db().from('blocks').delete().eq('id', id).eq('org_id', orgId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const duplicateBlock = useMutation({
    mutationFn: async (block: Block) => {
      const current = qc.getQueryData<Block[]>(key) ?? [];
      const pos = current.findIndex((b) => b.id === block.id);
      const { data, error } = await db()
        .from('blocks')
        .insert({
          org_id: orgId,
          page_id: pageId,
          section_id: block.sectionId,
          type: block.type,
          sort_order: pos + 1,
          props: block.props,
          visibility: block.visibility,
        })
        .select()
        .single();
      if (error) throw error;
      const ids = current.map((b) => b.id);
      ids.splice(pos + 1, 0, data.id as string);
      await persistOrder(ids);
    },
    onSuccess: invalidate,
  });

  const reorder = useMutation({
    mutationFn: async (orderedIds: string[]) => persistOrder(orderedIds),
    onSuccess: invalidate,
  });

  return { addBlock, updateProps, deleteBlock, duplicateBlock, reorder };
}

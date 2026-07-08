import { lazy, Suspense } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';

import { useMembershipRole } from '@/auth/useMembership';
import { BlockView, blockFlexStyle, isVisibleTo } from '@/blocks/BlockView';
import type { ViewerCtx } from '@/blocks/actions';
import { useOrganization, usePageBlocks, usePublishedPages } from '@/data/hooks';
import { useLivePageBlocks } from '@/data/liveContent';
import { useAllPages } from '@/data/pageHooks';
import { useEditMode } from '@/editor/EditModeProvider';

// The whole editing surface (Tiptap, dnd-kit, property drawer) is loaded only
// when an editor enters Edit Mode — public viewers never download it.
const EditablePage = lazy(() =>
  import('@/editor/EditablePage').then((m) => ({ default: m.EditablePage })),
);

/**
 * Renders a single page. In read-only mode it renders published, visible blocks
 * via the block registry. For an editor in Edit Mode it renders the editable
 * surface (add/reorder/duplicate/delete/inline edit) instead.
 */
export function ViewerPage() {
  const { slug, pageSlug } = useParams<{ slug: string; pageSlug?: string }>();
  const navigate = useNavigate();

  const { data: org } = useOrganization(slug);
  const { data: publishedPages, isLoading: pagesLoading } = usePublishedPages(org?.id);
  const { role, canEdit } = useMembershipRole(org?.id);
  const { editing } = useEditMode();
  const editingPages = editing && canEdit;
  // Editors resolve against ALL pages (incl. drafts); viewers only published.
  const { data: allPages } = useAllPages(editingPages ? org?.id : undefined);
  const pages = editingPages ? allPages : publishedPages;

  const page = pageSlug ? pages?.find((p) => p.slug === pageSlug) : pages?.[0];
  // Editors preview/edit the live (draft) blocks; viewers read the snapshot.
  const publishedBlocks = usePageBlocks(editingPages ? undefined : org?.id, page?.id);
  const liveBlocks = useLivePageBlocks(editingPages ? org?.id : undefined, page?.id);
  const blocks = editingPages ? liveBlocks.data : publishedBlocks.data;
  const blocksLoading = editingPages ? liveBlocks.isLoading : publishedBlocks.isLoading;

  // The first page this person is actually allowed to see (editors see all).
  const firstVisible = (pages ?? []).find((p) => editingPages || isVisibleTo(p.visibility, role));

  // Landing on the workspace root: go to the first page they can see (not just
  // pages[0], which might be a managers-only page).
  if (!pageSlug && org && firstVisible) {
    return <Navigate to={`/o/${org.slug}/${firstVisible.slug}`} replace />;
  }

  if (pagesLoading) return <p className="text-sm text-gray-500">Loading…</p>;
  if (pages && pages.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        {editingPages
          ? 'No pages yet — use “Manage pages” to add one.'
          : canEdit
            ? 'Nothing published yet. Tap ✎ Edit to build your app, then “Publish changes”.'
            : 'This workspace has no published pages yet.'}
      </p>
    );
  }
  if (pageSlug && pages && !page) {
    return <p className="text-sm text-gray-500">Page not found.</p>;
  }

  // A viewer landed on a page they can't see (e.g. a managers-only home page).
  // Bounce them to the first page they CAN see instead of a dead end.
  if (!editing && page && !isVisibleTo(page.visibility, role)) {
    if (firstVisible && firstVisible.slug !== pageSlug) {
      return <Navigate to={`/o/${org!.slug}/${firstVisible.slug}`} replace />;
    }
    return <p className="text-sm text-gray-500">This page isn’t available.</p>;
  }

  const ctx: ViewerCtx = { orgSlug: slug as string, navigate: (to) => navigate(to), editing: editingPages };

  // Edit Mode (editors only) — the editable surface, lazy-loaded.
  if (editing && org && page) {
    return (
      <Suspense fallback={<p className="text-sm text-gray-500">Loading editor…</p>}>
        <EditablePage orgId={org.id} pageId={page.id} blocks={blocks ?? []} ctx={ctx} />
      </Suspense>
    );
  }

  // Read-only mode — published, visible blocks rendered via the registry.
  // Blocks flow left-to-right and wrap; half/third-width blocks sit side by
  // side, full-width blocks take their own row.
  const visible = (blocks ?? []).filter((b) => isVisibleTo(b.visibility, role));

  return (
    <div className="flex flex-wrap items-stretch gap-4">
      {blocksLoading && <p className="w-full text-sm text-gray-500">Loading page…</p>}
      {visible.map((block) => (
        <div key={block.id} style={blockFlexStyle(block)}>
          <BlockView block={block} ctx={ctx} />
        </div>
      ))}
    </div>
  );
}

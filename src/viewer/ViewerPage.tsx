import { lazy, Suspense } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';

import { useMembershipRole } from '@/auth/useMembership';
import { BlockView, isVisibleTo } from '@/blocks/BlockView';
import type { ViewerCtx } from '@/blocks/actions';
import { useOrganization, usePageBlocks, usePublishedPages } from '@/data/hooks';
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
  const { data: pages, isLoading: pagesLoading } = usePublishedPages(org?.id);
  const { role } = useMembershipRole(org?.id);
  const { editing } = useEditMode();

  const page = pageSlug ? pages?.find((p) => p.slug === pageSlug) : pages?.[0];
  const { data: blocks, isLoading: blocksLoading } = usePageBlocks(org?.id, page?.id);

  if (!pageSlug && org && pages && pages.length > 0) {
    return <Navigate to={`/o/${org.slug}/${pages[0].slug}`} replace />;
  }

  if (pagesLoading) return <p className="text-sm text-gray-500">Loading…</p>;
  if (pages && pages.length === 0) {
    return <p className="text-sm text-gray-500">This workspace has no published pages yet.</p>;
  }
  if (pageSlug && pages && !page) {
    return <p className="text-sm text-gray-500">Page not found.</p>;
  }

  const ctx: ViewerCtx = { orgSlug: slug as string, navigate: (to) => navigate(to) };

  // Edit Mode (editors only) — the editable surface, lazy-loaded.
  if (editing && org && page) {
    return (
      <Suspense fallback={<p className="text-sm text-gray-500">Loading editor…</p>}>
        <EditablePage orgId={org.id} pageId={page.id} blocks={blocks ?? []} ctx={ctx} />
      </Suspense>
    );
  }

  // Read-only mode — published, visible blocks rendered via the registry.
  const visible = (blocks ?? []).filter((b) => isVisibleTo(b.visibility, role));

  return (
    <div className="flex flex-col gap-4">
      {blocksLoading && <p className="text-sm text-gray-500">Loading page…</p>}
      {visible.map((block) => (
        <BlockView key={block.id} block={block} ctx={ctx} />
      ))}
    </div>
  );
}

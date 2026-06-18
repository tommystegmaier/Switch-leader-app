import { Navigate, useParams } from 'react-router-dom';

import { useOrganization, usePageBlocks, usePublishedPages } from '@/data/hooks';
import { BlockRenderer } from './BlockRenderer';

/**
 * Renders a single published page's blocks, top to bottom, read-only.
 *
 * If no page slug is given, redirects to the workspace's first published page.
 * Stacked blocks get generous vertical spacing (the reference look); spacing
 * becomes theme-driven in later phases.
 */
export function ViewerPage() {
  const { slug, pageSlug } = useParams<{ slug: string; pageSlug?: string }>();

  const { data: org } = useOrganization(slug);
  const { data: pages, isLoading: pagesLoading } = usePublishedPages(org?.id);

  const page = pageSlug
    ? pages?.find((p) => p.slug === pageSlug)
    : pages?.[0];

  const { data: blocks, isLoading: blocksLoading } = usePageBlocks(
    org?.id,
    page?.id,
  );

  // No page slug in the URL → land on the first published page.
  if (!pageSlug && org && pages && pages.length > 0) {
    return <Navigate to={`/o/${org.slug}/${pages[0].slug}`} replace />;
  }

  if (pagesLoading) {
    return <p className="text-sm text-gray-500">Loading…</p>;
  }

  if (pages && pages.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        This workspace has no published pages yet.
      </p>
    );
  }

  if (pageSlug && pages && !page) {
    return <p className="text-sm text-gray-500">Page not found.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {blocksLoading && <p className="text-sm text-gray-500">Loading page…</p>}
      {(blocks ?? []).map((block) => (
        <BlockRenderer key={block.id} block={block} orgSlug={slug as string} />
      ))}
    </div>
  );
}

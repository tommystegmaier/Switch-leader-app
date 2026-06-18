import { useQuery } from '@tanstack/react-query';

import { getContentRepository } from './index';

/**
 * TanStack Query hooks for reading workspace content.
 *
 * These are the only data entry points the Viewer (and later the Editor) UI
 * uses. Query keys are namespaced by workspace so caches stay isolated per
 * tenant and invalidation (on Publish, Phase 6) stays targeted.
 */

const repo = () => getContentRepository();

export function useOrganization(slug: string | undefined) {
  return useQuery({
    queryKey: ['org', slug],
    enabled: Boolean(slug),
    queryFn: () => repo().getOrganizationBySlug(slug as string),
  });
}

export function useAppSettings(orgId: string | undefined) {
  return useQuery({
    queryKey: ['org', orgId, 'settings'],
    enabled: Boolean(orgId),
    queryFn: () => repo().getAppSettings(orgId as string),
  });
}

export function usePublishedPages(orgId: string | undefined) {
  return useQuery({
    queryKey: ['org', orgId, 'pages'],
    enabled: Boolean(orgId),
    queryFn: () => repo().getPublishedPages(orgId as string),
  });
}

export function usePageBlocks(
  orgId: string | undefined,
  pageId: string | undefined,
) {
  return useQuery({
    queryKey: ['org', orgId, 'page', pageId, 'blocks'],
    enabled: Boolean(orgId) && Boolean(pageId),
    queryFn: () => repo().getPageBlocks(orgId as string, pageId as string),
  });
}

import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/auth/AuthProvider';
import { getContentRepository } from './index';

/**
 * TanStack Query hooks for reading workspace content.
 *
 * These are the only data entry points the Viewer (and later the Editor) UI
 * uses. Query keys are namespaced by workspace so caches stay isolated per
 * tenant and invalidation (on Publish) stays targeted.
 *
 * WHO is asking is part of the key for anything the database filters by role.
 * Since migration 0074 the published pages, blocks and settings come back
 * different for a Leader and a Student, so a key of just (org, 'pages') would
 * hand one person's list to the next — which showed up as a student tapping a
 * tab and being told "Page not found", because the list had been cached a
 * moment earlier when their membership hadn't loaded yet.
 */

const repo = () => getContentRepository();

/** Stable per-person key fragment. 'anon' for a signed-out viewer. */
function useWho(): string {
  const { user } = useAuth();
  return user?.id ?? 'anon';
}

export function useOrganization(slug: string | undefined) {
  return useQuery({
    queryKey: ['org', slug],
    enabled: Boolean(slug),
    queryFn: () => repo().getOrganizationBySlug(slug as string),
  });
}

export function useAppSettings(orgId: string | undefined) {
  const who = useWho();
  return useQuery({
    queryKey: ['org', orgId, 'settings', who],
    enabled: Boolean(orgId),
    queryFn: () => repo().getAppSettings(orgId as string),
  });
}

export function usePublishedPages(orgId: string | undefined) {
  const who = useWho();
  return useQuery({
    queryKey: ['org', orgId, 'pages', who],
    enabled: Boolean(orgId),
    queryFn: () => repo().getPublishedPages(orgId as string),
  });
}

export function usePageBlocks(
  orgId: string | undefined,
  pageId: string | undefined,
) {
  const who = useWho();
  return useQuery({
    queryKey: ['org', orgId, 'page', pageId, 'blocks', who],
    enabled: Boolean(orgId) && Boolean(pageId),
    queryFn: () => repo().getPageBlocks(orgId as string, pageId as string),
  });
}

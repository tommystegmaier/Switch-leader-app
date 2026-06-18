import { QueryClient } from '@tanstack/react-query';

/**
 * Shared TanStack Query client.
 *
 * Published workspace content changes rarely (only on Publish), and we expect
 * hundreds of concurrent read-only viewers per workspace, so we cache
 * aggressively to keep Supabase reads cheap. Realtime invalidation can be
 * layered on later without changing call sites.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minute — published content is fairly static
      gcTime: 1000 * 60 * 30,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

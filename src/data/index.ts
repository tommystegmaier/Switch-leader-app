import { isSupabaseConfigured } from '@/lib/supabase';
import type { ContentRepository } from './contentRepository';
import { sampleContentRepository } from './sampleContentRepository';

/**
 * Selects the active content repository.
 *
 * Phase 1: always the in-memory sample repository.
 * Phase 2: when Supabase is configured, this returns a Supabase-backed
 *          repository (same interface) instead. Until then we transparently
 *          fall back to the sample data so the shell always renders.
 */
export function getContentRepository(): ContentRepository {
  if (isSupabaseConfigured) {
    // Phase 2 will return `supabaseContentRepository` here.
    return sampleContentRepository;
  }
  return sampleContentRepository;
}

export type { ContentRepository } from './contentRepository';
export { SAMPLE_ORG_SLUG } from './sampleContentRepository';

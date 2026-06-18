import { isSupabaseConfigured } from '@/lib/supabase';
import type { ContentRepository } from './contentRepository';
import { sampleContentRepository } from './sampleContentRepository';
import { supabaseContentRepository } from './supabaseContentRepository';

/**
 * Selects the active content repository.
 *
 * When Supabase is configured, the app reads real workspace content (gated by
 * RLS). Otherwise it transparently falls back to the in-memory sample data so
 * the Viewer shell always renders — useful for local UI work without a backend.
 */
export function getContentRepository(): ContentRepository {
  return isSupabaseConfigured
    ? supabaseContentRepository
    : sampleContentRepository;
}

export type { ContentRepository } from './contentRepository';
export { SAMPLE_ORG_SLUG } from './sampleContentRepository';

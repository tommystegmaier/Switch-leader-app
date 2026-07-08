-- ===========================================================================
-- Team Hub Platform — 0018 custom bottom icon bar
--
-- Adds an editable bottom tab bar to each workspace: an array of tabs, each an
-- icon + label + link (to a page or URL), optionally manager-only. Stored on
-- app_settings; publish snapshots it automatically (to_jsonb of the row).
-- ===========================================================================

alter table public.app_settings add column if not exists tabs jsonb not null default '[]'::jsonb;

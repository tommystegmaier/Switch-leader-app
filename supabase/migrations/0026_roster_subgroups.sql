-- ===========================================================================
-- Team Hub Platform — 0026 Roster subgroups
--
-- Lets a roster group optionally nest under a parent group (one level deep):
--   "Group Leaders"  ->  "Middle School Boy Leaders"  ->  people
-- parent_id NULL means a top-level group. People still belong to a single
-- group (which may be a top group OR a subgroup). Deleting a parent cascades
-- to its subgroups (and their people).
-- ===========================================================================

alter table public.roster_groups
  add column if not exists parent_id uuid references public.roster_groups(id) on delete cascade;

create index if not exists roster_groups_parent_idx on public.roster_groups(parent_id);

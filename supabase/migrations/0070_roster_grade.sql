-- ===========================================================================
-- Team Hub Platform — 0070 which grade a roster person leads
--
-- Small-group leaders are assigned to a specific grade, and a roster that lists
-- them in the order they happened to be added makes "who has the 7th graders?"
-- a search rather than a glance. An optional tag on the person lets the roster
-- group them the way the ministry actually thinks about them.
--
-- Free text rather than an enum on purpose. The list of grades is a product
-- decision that will change — a campus that runs 5th grade, or renames a band —
-- and an enum would turn each of those into a migration. The app offers a fixed
-- dropdown, so what lands here is controlled; the column just doesn't need to
-- be the thing enforcing it, and a value it doesn't recognise sorts to the end
-- rather than breaking the page.
-- ===========================================================================

alter table public.roster_people add column if not exists grade text;

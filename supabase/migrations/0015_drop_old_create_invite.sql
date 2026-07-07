-- ===========================================================================
-- Team Hub Platform — 0015 remove the old create_invite overload
--
-- 0013 added a 4-arg create_invite (with p_email) via CREATE OR REPLACE, which
-- creates a NEW function rather than replacing the 3-arg one — leaving two
-- overloads. PostgREST then can't decide which to call (PGRST203). Drop the old
-- 3-arg signature so only the email-capable version remains.
-- ===========================================================================

drop function if exists public.create_invite(uuid, text, timestamptz);

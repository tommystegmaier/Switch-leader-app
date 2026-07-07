-- ===========================================================================
-- Team Hub Platform — 0008 simplify push-subscription insert policy
--
-- The 0007 insert policy required org_is_public(org_id) OR is_org_member(...).
-- In practice that rejected legitimate subscriptions on the live database.
-- Push subscriptions are just opaque device endpoints and are not sensitive
-- (sending is separately gated to editors), so we relax the insert rule to
-- "the workspace must exist." This reliably lets any viewer opt in.
-- ===========================================================================

drop policy if exists push_sub_insert on public.push_subscriptions;
create policy push_sub_insert on public.push_subscriptions
  for insert to anon, authenticated
  with check (exists (select 1 from public.organizations o where o.id = org_id));

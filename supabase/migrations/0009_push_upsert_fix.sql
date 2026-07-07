-- ===========================================================================
-- Team Hub Platform — 0009 fix push-subscription writes
--
-- Root cause of the "new row violates row-level security policy for table
-- push_subscriptions" error: the client used upsert (INSERT ... ON CONFLICT
-- DO UPDATE), but the table had no UPDATE grant/policy. The FIRST subscribe
-- inserted fine; every later tap re-subscribed with the SAME endpoint, hit the
-- UPDATE branch, and was rejected — regardless of how loose the INSERT policy
-- was. The client no longer upserts (it deletes-then-inserts), but we also add
-- the UPDATE grant + policy here so any future upsert works too, and we reset
-- the INSERT policy to a sane "the workspace exists" rule.
-- ===========================================================================

grant insert, update, delete on public.push_subscriptions to anon, authenticated;

drop policy if exists push_sub_insert on public.push_subscriptions;
create policy push_sub_insert on public.push_subscriptions
  for insert to anon, authenticated
  with check (exists (select 1 from public.organizations o where o.id = org_id));

drop policy if exists push_sub_update on public.push_subscriptions;
create policy push_sub_update on public.push_subscriptions
  for update to anon, authenticated
  using (true)
  with check (exists (select 1 from public.organizations o where o.id = org_id));

drop policy if exists push_sub_delete on public.push_subscriptions;
create policy push_sub_delete on public.push_subscriptions
  for delete to anon, authenticated
  using (true);

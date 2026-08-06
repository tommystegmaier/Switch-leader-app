-- ===========================================================================
-- Team Hub Platform — 0048 push_subscriptions RLS (self-only, dependency-free)
--
-- Supersedes 0047. Registering a device kept failing with "new row violates
-- row-level security policy". The insert/update WITH CHECK referenced the
-- organizations table (`exists (select 1 from organizations ...)`), which is
-- itself under RLS — in the write context that subquery can evaluate false and
-- reject the write. This version removes ALL cross-table dependencies.
--
-- Rule: you may register/update a subscription only for YOURSELF — user_id must
-- be your own id, or null when signed out (anonymous public viewers). This is
-- both robust (no other table's policies can interfere) and MORE secure than
-- before: nobody can register a device under someone else's account (which
-- would have re-routed that person's group-chat pushes to the attacker).
-- Reads stay server-only (no SELECT policy). Idempotent.
-- ===========================================================================

grant insert, update, delete on public.push_subscriptions to anon, authenticated;

drop policy if exists push_sub_insert on public.push_subscriptions;
create policy push_sub_insert on public.push_subscriptions
  for insert to anon, authenticated
  with check (user_id is null or user_id = auth.uid());

drop policy if exists push_sub_update on public.push_subscriptions;
create policy push_sub_update on public.push_subscriptions
  for update to anon, authenticated
  using (true)
  with check (user_id is null or user_id = auth.uid());

drop policy if exists push_sub_delete on public.push_subscriptions;
create policy push_sub_delete on public.push_subscriptions
  for delete to anon, authenticated
  using (true);

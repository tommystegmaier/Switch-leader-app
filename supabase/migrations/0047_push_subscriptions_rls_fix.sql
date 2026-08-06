-- ===========================================================================
-- Team Hub Platform — 0047 push_subscriptions RLS fix (enables upsert)
--
-- Real phone push was failing at the very last step: a device keeps the SAME
-- push endpoint across re-subscribes, so saving its subscription must UPDATE
-- the existing row (to attach the current user_id — the link the chat push
-- targets by). That update was blocked with "new row violates row-level
-- security policy" because the table had no UPDATE grant/policy (migration
-- 0009 was never applied on this project).
--
-- This re-applies the correct, permissive-but-safe policies so the client's
-- upsert works: a viewer may register/update/remove a subscription for any
-- real workspace; only the server (service role) ever READS them to send.
-- Idempotent — safe to run more than once.
-- ===========================================================================

grant insert, update, delete on public.push_subscriptions to anon, authenticated;

-- Register: the workspace must exist.
drop policy if exists push_sub_insert on public.push_subscriptions;
create policy push_sub_insert on public.push_subscriptions
  for insert to anon, authenticated
  with check (exists (select 1 from public.organizations o where o.id = org_id));

-- Update (the upsert path): rewrite an existing subscription in place, e.g. to
-- stamp the current user_id onto a device that first subscribed anonymously.
drop policy if exists push_sub_update on public.push_subscriptions;
create policy push_sub_update on public.push_subscriptions
  for update to anon, authenticated
  using (true)
  with check (exists (select 1 from public.organizations o where o.id = org_id));

-- Unsubscribe by (unguessable) endpoint.
drop policy if exists push_sub_delete on public.push_subscriptions;
create policy push_sub_delete on public.push_subscriptions
  for delete to anon, authenticated
  using (true);

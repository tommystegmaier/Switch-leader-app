-- ===========================================================================
-- Team Hub Platform — 0042 per-person birthday notifications
--
-- Birthday alerts used to go to ALL managers. Now each person opts IN for
-- themselves (like the chat bell): the daily birthday push only goes to people
-- who turned it on. The owner still controls whether the feature is on and the
-- daily send time (birthday_config); this table just records who wants them.
-- ===========================================================================

create table if not exists public.birthday_subscribers (
  org_id     uuid not null references public.organizations(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

alter table public.birthday_subscribers enable row level security;
grant select, insert, delete on public.birthday_subscribers to authenticated;

-- You only ever see / manage your OWN opt-in; you must be a member to opt in.
drop policy if exists birthday_subscribers_select on public.birthday_subscribers;
create policy birthday_subscribers_select on public.birthday_subscribers for select
  using (user_id = auth.uid());
drop policy if exists birthday_subscribers_insert on public.birthday_subscribers;
create policy birthday_subscribers_insert on public.birthday_subscribers for insert
  with check (user_id = auth.uid() and public.is_org_member(org_id));
drop policy if exists birthday_subscribers_delete on public.birthday_subscribers;
create policy birthday_subscribers_delete on public.birthday_subscribers for delete
  using (user_id = auth.uid());

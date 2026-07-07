-- ===========================================================================
-- Team Hub Platform — 0007 push notification subscriptions
--
-- Stores each device's Web Push subscription for a workspace. Viewers (even
-- anonymous, on public workspaces) can register a subscription; the send
-- happens server-side (a Cloudflare Pages Function using the service role key),
-- so there is intentionally NO public SELECT policy here.
-- ===========================================================================

create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_id    uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_org_idx on public.push_subscriptions(org_id);

alter table public.push_subscriptions enable row level security;

grant insert, delete on public.push_subscriptions to anon, authenticated;

-- Register a subscription: allowed for members, or for anyone on a PUBLIC
-- workspace (so public viewers can opt in to notifications).
drop policy if exists push_sub_insert on public.push_subscriptions;
create policy push_sub_insert on public.push_subscriptions
  for insert to anon, authenticated
  with check (public.org_is_public(org_id) or public.is_org_member(org_id));

-- Unsubscribe: a client may remove a subscription by its (unguessable) endpoint.
drop policy if exists push_sub_delete on public.push_subscriptions;
create policy push_sub_delete on public.push_subscriptions
  for delete to anon, authenticated
  using (true);

-- No SELECT/UPDATE policy: only the server (service role) reads subscriptions
-- to send notifications.

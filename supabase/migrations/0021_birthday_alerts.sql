-- ===========================================================================
-- Team Hub Platform — 0021 daily birthday alerts (for managers)
--
-- A per-workspace setting: turn on a daily "🎂 birthdays today" push to
-- managers (owner/admin/editor) at a chosen local time. A scheduled sweep
-- (Cloudflare function /api/birthday-cron, triggered by pg_cron) checks each
-- workspace once its chosen time has passed for the day and sends the alert.
-- ===========================================================================

create table if not exists public.birthday_config (
  org_id       uuid primary key references public.organizations(id) on delete cascade,
  enabled      boolean not null default false,
  notify_time  text not null default '08:00',      -- local 'HH:MM'
  timezone     text not null default 'UTC',          -- IANA tz of the admin
  last_sent_on date
);

alter table public.birthday_config enable row level security;
grant select, insert, update, delete on public.birthday_config to authenticated;

drop policy if exists birthday_config_select on public.birthday_config;
create policy birthday_config_select on public.birthday_config
  for select using (public.has_org_role(org_id, array['owner','admin','editor']));
drop policy if exists birthday_config_write on public.birthday_config;
create policy birthday_config_write on public.birthday_config
  for all using (public.has_org_role(org_id, array['owner','admin','editor']))
  with check (public.has_org_role(org_id, array['owner','admin','editor']));

-- Server-only: member birthdays for a workspace (no auth-role gate, so the
-- scheduled sweep can read them with the service role). NOT granted to normal
-- users — the manager-gated org_birthdays() is what the app uses.
create or replace function public.org_birthdays_all(p_org uuid)
returns table (user_id uuid, name text, birthday text)
language sql security definer set search_path = public as $$
  select m.user_id,
         nullif(trim(coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name','')),''),
         nullif(trim(coalesce(u.raw_user_meta_data->>'birthday','')),'')
  from public.memberships m
  join auth.users u on u.id = m.user_id
  where m.org_id = p_org
    and nullif(trim(coalesce(u.raw_user_meta_data->>'birthday','')),'') is not null;
$$;

revoke all on function public.org_birthdays_all(uuid) from public;
revoke all on function public.org_birthdays_all(uuid) from authenticated;
grant execute on function public.org_birthdays_all(uuid) to service_role;

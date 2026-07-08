-- ===========================================================================
-- Team Hub Platform — 0017 recurring scheduling (v2)
--
-- Replaces the per-date assignment model (0016) with a recurring weekly roster:
--   * schedule_roster    — a person serves in a role EVERY week (until removed).
--   * schedule_config    — which weekday is "serving day" (0=Sun..6=Sat).
--   * schedule_skips      — specific serving-day dates that are weeks off.
--   * schedule_responses  — a volunteer's confirm/decline for ONE week.
-- Managers manage the roster (teams→roles→people); the weekly dates are
-- generated from the serving weekday minus the skip weeks; volunteers confirm/
-- decline each upcoming week.
-- ===========================================================================

drop table if exists public.schedule_assignments cascade;

-- 0016 defined my_schedule with different return columns; its return type
-- changes below, so drop it first (CREATE OR REPLACE can't change a function's
-- return shape). Safe to re-run this whole script.
drop function if exists public.my_schedule(uuid);

create table if not exists public.schedule_config (
  org_id       uuid primary key references public.organizations(id) on delete cascade,
  serve_weekday smallint not null default 0 check (serve_weekday between 0 and 6)
);

create table if not exists public.schedule_roster (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  role_id    uuid not null references public.schedule_roles(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (role_id, user_id)
);

create table if not exists public.schedule_skips (
  org_id     uuid not null references public.organizations(id) on delete cascade,
  serve_date date not null,
  primary key (org_id, serve_date)
);

create table if not exists public.schedule_responses (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  role_id      uuid not null references public.schedule_roles(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  serve_date   date not null,
  status       text not null check (status in ('confirmed','declined')),
  responded_at timestamptz not null default now(),
  unique (role_id, user_id, serve_date)
);

create index if not exists schedule_roster_role_idx on public.schedule_roster(role_id);
create index if not exists schedule_roster_user_idx on public.schedule_roster(user_id);
create index if not exists schedule_responses_lookup_idx on public.schedule_responses(org_id, serve_date);

alter table public.schedule_config    enable row level security;
alter table public.schedule_roster    enable row level security;
alter table public.schedule_skips     enable row level security;
alter table public.schedule_responses enable row level security;

grant select, insert, update, delete on public.schedule_config to authenticated;
grant select, insert, update, delete on public.schedule_roster to authenticated;
grant select, insert, update, delete on public.schedule_skips to authenticated;
grant select, insert, update, delete on public.schedule_responses to authenticated;

-- Config + roster + skips: members can read; managers write.
drop policy if exists schedule_config_select on public.schedule_config;
create policy schedule_config_select on public.schedule_config for select using (public.is_org_member(org_id));
drop policy if exists schedule_config_write on public.schedule_config;
create policy schedule_config_write on public.schedule_config for all
  using (public.has_org_role(org_id, array['owner','admin','editor']))
  with check (public.has_org_role(org_id, array['owner','admin','editor']));

drop policy if exists schedule_roster_select on public.schedule_roster;
create policy schedule_roster_select on public.schedule_roster for select
  using (user_id = auth.uid() or public.has_org_role(org_id, array['owner','admin','editor']));
drop policy if exists schedule_roster_write on public.schedule_roster;
create policy schedule_roster_write on public.schedule_roster for all
  using (public.has_org_role(org_id, array['owner','admin','editor']))
  with check (public.has_org_role(org_id, array['owner','admin','editor']));

drop policy if exists schedule_skips_select on public.schedule_skips;
create policy schedule_skips_select on public.schedule_skips for select using (public.is_org_member(org_id));
drop policy if exists schedule_skips_write on public.schedule_skips;
create policy schedule_skips_write on public.schedule_skips for all
  using (public.has_org_role(org_id, array['owner','admin','editor']))
  with check (public.has_org_role(org_id, array['owner','admin','editor']));

-- Responses: a volunteer sees/sets only their own; managers read all.
drop policy if exists schedule_responses_select on public.schedule_responses;
create policy schedule_responses_select on public.schedule_responses for select
  using (user_id = auth.uid() or public.has_org_role(org_id, array['owner','admin','editor']));
drop policy if exists schedule_responses_write on public.schedule_responses;
create policy schedule_responses_write on public.schedule_responses for all
  using (public.has_org_role(org_id, array['owner','admin','editor']))
  with check (public.has_org_role(org_id, array['owner','admin','editor']));

-- --- helpers ---------------------------------------------------------------

-- The next serving-day date on/after a given date, for a workspace's weekday.
create or replace function public.next_serve_date(p_org uuid, p_from date)
returns date language sql stable set search_path = public as $$
  select p_from + (((coalesce((select serve_weekday from public.schedule_config where org_id = p_org), 0))
                    - extract(dow from p_from)::int + 7) % 7);
$$;

-- Managers: the roster (people per role) with names.
create or replace function public.list_roster(p_org uuid)
returns table (role_id uuid, user_id uuid, name text, email text)
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_org_role(p_org, array['owner','admin','editor']) then
    raise exception 'only a manager can view the roster';
  end if;
  return query
  select rr.role_id, rr.user_id,
         nullif(trim(coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name','')),''),
         u.email::text
  from public.schedule_roster rr
  join auth.users u on u.id = rr.user_id
  where rr.org_id = p_org
  order by 3 nulls last, 4;
end; $$;

-- Managers: confirm/decline statuses for a specific serving date.
create or replace function public.roster_status(p_org uuid, p_date date)
returns table (role_id uuid, user_id uuid, status text)
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_org_role(p_org, array['owner','admin','editor']) then
    raise exception 'only a manager can view responses';
  end if;
  return query
  select r.role_id, r.user_id, r.status
  from public.schedule_responses r
  where r.org_id = p_org and r.serve_date = p_date;
end; $$;

-- Volunteer: my upcoming serving dates (next 8 weeks, minus weeks off).
create or replace function public.my_schedule(p_org uuid)
returns table (role_id uuid, team_name text, role_name text, serve_date date, status text)
language plpgsql security definer set search_path = public as $$
declare
  v_start date;
  v_date date;
  i int;
begin
  if auth.uid() is null then raise exception 'sign in to view your schedule'; end if;
  v_start := public.next_serve_date(p_org, current_date);
  for i in 0..7 loop
    v_date := v_start + (i * 7);
    if exists (select 1 from public.schedule_skips s where s.org_id = p_org and s.serve_date = v_date) then
      continue;
    end if;
    return query
    select rr.role_id, t.name, r.name, v_date,
           coalesce((select resp.status from public.schedule_responses resp
                      where resp.role_id = rr.role_id and resp.user_id = auth.uid() and resp.serve_date = v_date), 'pending')
    from public.schedule_roster rr
    join public.schedule_roles r on r.id = rr.role_id
    join public.schedule_teams t on t.id = r.team_id
    where rr.org_id = p_org and rr.user_id = auth.uid();
  end loop;
end; $$;

-- Volunteer: confirm/decline one week of one role.
create or replace function public.respond_occurrence(p_role uuid, p_date date, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  if p_status not in ('confirmed','declined') then raise exception 'invalid response'; end if;
  select org_id into v_org from public.schedule_roles where id = p_role;
  if v_org is null then raise exception 'role not found'; end if;
  if not exists (select 1 from public.schedule_roster rr where rr.role_id = p_role and rr.user_id = auth.uid()) then
    raise exception 'you are not scheduled for this role';
  end if;
  insert into public.schedule_responses (org_id, role_id, user_id, serve_date, status, responded_at)
  values (v_org, p_role, auth.uid(), p_date, p_status, now())
  on conflict (role_id, user_id, serve_date) do update set status = excluded.status, responded_at = now();
end; $$;

-- Managers: member birthdays + contact info (from what they entered at signup).
create or replace function public.org_birthdays(p_org uuid)
returns table (user_id uuid, name text, email text, phone text, birthday text)
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_org_role(p_org, array['owner','admin','editor']) then
    raise exception 'only a manager can view birthdays';
  end if;
  return query
  select m.user_id,
         nullif(trim(coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name','')),''),
         u.email::text,
         nullif(trim(coalesce(u.raw_user_meta_data->>'phone','')),''),
         nullif(trim(coalesce(u.raw_user_meta_data->>'birthday','')),'')
  from public.memberships m
  join auth.users u on u.id = m.user_id
  where m.org_id = p_org
    and nullif(trim(coalesce(u.raw_user_meta_data->>'birthday','')),'') is not null;
end; $$;

revoke all on function public.next_serve_date(uuid, date) from public;
revoke all on function public.list_roster(uuid) from public;
revoke all on function public.roster_status(uuid, date) from public;
revoke all on function public.my_schedule(uuid) from public;
revoke all on function public.respond_occurrence(uuid, date, text) from public;
revoke all on function public.org_birthdays(uuid) from public;
grant execute on function public.next_serve_date(uuid, date) to authenticated;
grant execute on function public.list_roster(uuid) to authenticated;
grant execute on function public.roster_status(uuid, date) to authenticated;
grant execute on function public.my_schedule(uuid) to authenticated;
grant execute on function public.respond_occurrence(uuid, date, text) to authenticated;
grant execute on function public.org_birthdays(uuid) to authenticated;

-- Old per-date RPCs from 0016 are obsolete under the recurring model.
drop function if exists public.list_schedule(uuid, date);
drop function if exists public.respond_assignment(uuid, text);

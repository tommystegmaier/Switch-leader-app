-- ===========================================================================
-- Team Hub Platform — 0016 volunteer scheduling
--
-- A lightweight Planning-Center-style scheduler, scoped per workspace:
--   teams  → roles → assignments (a person serving in a role on a date).
-- Volunteers (any member with an account) see ONLY their own assignments and
-- confirm/decline them; managers (owner/admin/editor) build the teams/roles and
-- assign people and see the whole schedule. schedule_mute lets a manager turn
-- off their own confirm/decline notifications.
--
-- Access is enforced two ways:
--  * RLS on the tables (members read teams/roles; managers write everything;
--    a volunteer can read only their own assignment rows).
--  * SECURITY DEFINER RPCs for the cross-table reads that need auth.users names
--    (list_schedule / my_schedule / schedule_members) and for a volunteer's
--    response (respond_assignment), which only lets them set their own status.
-- ===========================================================================

create table if not exists public.schedule_teams (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  name       text not null,
  sort       int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.schedule_roles (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  team_id    uuid not null references public.schedule_teams(id) on delete cascade,
  name       text not null,
  sort       int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.schedule_assignments (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  role_id      uuid not null references public.schedule_roles(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  serve_date   date not null,
  status       text not null default 'pending' check (status in ('pending','confirmed','declined')),
  note         text,
  created_at   timestamptz not null default now(),
  responded_at timestamptz
);

create table if not exists public.schedule_mute (
  org_id  uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (org_id, user_id)
);

create index if not exists schedule_roles_team_idx on public.schedule_roles(team_id);
create index if not exists schedule_assignments_org_date_idx on public.schedule_assignments(org_id, serve_date);
create index if not exists schedule_assignments_user_idx on public.schedule_assignments(user_id);

alter table public.schedule_teams       enable row level security;
alter table public.schedule_roles       enable row level security;
alter table public.schedule_assignments enable row level security;
alter table public.schedule_mute        enable row level security;

grant select, insert, update, delete on public.schedule_teams to authenticated;
grant select, insert, update, delete on public.schedule_roles to authenticated;
grant select, insert, update, delete on public.schedule_assignments to authenticated;
grant select, insert, update, delete on public.schedule_mute to authenticated;

-- Teams & roles: members read (needed to build/label things); managers write.
drop policy if exists schedule_teams_select on public.schedule_teams;
create policy schedule_teams_select on public.schedule_teams
  for select using (public.is_org_member(org_id));
drop policy if exists schedule_teams_write on public.schedule_teams;
create policy schedule_teams_write on public.schedule_teams
  for all using (public.has_org_role(org_id, array['owner','admin','editor']))
  with check  (public.has_org_role(org_id, array['owner','admin','editor']));

drop policy if exists schedule_roles_select on public.schedule_roles;
create policy schedule_roles_select on public.schedule_roles
  for select using (public.is_org_member(org_id));
drop policy if exists schedule_roles_write on public.schedule_roles;
create policy schedule_roles_write on public.schedule_roles
  for all using (public.has_org_role(org_id, array['owner','admin','editor']))
  with check  (public.has_org_role(org_id, array['owner','admin','editor']));

-- Assignments: a volunteer reads only their own; managers read/write all.
-- (Volunteers change status via respond_assignment, not a direct UPDATE.)
drop policy if exists schedule_assignments_select on public.schedule_assignments;
create policy schedule_assignments_select on public.schedule_assignments
  for select using (
    user_id = auth.uid()
    or public.has_org_role(org_id, array['owner','admin','editor'])
  );
drop policy if exists schedule_assignments_write on public.schedule_assignments;
create policy schedule_assignments_write on public.schedule_assignments
  for all using (public.has_org_role(org_id, array['owner','admin','editor']))
  with check  (public.has_org_role(org_id, array['owner','admin','editor']));

-- Mute: a manager manages only their own row.
drop policy if exists schedule_mute_rw on public.schedule_mute;
create policy schedule_mute_rw on public.schedule_mute
  for all using (user_id = auth.uid() and public.is_org_member(org_id))
  with check  (user_id = auth.uid() and public.is_org_member(org_id));

-- --- RPCs ------------------------------------------------------------------

-- People a manager can assign (everyone in the workspace, with names).
create or replace function public.schedule_members(p_org uuid)
returns table (user_id uuid, name text, email text)
language plpgsql security definer set search_path = public
as $$
begin
  if not public.has_org_role(p_org, array['owner','admin','editor']) then
    raise exception 'only a manager can view members';
  end if;
  return query
  select m.user_id,
         nullif(trim(coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', '')), ''),
         u.email::text
  from public.memberships m
  join auth.users u on u.id = m.user_id
  where m.org_id = p_org
  order by 2 nulls last, 3;
end;
$$;

-- The full schedule (managers), from a given date forward.
create or replace function public.list_schedule(p_org uuid, p_from date default null)
returns table (
  id uuid, serve_date date, status text, note text,
  team_id uuid, team_name text, role_id uuid, role_name text,
  person_id uuid, person_name text, person_email text, responded_at timestamptz
)
language plpgsql security definer set search_path = public
as $$
begin
  if not public.has_org_role(p_org, array['owner','admin','editor']) then
    raise exception 'only a manager can view the schedule';
  end if;
  return query
  select a.id, a.serve_date, a.status, a.note,
         t.id, t.name, r.id, r.name,
         a.user_id,
         nullif(trim(coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', '')), ''),
         u.email::text, a.responded_at
  from public.schedule_assignments a
  join public.schedule_roles r on r.id = a.role_id
  join public.schedule_teams t on t.id = r.team_id
  join auth.users u on u.id = a.user_id
  where a.org_id = p_org
    and (p_from is null or a.serve_date >= p_from)
  order by a.serve_date, t.sort, t.name, r.sort, r.name;
end;
$$;

-- A volunteer's own assignments (no visibility into anyone else's).
create or replace function public.my_schedule(p_org uuid)
returns table (
  id uuid, serve_date date, status text, note text,
  team_name text, role_name text
)
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'sign in to view your schedule';
  end if;
  return query
  select a.id, a.serve_date, a.status, a.note, t.name, r.name
  from public.schedule_assignments a
  join public.schedule_roles r on r.id = a.role_id
  join public.schedule_teams t on t.id = r.team_id
  where a.org_id = p_org and a.user_id = auth.uid()
  order by a.serve_date;
end;
$$;

-- A volunteer confirms/declines one of their own assignments.
create or replace function public.respond_assignment(p_id uuid, p_status text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if p_status not in ('confirmed','declined') then
    raise exception 'invalid response';
  end if;
  update public.schedule_assignments
     set status = p_status, responded_at = now()
   where id = p_id and user_id = auth.uid();
  if not found then
    raise exception 'assignment not found';
  end if;
end;
$$;

revoke all on function public.schedule_members(uuid) from public;
revoke all on function public.list_schedule(uuid, date) from public;
revoke all on function public.my_schedule(uuid) from public;
revoke all on function public.respond_assignment(uuid, text) from public;
grant execute on function public.schedule_members(uuid) to authenticated;
grant execute on function public.list_schedule(uuid, date) to authenticated;
grant execute on function public.my_schedule(uuid) to authenticated;
grant execute on function public.respond_assignment(uuid, text) to authenticated;

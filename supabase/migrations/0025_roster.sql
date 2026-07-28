-- ===========================================================================
-- Team Hub Platform — 0025 Roster (org chart)
--
-- A directory/org-chart block: managers create GROUPS and add PEOPLE to each
-- group with a role, optional photo, and contact info. Unlike the serving
-- schedule, roster people are free-text entries typed by the manager (not tied
-- to app accounts). Everyone who can view the workspace can see the roster;
-- only owners/admins/editors can change it.
-- ===========================================================================

create table if not exists public.roster_groups (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  name       text not null,
  sort       int  not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.roster_people (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  group_id   uuid not null references public.roster_groups(id) on delete cascade,
  name       text not null,
  role       text,
  photo_url  text,
  email      text,
  phone      text,
  sort       int  not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists roster_groups_org_idx  on public.roster_groups(org_id);
create index if not exists roster_people_org_idx   on public.roster_people(org_id);
create index if not exists roster_people_group_idx on public.roster_people(group_id);

alter table public.roster_groups enable row level security;
alter table public.roster_people enable row level security;

-- Public viewers of a public workspace (and any member) can READ the roster.
grant select on public.roster_groups to anon, authenticated;
grant select on public.roster_people to anon, authenticated;
-- Only signed-in managers can WRITE (the policies further restrict to editors+).
grant insert, update, delete on public.roster_groups to authenticated;
grant insert, update, delete on public.roster_people to authenticated;

drop policy if exists roster_groups_select on public.roster_groups;
create policy roster_groups_select on public.roster_groups for select
  using (public.is_org_member(org_id) or public.org_is_public(org_id));
drop policy if exists roster_groups_write on public.roster_groups;
create policy roster_groups_write on public.roster_groups for all
  using (public.has_org_role(org_id, array['owner','admin','editor']))
  with check (public.has_org_role(org_id, array['owner','admin','editor']));

drop policy if exists roster_people_select on public.roster_people;
create policy roster_people_select on public.roster_people for select
  using (public.is_org_member(org_id) or public.org_is_public(org_id));
drop policy if exists roster_people_write on public.roster_people;
create policy roster_people_write on public.roster_people for all
  using (public.has_org_role(org_id, array['owner','admin','editor']))
  with check (public.has_org_role(org_id, array['owner','admin','editor']));

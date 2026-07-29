-- ===========================================================================
-- Team Hub Platform — 0028 Roster titles/roles list
--
-- A per-workspace, editable list of titles/roles ("Coach", "Group Leader", …)
-- that managers pick from when assigning a person in the roster. Everyone who
-- can view the workspace can read the list (so the dropdown is consistent);
-- only owners/admins can change it. The chosen title is still stored as text on
-- roster_people.role, so nothing else changes.
-- ===========================================================================

create table if not exists public.roster_roles (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  name       text not null,
  sort       int  not null default 0,
  created_at timestamptz not null default now(),
  unique (org_id, name)
);

create index if not exists roster_roles_org_idx on public.roster_roles(org_id);

alter table public.roster_roles enable row level security;

grant select on public.roster_roles to anon, authenticated;
grant insert, update, delete on public.roster_roles to authenticated;

drop policy if exists roster_roles_select on public.roster_roles;
create policy roster_roles_select on public.roster_roles for select
  using (public.is_org_member(org_id) or public.org_is_public(org_id));
drop policy if exists roster_roles_write on public.roster_roles;
create policy roster_roles_write on public.roster_roles for all
  using (public.has_org_role(org_id, array['owner','admin']))
  with check (public.has_org_role(org_id, array['owner','admin']));

-- Seed the default title list into every existing workspace (only where the
-- list is still empty, so re-running is safe and won't duplicate).
insert into public.roster_roles (org_id, name, sort)
select o.id, v.name, v.ord
from public.organizations o
cross join (values
  ('Coach', 0), ('Group Leader', 1), ('Hospitality', 2), ('Check-In', 3),
  ('Admin', 4), ('Greeter', 5), ('Safety Team', 6), ('Photography', 7),
  ('ProPresenter', 8), ('Social Media', 9)
) as v(name, ord)
where not exists (select 1 from public.roster_roles rr where rr.org_id = o.id)
on conflict (org_id, name) do nothing;

-- ===========================================================================
-- Switch Leader App — 0078 separate title lists for leaders and students
--
-- The titles list ("Coach", "Host Team", "Safety Team"…) was one list per
-- workspace, shared by both rosters. So editing it on the student roster
-- rewrote the leader roster's dropdown too — a leader roster needs a long and
-- varied list, and a student roster needs about three entries.
--
-- Same shape as roster_groups: the list belongs to one side of the app.
-- ===========================================================================

alter table public.roster_roles
  add column if not exists kind text not null default 'leader';

alter table public.roster_roles drop constraint if exists roster_roles_kind_check;
alter table public.roster_roles add constraint roster_roles_kind_check
  check (kind in ('leader','student'));

-- "Coach" has to be able to exist on both sides at once, so the name is only
-- unique within a side. The old constraint was on (org_id, name).
alter table public.roster_roles drop constraint if exists roster_roles_org_id_name_key;
drop index if exists roster_roles_org_name_key;
create unique index if not exists roster_roles_org_kind_name_key
  on public.roster_roles(org_id, kind, name);

create index if not exists roster_roles_org_kind_idx on public.roster_roles(org_id, kind);

-- --- a starting list for the student side ---------------------------------
-- Only where a workspace has no student titles yet, so re-running is safe and
-- an edited list is never overwritten.
insert into public.roster_roles (org_id, name, sort, kind)
select o.id, v.name, v.ord, 'student'
from public.organizations o
cross join (values ('Coach', 0), ('Group Leader', 1), ('Student', 2)) as v(name, ord)
where not exists (
  select 1 from public.roster_roles r
   where r.org_id = o.id and r.kind = 'student'
)
on conflict do nothing;

-- ===========================================================================
-- Team Hub Platform — 0034 Coaches auto-channel + per-chat mute
--
-- 1. A roster group can be an AUTO group (auto_role set): its members are
--    everyone in the workspace with that title, regardless of which group they
--    sit in. We seed a "Coaches" auto group (auto_role = 'Coach') so there's a
--    single channel with every Coach. Auto groups are hidden from the Roster
--    editor and skipped by the schedule sync (they have no direct people).
-- 2. chat_mutes lets a person silence push for a specific channel (they may not
--    want a ping for every message in every chat).
-- ===========================================================================

alter table public.roster_groups add column if not exists auto_role text;

-- Access: managers everywhere; for an auto group, anyone who holds that title;
-- for a normal group, its directly-assigned people.
create or replace function public.can_access_chat_group(p_group uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.roster_groups g
    where g.id = p_group
      and (
        public.has_org_role(g.org_id, array['owner','admin','editor'])
        or (g.auto_role is not null and exists (
              select 1 from public.roster_people rp
              where rp.org_id = g.org_id and rp.role = g.auto_role and rp.user_id = auth.uid()))
        or (g.auto_role is null and exists (
              select 1 from public.roster_people rp
              where rp.group_id = g.id and rp.user_id = auth.uid()))
      )
  );
$$;
revoke all on function public.can_access_chat_group(uuid) from public;
grant execute on function public.can_access_chat_group(uuid) to authenticated;

-- Channels the current user can see (now including auto groups they qualify for).
create or replace function public.my_chat_groups(p_org uuid)
returns table (group_id uuid, name text, parent_id uuid, parent_name text, sort int, unread int)
language plpgsql security definer set search_path = public as $$
declare v_mgr boolean;
begin
  if auth.uid() is null then return; end if;
  v_mgr := public.has_org_role(p_org, array['owner','admin','editor']);
  return query
  select g.id, g.name, g.parent_id, pg.name, g.sort,
    (select count(*)::int from public.chat_messages m
       where m.group_id = g.id and m.user_id <> auth.uid()
         and m.created_at > coalesce(
           (select r.last_read_at from public.chat_reads r where r.group_id = g.id and r.user_id = auth.uid()),
           'epoch'::timestamptz))
  from public.roster_groups g
  left join public.roster_groups pg on pg.id = g.parent_id
  where g.org_id = p_org
    and (
      v_mgr
      or (g.auto_role is null and exists (select 1 from public.roster_people rp where rp.group_id = g.id and rp.user_id = auth.uid()))
      or (g.auto_role is not null and exists (select 1 from public.roster_people rp where rp.org_id = p_org and rp.role = g.auto_role and rp.user_id = auth.uid()))
    )
  order by g.parent_id nulls first, g.sort, g.name;
end;
$$;
revoke all on function public.my_chat_groups(uuid) from public;
grant execute on function public.my_chat_groups(uuid) to authenticated;

create or replace function public.my_chat_unread_total(p_org uuid)
returns int language plpgsql security definer set search_path = public as $$
declare v_mgr boolean; v_total int;
begin
  if auth.uid() is null then return 0; end if;
  v_mgr := public.has_org_role(p_org, array['owner','admin','editor']);
  select coalesce(sum(x.unread), 0)::int into v_total from (
    select (select count(*) from public.chat_messages m
       where m.group_id = g.id and m.user_id <> auth.uid()
         and m.created_at > coalesce(
           (select r.last_read_at from public.chat_reads r where r.group_id = g.id and r.user_id = auth.uid()),
           'epoch'::timestamptz)) as unread
    from public.roster_groups g
    where g.org_id = p_org
      and (
        v_mgr
        or (g.auto_role is null and exists (select 1 from public.roster_people rp where rp.group_id = g.id and rp.user_id = auth.uid()))
        or (g.auto_role is not null and exists (select 1 from public.roster_people rp where rp.org_id = p_org and rp.role = g.auto_role and rp.user_id = auth.uid()))
      )
  ) x;
  return v_total;
end;
$$;
revoke all on function public.my_chat_unread_total(uuid) from public;
grant execute on function public.my_chat_unread_total(uuid) to authenticated;

-- The schedule sync should ignore auto groups (they hold no direct people).
create or replace function public.sync_schedule_from_roster(p_org uuid)
returns table (teams_created int, people_added int)
language plpgsql security definer set search_path = public as $$
declare
  g record; rp record; v_team uuid; v_role uuid; v_rolename text;
  v_teams int := 0; v_added int := 0;
begin
  if not public.has_org_role(p_org, array['owner','admin','editor']) then
    raise exception 'only a manager can sync the schedule';
  end if;
  for g in select id, name from public.roster_groups where org_id = p_org and auto_role is null loop
    select id into v_team from public.schedule_teams where org_id = p_org and name = g.name limit 1;
    if v_team is null then
      insert into public.schedule_teams (org_id, name) values (p_org, g.name) returning id into v_team;
      v_teams := v_teams + 1;
    end if;
    for rp in select user_id, role from public.roster_people where group_id = g.id and user_id is not null loop
      v_rolename := coalesce(nullif(trim(rp.role), ''), 'Member');
      select id into v_role from public.schedule_roles where org_id = p_org and team_id = v_team and name = v_rolename limit 1;
      if v_role is null then
        insert into public.schedule_roles (org_id, team_id, name) values (p_org, v_team, v_rolename) returning id into v_role;
      end if;
      insert into public.schedule_roster (org_id, role_id, user_id) values (p_org, v_role, rp.user_id)
        on conflict (role_id, user_id) do nothing;
      if found then v_added := v_added + 1; end if;
    end loop;
  end loop;
  return query select v_teams, v_added;
end;
$$;
revoke all on function public.sync_schedule_from_roster(uuid) from public;
grant execute on function public.sync_schedule_from_roster(uuid) to authenticated;

-- Per-channel mute (per user).
create table if not exists public.chat_mutes (
  org_id   uuid not null references public.organizations(id) on delete cascade,
  group_id uuid not null references public.roster_groups(id) on delete cascade,
  user_id  uuid not null references auth.users(id) on delete cascade,
  primary key (group_id, user_id)
);
alter table public.chat_mutes enable row level security;
grant select, insert, delete on public.chat_mutes to authenticated;
drop policy if exists chat_mutes_select on public.chat_mutes;
create policy chat_mutes_select on public.chat_mutes for select using (user_id = auth.uid());
drop policy if exists chat_mutes_write on public.chat_mutes;
create policy chat_mutes_write on public.chat_mutes for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.can_access_chat_group(group_id));

-- Seed a Coaches auto channel into every existing workspace (idempotent).
insert into public.roster_groups (org_id, name, sort, auto_role)
select o.id, 'Coaches', 0, 'Coach'
from public.organizations o
where not exists (select 1 from public.roster_groups g where g.org_id = o.id and g.auto_role = 'Coach');

-- New workspaces get a Coaches channel too.
create or replace function public.create_organization(p_name text, p_slug text)
returns public.organizations
language plpgsql security definer set search_path = public as $$
declare v_org public.organizations;
begin
  if auth.uid() is null then raise exception 'authentication required to create a workspace'; end if;
  insert into public.organizations (name, slug) values (p_name, lower(p_slug)) returning * into v_org;
  insert into public.app_settings (org_id, app_name) values (v_org.id, p_name);
  insert into public.memberships (user_id, org_id, role) values (auth.uid(), v_org.id, 'owner');
  insert into public.roster_groups (org_id, name, sort, auto_role) values (v_org.id, 'Coaches', 0, 'Coach');
  return v_org;
end;
$$;
revoke all on function public.create_organization(text, text) from public;
grant execute on function public.create_organization(text, text) to authenticated;

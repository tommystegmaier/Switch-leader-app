-- ===========================================================================
-- Team Hub Platform — 0049 "All Leaders" channel (everyone on the roster)
--
-- A single chat channel that contains EVERYONE on the roster, regardless of
-- which group/subgroup they're in — so an owner/editor can message the whole
-- team at once instead of posting in each subgroup. Modeled on the Coaches
-- auto-channel, but membership is "anyone on the roster" rather than a role.
--
-- Marked with a new flag is_all = true (no auto_role, no directly-assigned
-- people). Membership everywhere = managers (they see all) + anyone who has a
-- roster_people row in the org. Mute still works per person.
-- ===========================================================================

alter table public.roster_groups add column if not exists is_all boolean not null default false;

-- Access (see/post + mute + reads): managers, or — for the All Leaders group —
-- anyone on the roster; otherwise the existing auto_role / assigned-people rule.
create or replace function public.can_access_chat_group(p_group uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.roster_groups g
    where g.id = p_group
      and (
        public.has_org_role(g.org_id, array['owner','admin','editor'])
        or (g.is_all and exists (
              select 1 from public.roster_people rp
              where rp.org_id = g.org_id and rp.user_id = auth.uid()))
        or (not g.is_all and g.auto_role is not null and exists (
              select 1 from public.roster_people rp
              where rp.org_id = g.org_id and rp.role = g.auto_role and rp.user_id = auth.uid()))
        or (not g.is_all and g.auto_role is null and exists (
              select 1 from public.roster_people rp
              where rp.group_id = g.id and rp.user_id = auth.uid()))
      )
  );
$$;
revoke all on function public.can_access_chat_group(uuid) from public;
grant execute on function public.can_access_chat_group(uuid) to authenticated;

-- Shared membership predicate, expressed inline in each function below:
--   manager
--   OR (All Leaders  AND you're on the roster)
--   OR (auto group   AND you hold that role)
--   OR (normal group AND you're assigned to it)

drop function if exists public.my_chat_groups(uuid);
create or replace function public.my_chat_groups(p_org uuid)
returns table (group_id uuid, name text, parent_id uuid, parent_name text, sort int, unread int)
language plpgsql security definer set search_path = public as $$
declare v_mgr boolean;
begin
  if auth.uid() is null then return; end if;
  v_mgr := public.has_org_role(p_org, array['owner','admin','editor']);
  return query
  select g.id, g.name, g.parent_id, pg.name, g.sort,
    case
      when exists (select 1 from public.chat_mutes cm where cm.group_id = g.id and cm.user_id = auth.uid()) then 0
      when (
        v_mgr
        or (g.is_all and exists (select 1 from public.roster_people rp where rp.org_id = p_org and rp.user_id = auth.uid()))
        or (not g.is_all and g.auto_role is null and exists (select 1 from public.roster_people rp where rp.group_id = g.id and rp.user_id = auth.uid()))
        or (not g.is_all and g.auto_role is not null and exists (select 1 from public.roster_people rp where rp.org_id = p_org and rp.role = g.auto_role and rp.user_id = auth.uid()))
      ) then (
        select count(*)::int from public.chat_messages m
         where m.group_id = g.id and m.user_id <> auth.uid()
           and m.created_at > coalesce(
             (select r.last_read_at from public.chat_reads r where r.group_id = g.id and r.user_id = auth.uid()),
             'epoch'::timestamptz))
      else 0 end
  from public.roster_groups g
  left join public.roster_groups pg on pg.id = g.parent_id
  where g.org_id = p_org
    and (
      v_mgr
      or (g.is_all and exists (select 1 from public.roster_people rp where rp.org_id = p_org and rp.user_id = auth.uid()))
      or (not g.is_all and g.auto_role is null and exists (select 1 from public.roster_people rp where rp.group_id = g.id and rp.user_id = auth.uid()))
      or (not g.is_all and g.auto_role is not null and exists (select 1 from public.roster_people rp where rp.org_id = p_org and rp.role = g.auto_role and rp.user_id = auth.uid()))
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
        or (g.is_all and exists (select 1 from public.roster_people rp where rp.org_id = p_org and rp.user_id = auth.uid()))
        or (not g.is_all and g.auto_role is null and exists (select 1 from public.roster_people rp where rp.group_id = g.id and rp.user_id = auth.uid()))
        or (not g.is_all and g.auto_role is not null and exists (select 1 from public.roster_people rp where rp.org_id = p_org and rp.role = g.auto_role and rp.user_id = auth.uid()))
      )
      and not exists (select 1 from public.chat_mutes cm where cm.group_id = g.id and cm.user_id = auth.uid())
  ) x;
  return v_total;
end;
$$;
revoke all on function public.my_chat_unread_total(uuid) from public;
grant execute on function public.my_chat_unread_total(uuid) to authenticated;

create or replace function public.chat_unread_total_for(p_org uuid, p_user uuid)
returns int language plpgsql security definer set search_path = public as $$
declare v_mgr boolean; v_total int;
begin
  v_mgr := exists (select 1 from public.memberships mm where mm.org_id = p_org and mm.user_id = p_user and mm.role in ('owner','admin','editor'));
  select coalesce(sum(x.unread), 0)::int into v_total from (
    select (select count(*) from public.chat_messages m
       where m.group_id = g.id and m.user_id <> p_user
         and m.created_at > coalesce(
           (select r.last_read_at from public.chat_reads r where r.group_id = g.id and r.user_id = p_user),
           'epoch'::timestamptz)) as unread
    from public.roster_groups g
    where g.org_id = p_org
      and (
        v_mgr
        or (g.is_all and exists (select 1 from public.roster_people rp where rp.org_id = p_org and rp.user_id = p_user))
        or (not g.is_all and g.auto_role is null and exists (select 1 from public.roster_people rp where rp.group_id = g.id and rp.user_id = p_user))
        or (not g.is_all and g.auto_role is not null and exists (select 1 from public.roster_people rp where rp.org_id = p_org and rp.role = g.auto_role and rp.user_id = p_user))
      )
      and not exists (select 1 from public.chat_mutes cm where cm.group_id = g.id and cm.user_id = p_user)
  ) x;
  return v_total;
end;
$$;
revoke all on function public.chat_unread_total_for(uuid, uuid) from public;
grant execute on function public.chat_unread_total_for(uuid, uuid) to service_role;

-- Seed an "All Leaders" channel into every existing workspace (idempotent).
-- sort = -1 so it sits at the top of the channel list.
insert into public.roster_groups (org_id, name, sort, is_all)
select o.id, 'All Leaders', -1, true
from public.organizations o
where not exists (select 1 from public.roster_groups g where g.org_id = o.id and g.is_all);

-- Every NEW workspace gets one too — via a trigger so it covers all creation
-- paths (blank create, templates, duplicate) without editing each function.
create or replace function public.ensure_all_leaders_group()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.roster_groups (org_id, name, sort, is_all)
  values (new.id, 'All Leaders', -1, true);
  return new;
end;
$$;
drop trigger if exists ensure_all_leaders on public.organizations;
create trigger ensure_all_leaders after insert on public.organizations
  for each row execute function public.ensure_all_leaders_group();

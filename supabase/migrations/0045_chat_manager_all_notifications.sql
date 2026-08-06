-- ===========================================================================
-- Team Hub Platform — 0045 managers get all-channel notifications (mute-aware)
--
-- Managers (owner/admin/editor) are notified/badged for EVERY group & subgroup,
-- so they can keep an eye on all chats. Everyone else is scoped to the chats
-- they're a member of. The per-channel mute (bell) is each person's off switch:
-- a muted group produces no push, no icon badge, and no unread dot for them —
-- for managers and members alike.
-- ===========================================================================

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
        or (g.auto_role is null and exists (select 1 from public.roster_people rp where rp.group_id = g.id and rp.user_id = auth.uid()))
        or (g.auto_role is not null and exists (select 1 from public.roster_people rp where rp.org_id = p_org and rp.role = g.auto_role and rp.user_id = auth.uid()))
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
      and not exists (select 1 from public.chat_mutes cm where cm.group_id = g.id and cm.user_id = auth.uid())
  ) x;
  return v_total;
end;
$$;
revoke all on function public.my_chat_unread_total(uuid) from public;
grant execute on function public.my_chat_unread_total(uuid) to authenticated;

-- Per-user total (server-only; for the push badge). Managers → all groups;
-- others → member groups; muted groups excluded either way.
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
        or (g.auto_role is null and exists (select 1 from public.roster_people rp where rp.group_id = g.id and rp.user_id = p_user))
        or (g.auto_role is not null and exists (select 1 from public.roster_people rp where rp.org_id = p_org and rp.role = g.auto_role and rp.user_id = p_user))
      )
      and not exists (select 1 from public.chat_mutes cm where cm.group_id = g.id and cm.user_id = p_user)
  ) x;
  return v_total;
end;
$$;
revoke all on function public.chat_unread_total_for(uuid, uuid) from public;
grant execute on function public.chat_unread_total_for(uuid, uuid) to service_role;

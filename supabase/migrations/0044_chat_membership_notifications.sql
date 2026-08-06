-- ===========================================================================
-- Team Hub Platform — 0044 chat: membership-based unread + badge helper
--
-- Standard messaging behavior: you're badged/notified for the chats you're a
-- MEMBER of — not every channel. Previously managers accrued unread for ALL
-- channels (so they saw the red dot everywhere but only got a push for groups
-- they were assigned to — a mismatch). Now unread is counted only for groups a
-- person is a member of (assigned to a normal group, or holding the role of an
-- auto group like Coaches), for everyone including managers. Managers can still
-- OPEN any channel (my_chat_groups still lists them all as tabs) — they just
-- aren't badged/notified for chats they're not in.
--
-- Also adds chat_unread_total_for(org, user) so the push function can put each
-- recipient's real unread number on their Home Screen app icon.
-- ===========================================================================

-- Channels list: managers still see all as tabs; unread only counts for the
-- ones the caller is actually a member of.
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
    case when (
      (g.auto_role is null and exists (select 1 from public.roster_people rp where rp.group_id = g.id and rp.user_id = auth.uid()))
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

-- Total unread for the badge — member groups only (for everyone, incl. managers).
create or replace function public.my_chat_unread_total(p_org uuid)
returns int language plpgsql security definer set search_path = public as $$
declare v_total int;
begin
  if auth.uid() is null then return 0; end if;
  select coalesce(sum(x.unread), 0)::int into v_total from (
    select (select count(*) from public.chat_messages m
       where m.group_id = g.id and m.user_id <> auth.uid()
         and m.created_at > coalesce(
           (select r.last_read_at from public.chat_reads r where r.group_id = g.id and r.user_id = auth.uid()),
           'epoch'::timestamptz)) as unread
    from public.roster_groups g
    where g.org_id = p_org
      and (
        (g.auto_role is null and exists (select 1 from public.roster_people rp where rp.group_id = g.id and rp.user_id = auth.uid()))
        or (g.auto_role is not null and exists (select 1 from public.roster_people rp where rp.org_id = p_org and rp.role = g.auto_role and rp.user_id = auth.uid()))
      )
  ) x;
  return v_total;
end;
$$;
revoke all on function public.my_chat_unread_total(uuid) from public;
grant execute on function public.my_chat_unread_total(uuid) to authenticated;

-- Same total, computed for a GIVEN user (server-only; used by the push
-- function to set each recipient's app-icon badge number).
create or replace function public.chat_unread_total_for(p_org uuid, p_user uuid)
returns int language plpgsql security definer set search_path = public as $$
declare v_total int;
begin
  select coalesce(sum(x.unread), 0)::int into v_total from (
    select (select count(*) from public.chat_messages m
       where m.group_id = g.id and m.user_id <> p_user
         and m.created_at > coalesce(
           (select r.last_read_at from public.chat_reads r where r.group_id = g.id and r.user_id = p_user),
           'epoch'::timestamptz)) as unread
    from public.roster_groups g
    where g.org_id = p_org
      and (
        (g.auto_role is null and exists (select 1 from public.roster_people rp where rp.group_id = g.id and rp.user_id = p_user))
        or (g.auto_role is not null and exists (select 1 from public.roster_people rp where rp.org_id = p_org and rp.role = g.auto_role and rp.user_id = p_user))
      )
  ) x;
  return v_total;
end;
$$;
revoke all on function public.chat_unread_total_for(uuid, uuid) from public;
grant execute on function public.chat_unread_total_for(uuid, uuid) to service_role;

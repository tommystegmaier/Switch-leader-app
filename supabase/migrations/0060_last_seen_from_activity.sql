-- ===========================================================================
-- Team Hub Platform — 0060 derive "last opened" from real activity too
--
-- last_seen_at only starts filling in once someone opens the app AFTER 0059
-- shipped, so leaders who are clearly active (they just posted in a group
-- chat) still showed "never". That's accurate but useless.
--
-- Fix: report the most recent of everything that can only happen while the app
-- is open —
--   • memberships.last_seen_at   (the explicit heartbeat)
--   • their newest chat message  (you must be in the app to post)
--   • their newest chat read     (stamped when a channel is viewed)
-- so the column is meaningful immediately, using history we already store.
-- ===========================================================================

drop function if exists public.list_org_members(uuid);
create or replace function public.list_org_members(p_org uuid)
returns table (user_id uuid, email text, name text, role text, created_at timestamptz, birthday text, phone text, last_seen_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_org_role(p_org, array['owner','admin']) then
    raise exception 'only an owner or admin can view members';
  end if;
  return query
  select
    m.user_id,
    u.email::text,
    nullif(trim(coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', '')), '') as name,
    m.role,
    m.created_at,
    nullif(trim(coalesce(u.raw_user_meta_data->>'birthday', '')), '') as birthday,
    nullif(trim(coalesce(u.raw_user_meta_data->>'phone', '')), '') as phone,
    greatest(
      m.last_seen_at,
      (select max(cm.created_at)   from public.chat_messages cm where cm.org_id = p_org and cm.user_id = m.user_id),
      (select max(cr.last_read_at) from public.chat_reads    cr where cr.org_id = p_org and cr.user_id = m.user_id)
    ) as last_seen_at
  from public.memberships m
  join auth.users u on u.id = m.user_id
  where m.org_id = p_org
  order by
    case m.role when 'owner' then 0 when 'admin' then 1 when 'editor' then 2 else 3 end,
    m.created_at;
end;
$$;
revoke all on function public.list_org_members(uuid) from public;
grant execute on function public.list_org_members(uuid) to authenticated;

-- ===========================================================================
-- Team Hub Platform — 0059 track when each member last opened the app
--
-- Team & Access can show notifications on/off, but not whether someone is
-- actually using the app. This records a per-membership last_seen_at that the
-- app stamps when it opens, so a manager can spot leaders who haven't been in
-- for weeks.
--
-- Privacy note: this is deliberately coarse — one timestamp per workspace, not
-- a page-by-page activity log — and it's readable only by owners/admins
-- through list_org_members, which is already manager-gated.
-- ===========================================================================

alter table public.memberships add column if not exists last_seen_at timestamptz;

-- Called by the app when a workspace is opened. Only ever writes the caller's
-- own row, so it can't be used to forge anyone else's activity. Throttled to
-- once an hour so normal navigation doesn't hammer the table.
create or replace function public.touch_last_seen(p_org uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  update public.memberships
     set last_seen_at = now()
   where org_id = p_org
     and user_id = auth.uid()
     and (last_seen_at is null or last_seen_at < now() - interval '1 hour');
end;
$$;
revoke all on function public.touch_last_seen(uuid) from public;
grant execute on function public.touch_last_seen(uuid) to authenticated;

-- Surface it to the manager-only member list.
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
    m.last_seen_at
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

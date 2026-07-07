-- ===========================================================================
-- Team Hub Platform — 0010 team access management
--
-- Lets an owner/admin see and manage who can edit a workspace. Member emails
-- live in auth.users (not readable under RLS), so listing them needs a
-- SECURITY DEFINER RPC. Role changes and removals also go through RPCs so we
-- can guard the "never remove/demote the last owner" rule (which would lock
-- everyone out of the workspace).
-- ===========================================================================

-- List members of a workspace with their email + role (owner/admin only).
create or replace function public.list_org_members(p_org uuid)
returns table (user_id uuid, email text, role text, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_org_role(p_org, array['owner','admin']) then
    raise exception 'only an owner or admin can view members';
  end if;

  return query
  select m.user_id, u.email::text, m.role, m.created_at
  from public.memberships m
  join auth.users u on u.id = m.user_id
  where m.org_id = p_org
  order by
    case m.role when 'owner' then 0 when 'admin' then 1 when 'editor' then 2 else 3 end,
    m.created_at;
end;
$$;

-- Change a member's role (owner/admin only). Cannot demote the last owner.
create or replace function public.set_member_role(p_org uuid, p_user uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_count int;
  v_current text;
begin
  if not public.has_org_role(p_org, array['owner','admin']) then
    raise exception 'only an owner or admin can change roles';
  end if;
  if p_role not in ('owner','admin','editor','viewer') then
    raise exception 'invalid role';
  end if;

  select role into v_current from public.memberships
  where org_id = p_org and user_id = p_user;
  if v_current is null then
    raise exception 'that person is not a member of this workspace';
  end if;

  -- Don't allow removing the workspace's last owner.
  if v_current = 'owner' and p_role <> 'owner' then
    select count(*) into v_owner_count from public.memberships
    where org_id = p_org and role = 'owner';
    if v_owner_count <= 1 then
      raise exception 'a workspace must always have at least one owner';
    end if;
  end if;

  update public.memberships set role = p_role
  where org_id = p_org and user_id = p_user;
end;
$$;

-- Remove a member (owner/admin only). Cannot remove the last owner.
create or replace function public.remove_member(p_org uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_count int;
  v_current text;
begin
  if not public.has_org_role(p_org, array['owner','admin']) then
    raise exception 'only an owner or admin can remove members';
  end if;

  select role into v_current from public.memberships
  where org_id = p_org and user_id = p_user;
  if v_current is null then
    return; -- already gone
  end if;

  if v_current = 'owner' then
    select count(*) into v_owner_count from public.memberships
    where org_id = p_org and role = 'owner';
    if v_owner_count <= 1 then
      raise exception 'a workspace must always have at least one owner';
    end if;
  end if;

  delete from public.memberships where org_id = p_org and user_id = p_user;
end;
$$;

revoke all on function public.list_org_members(uuid) from public;
revoke all on function public.set_member_role(uuid, uuid, text) from public;
revoke all on function public.remove_member(uuid, uuid) from public;
grant execute on function public.list_org_members(uuid) to authenticated;
grant execute on function public.set_member_role(uuid, uuid, text) to authenticated;
grant execute on function public.remove_member(uuid, uuid) to authenticated;

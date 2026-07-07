-- ===========================================================================
-- Team Hub Platform — 0012 include member names
--
-- list_org_members now also returns each person's name (from the display name
-- they entered at sign-up, stored in auth.users.raw_user_meta_data.full_name).
-- Falls back to null when someone signed up before names were collected; the
-- UI shows their email in that case.
-- ===========================================================================

-- Adding the `name` column changes the return type, which CREATE OR REPLACE
-- can't do — drop the old definition first.
drop function if exists public.list_org_members(uuid);

create or replace function public.list_org_members(p_org uuid)
returns table (user_id uuid, email text, name text, role text, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
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
    m.created_at
  from public.memberships m
  join auth.users u on u.id = m.user_id
  where m.org_id = p_org
  order by
    case m.role when 'owner' then 0 when 'admin' then 1 when 'editor' then 2 else 3 end,
    m.created_at;
end;
$$;

-- DROP removed the old grant; restore it.
revoke all on function public.list_org_members(uuid) from public;
grant execute on function public.list_org_members(uuid) to authenticated;

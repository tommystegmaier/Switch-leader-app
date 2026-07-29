-- ===========================================================================
-- Team Hub Platform — 0029 Admins can edit a member's account details
--
-- People enter their name/birthday/phone at sign-up; sometimes they get it
-- wrong. This lets an owner/admin fix a member's details from Settings →
-- People with access. Account details live in auth.users (which clients can't
-- write directly), so a SECURITY DEFINER function does it after checking the
-- caller is an owner/admin of an org the target actually belongs to.
--
-- Email is intentionally NOT editable here — it's the login identity and
-- changing it can lock someone out; that stays a self-service change.
-- ===========================================================================

-- Return birthday + phone too, so the Settings editor can prefill them.
drop function if exists public.list_org_members(uuid);

create or replace function public.list_org_members(p_org uuid)
returns table (user_id uuid, email text, name text, role text, created_at timestamptz, birthday text, phone text)
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
    nullif(trim(coalesce(u.raw_user_meta_data->>'phone', '')), '') as phone
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

-- Owner/admin edits a member's name / birthday / phone.
create or replace function public.admin_update_member(p_org uuid, p_user uuid, p_name text, p_birthday text, p_phone text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_org_role(p_org, array['owner','admin']) then
    raise exception 'only an owner or admin can edit members';
  end if;
  if not exists (select 1 from public.memberships m where m.org_id = p_org and m.user_id = p_user) then
    raise exception 'that person is not a member of this app';
  end if;
  update auth.users
    set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
        'full_name', nullif(trim(coalesce(p_name, '')), ''),
        'birthday',  nullif(trim(coalesce(p_birthday, '')), ''),
        'phone',     nullif(trim(coalesce(p_phone, '')), '')
      )
    where id = p_user;
end;
$$;

revoke all on function public.admin_update_member(uuid, uuid, text, text, text) from public;
grant execute on function public.admin_update_member(uuid, uuid, text, text, text) to authenticated;

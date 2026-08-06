-- ===========================================================================
-- Team Hub Platform — 0053 manage platform admins from the command center
--
-- Let an existing platform admin list, add, and remove other platform admins
-- (by email) without touching SQL. Still fully gated by is_platform_admin().
-- You can't remove yourself (avoids locking the platform out of admins).
-- ===========================================================================

create or replace function public.platform_list_admins()
returns table (user_id uuid, email text)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'not authorized'; end if;
  return query
  select pa.user_id, u.email
  from public.platform_admins pa
  join auth.users u on u.id = pa.user_id
  order by u.email;
end;
$$;
revoke all on function public.platform_list_admins() from public;
grant execute on function public.platform_list_admins() to authenticated;

-- Add by email — the person must already have an account.
create or replace function public.platform_add_admin(p_email text)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid;
begin
  if not public.is_platform_admin() then raise exception 'not authorized'; end if;
  select id into v_uid from auth.users where lower(email) = lower(trim(p_email)) limit 1;
  if v_uid is null then
    raise exception 'No account found for %. They need to sign up / accept an invite first.', p_email;
  end if;
  insert into public.platform_admins (user_id) values (v_uid) on conflict do nothing;
end;
$$;
revoke all on function public.platform_add_admin(text) from public;
grant execute on function public.platform_add_admin(text) to authenticated;

create or replace function public.platform_remove_admin(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'not authorized'; end if;
  if p_user = auth.uid() then raise exception 'You can’t remove yourself as a platform admin.'; end if;
  delete from public.platform_admins where user_id = p_user;
end;
$$;
revoke all on function public.platform_remove_admin(uuid) from public;
grant execute on function public.platform_remove_admin(uuid) to authenticated;

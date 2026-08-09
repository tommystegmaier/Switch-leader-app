-- ===========================================================================
-- Team Hub Platform — 0056 fix platform_list_admins return type
--
-- platform_list_admins failed with:
--   "structure of query does not match function result type — Returned type
--    character varying(255) does not match expected type text in column 2"
--
-- auth.users.email is varchar(255), but the function declares `email text`.
-- Postgres requires an exact type match on RETURN QUERY, so the call errored
-- and the command center's admin list wouldn't load (no Remove buttons).
-- Casting to text fixes it. (platform_list_apps was unaffected because it
-- passes emails through jsonb_build_object, which isn't type-checked this way.)
-- ===========================================================================

create or replace function public.platform_list_admins()
returns table (user_id uuid, email text)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'not authorized'; end if;
  return query
  select pa.user_id, u.email::text
  from public.platform_admins pa
  join auth.users u on u.id = pa.user_id
  order by u.email;
end;
$$;
revoke all on function public.platform_list_admins() from public;
grant execute on function public.platform_list_admins() to authenticated;

-- ===========================================================================
-- Team Hub Platform — 0065 return each app's logo to the command center
--
-- The command center is getting a branded header, and the brand mark it should
-- show is the one already uploaded on the apps themselves — there's no separate
-- platform logo, and inventing a second place to set one would only let the two
-- drift apart. So platform_list_apps now reports each app's icon and logo, and
-- the page picks the first it finds.
--
-- Dropped before recreating: adding columns to the returned table changes the
-- function's return type, which CREATE OR REPLACE refuses (42P13) — the same
-- thing that bit 0061.
-- ===========================================================================

drop function if exists public.platform_list_apps();
create or replace function public.platform_list_apps()
returns table (
  org_id uuid, name text, slug text, app_name text, created_at timestamptz,
  member_count int, owners jsonb, chat_media_enabled boolean,
  icon_url text, logo_url text
)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'not authorized'; end if;
  return query
  select
    o.id, o.name, o.slug,
    coalesce(nullif(s.app_name, ''), o.name),
    o.created_at,
    (select count(*)::int from public.memberships m where m.org_id = o.id),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', u.id,
        'email', u.email,
        'banned', (u.banned_until is not null and u.banned_until > now())
      ) order by u.email)
      from public.memberships mo
      join auth.users u on u.id = mo.user_id
      where mo.org_id = o.id and mo.role = 'owner'
    ), '[]'::jsonb),
    coalesce(o.chat_media_enabled, true),
    s.icon_url::text,
    s.logo_url::text
  from public.organizations o
  left join public.app_settings s on s.org_id = o.id
  order by o.created_at desc;
end;
$$;
revoke all on function public.platform_list_apps() from public;
grant execute on function public.platform_list_apps() to authenticated;

-- ===========================================================================
-- Team Hub Platform — 0052 platform command center (super-admin)
--
-- A highest-level owner of the WHOLE platform (distinct from the per-app
-- "owner" role). Platform admins can see every app, who created it, open any
-- app to troubleshoot, delete apps, and disable accounts. Everything is gated
-- by the platform_admins allowlist and enforced in SECURITY DEFINER functions,
-- so a normal user can never call these.
-- ===========================================================================

create table if not exists public.platform_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;
-- No policies on purpose: only the SECURITY DEFINER functions below (and the
-- service role) ever read this table.

-- Seed the platform owner by email (safe to re-run).
insert into public.platform_admins (user_id)
select id from auth.users where lower(email) = lower('tommy.stegmaier@life.church')
on conflict do nothing;

create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid());
$$;
revoke all on function public.is_platform_admin() from public;
grant execute on function public.is_platform_admin() to authenticated;

-- Every app: name, link, when it was made, member count, and its owners
-- (email + whether that account is currently disabled/banned).
create or replace function public.platform_list_apps()
returns table (
  org_id uuid, name text, slug text, app_name text, created_at timestamptz,
  member_count int, owners jsonb
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
    ), '[]'::jsonb)
  from public.organizations o
  left join public.app_settings s on s.org_id = o.id
  order by o.created_at desc;
end;
$$;
revoke all on function public.platform_list_apps() from public;
grant execute on function public.platform_list_apps() to authenticated;

-- Permanently delete any app (and everything in it, via cascades).
create or replace function public.platform_delete_app(p_org uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'not authorized'; end if;
  delete from public.organizations where id = p_org;
end;
$$;
revoke all on function public.platform_delete_app(uuid) from public;
grant execute on function public.platform_delete_app(uuid) to authenticated;

-- Add the platform admin to an app as owner so they can open it and
-- troubleshoot exactly what its people see. Returns the app's slug.
create or replace function public.platform_join_app(p_org uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_slug text;
begin
  if not public.is_platform_admin() then raise exception 'not authorized'; end if;
  insert into public.memberships (user_id, org_id, role)
  values (auth.uid(), p_org, 'owner')
  on conflict (user_id, org_id) do update set role = 'owner';
  select slug into v_slug from public.organizations where id = p_org;
  return v_slug;
end;
$$;
revoke all on function public.platform_join_app(uuid) from public;
grant execute on function public.platform_join_app(uuid) to authenticated;

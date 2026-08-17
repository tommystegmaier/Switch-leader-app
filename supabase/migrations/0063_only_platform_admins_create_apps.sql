-- ===========================================================================
-- Team Hub Platform — 0063 only platform admins can create apps
--
-- App creation used to be self-service: anyone signed in could spin up a new
-- workspace and become its owner. That made sense for a sign-up-and-build
-- product, but this platform is run centrally — new apps are created for a
-- location by whoever runs the platform, and everyone else is invited into an
-- app that already exists. A stray "Create an app" tap by a leader shouldn't
-- produce an orphan workspace nobody manages.
--
-- The button is hidden in the UI, but hiding a button is not a permission —
-- the RPCs are the real gate, so each creation path checks is_platform_admin()
-- here. Every path is covered:
--   create_organization            blank app
--   create_app_from_template       new app from an app marked as a template
--   create_workspace_from_template legacy built-in templates (kept for safety)
--   duplicate_workspace            "Duplicate" — a new app under another name
--
-- Duplicating is deliberately included: it produces a brand-new app just like
-- the others, so leaving it open would leave the door it was locking. Platform
-- admins keep it, in both My apps and the command center.
-- ===========================================================================

-- --- blank app -------------------------------------------------------------
create or replace function public.create_organization(p_name text, p_slug text)
returns public.organizations
language plpgsql security definer set search_path = public as $$
declare
  v_org public.organizations;
begin
  if auth.uid() is null then
    raise exception 'authentication required to create a workspace';
  end if;
  if not public.is_platform_admin() then
    raise exception 'only platform admins can create new apps';
  end if;

  insert into public.organizations (name, slug)
  values (p_name, lower(p_slug))
  returning * into v_org;

  insert into public.app_settings (org_id, app_name)
  values (v_org.id, p_name);

  insert into public.memberships (user_id, org_id, role)
  values (auth.uid(), v_org.id, 'owner');

  return v_org;
end;
$$;
revoke all on function public.create_organization(text, text) from public;
grant execute on function public.create_organization(text, text) to authenticated;

-- --- new app from an app marked as a template ------------------------------
create or replace function public.create_app_from_template(p_template uuid, p_name text, p_slug text)
returns text language plpgsql security definer set search_path = public as $$
declare v_src uuid;
begin
  if auth.uid() is null then raise exception 'sign in to create an app'; end if;
  if not public.is_platform_admin() then
    raise exception 'only platform admins can create new apps';
  end if;
  select org_id into v_src from public.app_templates where id = p_template;
  if v_src is null then raise exception 'that template is no longer available'; end if;
  perform public.clone_org_structure(v_src, auth.uid(), p_name, p_slug);
  return lower(p_slug);
end;
$$;
revoke all on function public.create_app_from_template(uuid, text, text) from public;
grant execute on function public.create_app_from_template(uuid, text, text) to authenticated;

-- --- duplicate an existing app into a new one ------------------------------
create or replace function public.duplicate_workspace(p_org uuid, p_name text, p_slug text)
returns text language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'sign in to duplicate an app'; end if;
  if not public.is_platform_admin() then
    raise exception 'only platform admins can create new apps';
  end if;
  perform public.clone_org_structure(p_org, auth.uid(), p_name, p_slug);
  return lower(p_slug);
end;
$$;
revoke all on function public.duplicate_workspace(uuid, text, text) from public;
grant execute on function public.duplicate_workspace(uuid, text, text) to authenticated;

-- --- legacy built-in templates (no longer reachable from the UI) -----------
-- Superseded by create_app_from_template, but still granted to authenticated,
-- so it gets the same gate rather than being left as an unguarded back door.
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'create_workspace_from_template'
  ) then
    execute 'revoke all on function public.create_workspace_from_template(text, text, jsonb, jsonb) from public, authenticated';
  end if;
end;
$$;

-- ===========================================================================
-- Team Hub Platform — 0057 real apps as templates
--
-- Replaces the hard-coded starter templates with real apps: a platform admin
-- marks any existing app as a template, and anyone creating a new app can start
-- from it. A template is just a POINTER to a source app, so it always reflects
-- that app's current structure — no snapshot to keep in sync.
--
-- Creating from a template reuses the same cloning logic as Duplicate, which
-- copies STRUCTURE ONLY: settings/theme, pages, sections, blocks, schedule
-- teams & roles, and chat channels. No people carry over — no memberships
-- (except the creator, who becomes owner), no roster, invites, messages, form
-- responses, or push subscriptions.
-- ===========================================================================

create table if not exists public.app_templates (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  name       text not null,
  tagline    text,
  icon       text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (org_id)
);
alter table public.app_templates enable row level security;
-- Reads go through the functions below (SECURITY DEFINER); no direct policies.

-- --- shared cloning core ---------------------------------------------------
-- One implementation used by BOTH duplicate_workspace and create_app_from_
-- template, so the two can never drift apart. Copies structure only; p_owner
-- becomes the new app's sole owner. Assumes the CALLER already authorized.
create or replace function public.clone_org_structure(
  p_src uuid, p_owner uuid, p_name text, p_slug text
)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_new uuid;
begin
  insert into public.organizations (name, slug) values (trim(p_name), lower(p_slug)) returning id into v_new;
  insert into public.memberships (user_id, org_id, role) values (p_owner, v_new, 'owner');

  -- Settings copy, but the NAME is the new one the person typed.
  insert into public.app_settings (org_id, app_name, logo_url, icon_url, theme, font_family, splash, nav_style, viewer_access, tabs)
  select v_new, trim(p_name), logo_url, icon_url, theme, font_family, splash, nav_style, viewer_access, tabs
  from public.app_settings where org_id = p_src;
  insert into public.app_settings (org_id, app_name)
  select v_new, trim(p_name)
  where not exists (select 1 from public.app_settings where org_id = v_new);

  create temp table _pm (old_id uuid, new_id uuid) on commit drop;
  create temp table _sm (old_id uuid, new_id uuid) on commit drop;
  create temp table _tm (old_id uuid, new_id uuid) on commit drop;
  insert into _pm select id, gen_random_uuid() from public.pages where org_id = p_src;
  insert into _sm select id, gen_random_uuid() from public.sections where org_id = p_src;
  insert into _tm select id, gen_random_uuid() from public.schedule_teams where org_id = p_src;

  insert into public.pages (id, org_id, name, icon, slug, sort_order, is_published, visibility)
  select pm.new_id, v_new, p.name, p.icon, p.slug, p.sort_order, p.is_published, p.visibility
  from public.pages p join _pm pm on pm.old_id = p.id;

  insert into public.sections (id, org_id, page_id, title, sort_order, collapsible)
  select sm.new_id, v_new, pm.new_id, s.title, s.sort_order, s.collapsible
  from public.sections s join _sm sm on sm.old_id = s.id join _pm pm on pm.old_id = s.page_id;

  insert into public.blocks (id, org_id, page_id, section_id, type, sort_order, props, visibility)
  select gen_random_uuid(), v_new, pm.new_id, sm.new_id, b.type, b.sort_order, b.props, b.visibility
  from public.blocks b
  join _pm pm on pm.old_id = b.page_id
  left join _sm sm on sm.old_id = b.section_id;

  insert into public.schedule_teams (id, org_id, name, sort)
  select tm.new_id, v_new, t.name, t.sort
  from public.schedule_teams t join _tm tm on tm.old_id = t.id;

  insert into public.schedule_roles (id, org_id, team_id, name, sort)
  select gen_random_uuid(), v_new, tm.new_id, r.name, r.sort
  from public.schedule_roles r join _tm tm on tm.old_id = r.team_id;

  insert into public.schedule_config (org_id, serve_weekday, notify_title, notify_message)
  select v_new, serve_weekday, notify_title, notify_message from public.schedule_config where org_id = p_src;

  -- Chat channels (empty). All Leaders comes from the 0049 trigger.
  insert into public.roster_groups (org_id, name, sort, auto_role, is_all, post_policy)
  select v_new, g.name, g.sort, g.auto_role, false, coalesce(g.post_policy, 'all')
  from public.roster_groups g
  where g.org_id = p_src and coalesce(g.is_all, false) = false and g.parent_id is null;

  insert into public.published_content (org_id, settings, pages, blocks, published_at)
  values (
    v_new,
    (select to_jsonb(s) from public.app_settings s where s.org_id = v_new),
    coalesce((select jsonb_agg(to_jsonb(p) order by p.sort_order) from public.pages p where p.org_id = v_new and p.is_published), '[]'::jsonb),
    coalesce((select jsonb_agg(to_jsonb(b) order by b.sort_order) from public.blocks b
              where b.org_id = v_new and b.page_id in (select id from public.pages where org_id = v_new and is_published)), '[]'::jsonb),
    now()
  );
  return v_new;
end;
$$;
revoke all on function public.clone_org_structure(uuid, uuid, text, text) from public;
-- Not granted to anyone: only called by the authorized wrappers below.

-- --- duplicate (owner/admin of that app, or a platform admin) ---------------
create or replace function public.duplicate_workspace(p_org uuid, p_name text, p_slug text)
returns text language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'sign in to duplicate an app'; end if;
  if not (public.has_org_role(p_org, array['owner','admin']) or public.is_platform_admin()) then
    raise exception 'only an owner or admin can duplicate this app';
  end if;
  perform public.clone_org_structure(p_org, auth.uid(), p_name, p_slug);
  return lower(p_slug);
end;
$$;
revoke all on function public.duplicate_workspace(uuid, text, text) from public;
grant execute on function public.duplicate_workspace(uuid, text, text) to authenticated;

-- --- templates: manage (platform admins) -----------------------------------
create or replace function public.platform_add_template(p_org uuid, p_name text, p_tagline text default null, p_icon text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'not authorized'; end if;
  if length(trim(coalesce(p_name, ''))) = 0 then raise exception 'please give the template a name'; end if;
  insert into public.app_templates (org_id, name, tagline, icon, created_by)
  values (p_org, trim(p_name), nullif(trim(coalesce(p_tagline, '')), ''), nullif(trim(coalesce(p_icon, '')), ''), auth.uid())
  on conflict (org_id) do update
    set name = excluded.name, tagline = excluded.tagline, icon = excluded.icon;
end;
$$;
revoke all on function public.platform_add_template(uuid, text, text, text) from public;
grant execute on function public.platform_add_template(uuid, text, text, text) to authenticated;

create or replace function public.platform_remove_template(p_org uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'not authorized'; end if;
  delete from public.app_templates where org_id = p_org;
end;
$$;
revoke all on function public.platform_remove_template(uuid) from public;
grant execute on function public.platform_remove_template(uuid) to authenticated;

-- --- templates: list (anyone signed in, for the create-app page) -----------
create or replace function public.list_app_templates()
returns table (template_id uuid, org_id uuid, name text, tagline text, icon text)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  return query
  select t.id, t.org_id, t.name::text, t.tagline::text, t.icon::text
  from public.app_templates t
  join public.organizations o on o.id = t.org_id
  order by t.name;
end;
$$;
revoke all on function public.list_app_templates() from public;
grant execute on function public.list_app_templates() to authenticated;

-- --- create a new app from a template --------------------------------------
create or replace function public.create_app_from_template(p_template uuid, p_name text, p_slug text)
returns text language plpgsql security definer set search_path = public as $$
declare v_src uuid;
begin
  if auth.uid() is null then raise exception 'sign in to create an app'; end if;
  select org_id into v_src from public.app_templates where id = p_template;
  if v_src is null then raise exception 'that template is no longer available'; end if;
  perform public.clone_org_structure(v_src, auth.uid(), p_name, p_slug);
  return lower(p_slug);
end;
$$;
revoke all on function public.create_app_from_template(uuid, text, text) from public;
grant execute on function public.create_app_from_template(uuid, text, text) to authenticated;

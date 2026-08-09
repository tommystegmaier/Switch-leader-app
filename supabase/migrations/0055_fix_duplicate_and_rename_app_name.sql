-- ===========================================================================
-- Team Hub Platform — 0055 fix the app NAME on duplicate + rename
--
-- Two related bugs, same root cause: the name shown INSIDE an app comes from
-- app_settings.app_name (falling back to organizations.name), and neither path
-- was keeping it in sync.
--
--  1. duplicate_workspace copied app_name straight from the SOURCE app, so a
--     duplicate kept showing the original's name even though the person typed
--     a new one. Now the new name is used.
--
--  2. rename_workspace only updated organizations.name, leaving
--     app_settings.app_name (and the published snapshot viewers actually read)
--     stale — so renaming appeared to do nothing inside the app. Now it
--     updates all three, so the change is live immediately.
-- ===========================================================================

create or replace function public.duplicate_workspace(p_org uuid, p_name text, p_slug text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new uuid;
begin
  if auth.uid() is null then raise exception 'sign in to duplicate an app'; end if;
  if not (public.has_org_role(p_org, array['owner','admin']) or public.is_platform_admin()) then
    raise exception 'only an owner or admin can duplicate this app';
  end if;

  insert into public.organizations (name, slug) values (p_name, lower(p_slug)) returning id into v_new;

  -- Caller becomes the sole owner. No other people carry over.
  insert into public.memberships (user_id, org_id, role) values (auth.uid(), v_new, 'owner');

  -- App settings — everything copies EXCEPT the name, which becomes the new
  -- name the person typed (this was the bug: it used to copy the source name).
  insert into public.app_settings (org_id, app_name, logo_url, icon_url, theme, font_family, splash, nav_style, viewer_access, tabs)
  select v_new, trim(p_name), logo_url, icon_url, theme, font_family, splash, nav_style, viewer_access, tabs
  from public.app_settings where org_id = p_org;

  -- If the source had no settings row, still give the copy one with its name.
  insert into public.app_settings (org_id, app_name)
  select v_new, trim(p_name)
  where not exists (select 1 from public.app_settings where org_id = v_new);

  create temp table _pm (old_id uuid, new_id uuid) on commit drop;
  create temp table _sm (old_id uuid, new_id uuid) on commit drop;
  create temp table _tm (old_id uuid, new_id uuid) on commit drop;
  insert into _pm select id, gen_random_uuid() from public.pages where org_id = p_org;
  insert into _sm select id, gen_random_uuid() from public.sections where org_id = p_org;
  insert into _tm select id, gen_random_uuid() from public.schedule_teams where org_id = p_org;

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
  select v_new, serve_weekday, notify_title, notify_message from public.schedule_config where org_id = p_org;

  -- Chat channel structure (empty groups). All Leaders comes from the 0049
  -- trigger, so skip it here to avoid a duplicate.
  insert into public.roster_groups (org_id, name, sort, auto_role, is_all, post_policy)
  select v_new, g.name, g.sort, g.auto_role, false, coalesce(g.post_policy, 'all')
  from public.roster_groups g
  where g.org_id = p_org and coalesce(g.is_all, false) = false and g.parent_id is null;

  -- Publish a snapshot so the copy is immediately viewable (picks up the new
  -- name, since app_settings was written above).
  insert into public.published_content (org_id, settings, pages, blocks, published_at)
  values (
    v_new,
    (select to_jsonb(s) from public.app_settings s where s.org_id = v_new),
    coalesce((select jsonb_agg(to_jsonb(p) order by p.sort_order) from public.pages p where p.org_id = v_new and p.is_published), '[]'::jsonb),
    coalesce((select jsonb_agg(to_jsonb(b) order by b.sort_order) from public.blocks b
              where b.org_id = v_new and b.page_id in (select id from public.pages where org_id = v_new and is_published)), '[]'::jsonb),
    now()
  );

  return lower(p_slug);
end;
$$;
revoke all on function public.duplicate_workspace(uuid, text, text) from public;
grant execute on function public.duplicate_workspace(uuid, text, text) to authenticated;

-- Renaming now also updates the name shown inside the app, and the published
-- snapshot viewers read — so it takes effect immediately without republishing.
create or replace function public.rename_workspace(p_org uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_name text;
begin
  if not (public.has_org_role(p_org, array['owner','admin']) or public.is_platform_admin()) then
    raise exception 'only an owner or admin can rename this app';
  end if;
  v_name := trim(coalesce(p_name, ''));
  if length(v_name) = 0 then
    raise exception 'please enter a name';
  end if;

  update public.organizations set name = v_name where id = p_org;
  update public.app_settings   set app_name = v_name where org_id = p_org;
  update public.published_content
     set settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{app_name}', to_jsonb(v_name), true)
   where org_id = p_org;
end;
$$;
revoke all on function public.rename_workspace(uuid, text) from public;
grant execute on function public.rename_workspace(uuid, text) to authenticated;

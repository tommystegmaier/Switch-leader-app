-- ===========================================================================
-- Team Hub Platform — 0066 set an app's logo from the command center
--
-- App identity is moving out of each app's own Settings page: the name is
-- changed from "My apps" (rename_workspace already handles it), and the logo
-- and icon are now set centrally here. One place, one look, and a location
-- lead can't quietly swap the branding on their app.
--
-- Two pieces:
--   1. platform_set_app_branding — writes the logo/icon for ANY app, without
--      the caller needing to be a member of it.
--   2. a storage policy so a platform admin can upload the image in the first
--      place; media_insert (0058) is limited to members of the owning org.
--
-- Like rename_workspace, this writes the PUBLISHED SNAPSHOT as well as the
-- live table. Viewers read published_content.settings, so updating only
-- app_settings would leave the old logo on everyone's phone until the next
-- time somebody happened to hit Publish.
-- ===========================================================================

create or replace function public.platform_set_app_branding(
  p_org uuid, p_logo_url text, p_icon_url text
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_logo text := nullif(trim(coalesce(p_logo_url, '')), '');
  v_icon text := nullif(trim(coalesce(p_icon_url, '')), '');
begin
  if not public.is_platform_admin() then raise exception 'not authorized'; end if;

  -- An app created before app_settings existed would have no row to update.
  insert into public.app_settings (org_id, app_name)
  select p_org, o.name from public.organizations o where o.id = p_org
  on conflict (org_id) do nothing;

  update public.app_settings
     set logo_url = v_logo, icon_url = v_icon
   where org_id = p_org;

  -- to_jsonb(null::text) is a JSON null, which is what "no logo" should look
  -- like in the snapshot — the reader coalesces it away.
  update public.published_content
     set settings = jsonb_set(
           jsonb_set(coalesce(settings, '{}'::jsonb), '{logo_url}', to_jsonb(v_logo), true),
           '{icon_url}', to_jsonb(v_icon), true)
   where org_id = p_org;
end;
$$;
revoke all on function public.platform_set_app_branding(uuid, text, text) from public;
grant execute on function public.platform_set_app_branding(uuid, text, text) to authenticated;

-- --- let a platform admin upload into any app's media folder ---------------
-- Replaces 0058's member-only insert rule with the same rule plus platform
-- admins, so the command center can upload a logo for an app its operator was
-- never a member of. Read/update/delete are untouched.
drop policy if exists media_insert on storage.objects;
create policy media_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'media'
    and (
      public.is_org_member( public.uuid_or_null((storage.foldername(name))[1]) )
      or public.is_platform_admin()
    )
  );

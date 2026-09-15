-- ===========================================================================
-- Switch Leader App — 0083 one name per app, not two
--
-- An app's name lives in two places: organizations.name, which is what My apps
-- lists and what Rename writes, and app_settings.app_name, which is what the
-- app's own header, the join page and the install prompt read.
--
-- They had drifted. Renaming only started writing both in 0055, so any app
-- renamed before that kept its old name in app_settings — My apps said "Omaha
-- Switch App" while the app itself said "Omaha Switch Leader App".
--
-- App identity was removed from Settings at the ministry's request, so
-- app_name can no longer be edited on purpose. There is therefore nothing it
-- could legitimately say that organizations.name doesn't, and the fix is to
-- make them agree.
--
-- The viewer header now prefers organizations.name outright, so it is right
-- whether or not this has run. This is for the other readers — invite_info on
-- the join page, and the install prompt — which go through app_name.
-- ===========================================================================

update public.app_settings s
   set app_name = o.name
  from public.organizations o
 where o.id = s.org_id
   and nullif(trim(coalesce(o.name, '')), '') is not null
   and coalesce(s.app_name, '') <> o.name;

-- The published snapshot carries its own copy of settings, which is what a
-- viewer actually reads. Without this the old name would survive there until
-- somebody happened to press Publish.
update public.published_content pc
   set settings = jsonb_set(coalesce(pc.settings, '{}'::jsonb),
                            '{app_name}', to_jsonb(o.name), true)
  from public.organizations o
 where o.id = pc.org_id
   and nullif(trim(coalesce(o.name, '')), '') is not null
   and coalesce(pc.settings->>'app_name', '') <> o.name;

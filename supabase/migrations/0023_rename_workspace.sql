-- ===========================================================================
-- Team Hub Platform — 0023 rename a workspace
--
-- Lets an owner/admin change a workspace's display name (shown in "My
-- workspaces"). Does not touch the app's title (app_settings.app_name) or the
-- URL slug — those are edited in the app's Settings.
-- ===========================================================================

create or replace function public.rename_workspace(p_org uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_org_role(p_org, array['owner','admin']) then
    raise exception 'only an owner or admin can rename this app';
  end if;
  if length(trim(coalesce(p_name, ''))) = 0 then
    raise exception 'please enter a name';
  end if;
  update public.organizations set name = trim(p_name) where id = p_org;
end;
$$;

revoke all on function public.rename_workspace(uuid, text) from public;
grant execute on function public.rename_workspace(uuid, text) to authenticated;

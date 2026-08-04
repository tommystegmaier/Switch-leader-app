-- ===========================================================================
-- Team Hub Platform — 0038 delete a workspace
--
-- Lets the OWNER permanently delete an app. Deleting the organizations row
-- cascades to everything it owns (settings, pages, blocks, memberships, roster,
-- schedule, chat, invites, form submissions, published snapshot, …) because
-- every content table references organizations(id) ON DELETE CASCADE.
--
-- Restricted to the owner role — admins/editors/viewers cannot delete an app.
-- ===========================================================================

create or replace function public.delete_workspace(p_org uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'sign in to delete an app';
  end if;
  if not public.has_org_role(p_org, array['owner']) then
    raise exception 'only the owner can delete this app';
  end if;

  delete from public.organizations where id = p_org;
end;
$$;

revoke all on function public.delete_workspace(uuid) from public;
grant execute on function public.delete_workspace(uuid) to authenticated;

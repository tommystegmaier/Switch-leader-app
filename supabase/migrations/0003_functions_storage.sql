-- ===========================================================================
-- Team Hub Platform — 0003 RPCs + Storage
-- ===========================================================================

-- --- safe uuid cast (used by storage policies) -----------------------------
-- Returns NULL instead of raising when text isn't a valid UUID, so a stray
-- object path can never throw inside a policy (it just fails the check).
create or replace function public.uuid_or_null(p_text text)
returns uuid
language plpgsql
immutable
as $$
begin
  return p_text::uuid;
exception when others then
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- create_organization(name, slug)
--
-- The supported path for a creator to start a brand-new EMPTY workspace.
-- Runs as SECURITY DEFINER so it can atomically create the org + its default
-- settings + the caller's owner membership in one transaction — avoiding the
-- RLS chicken-and-egg where you'd need to be a member to insert rows for an
-- org that doesn't exist yet. The caller becomes the workspace OWNER.
-- ---------------------------------------------------------------------------
create or replace function public.create_organization(p_name text, p_slug text)
returns public.organizations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org public.organizations;
begin
  if auth.uid() is null then
    raise exception 'authentication required to create a workspace';
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

-- ===========================================================================
-- Storage: the `media` bucket (images, logos, app icons, PDFs).
--
-- Objects are pathed by org_id as the FIRST folder, e.g. "{org_id}/logo.png".
-- The bucket is PRIVATE: reads follow the same public/members rule as content
-- (so an invite_only workspace's media is not world-readable by URL). The app
-- serves media via short-lived signed URLs. Writes require editor+ in that org.
-- ===========================================================================
insert into storage.buckets (id, name, public)
values ('media', 'media', false)
on conflict (id) do nothing;

-- Read: members of the owning org, or anyone if that org is public.
create policy media_read on storage.objects
  for select using (
    bucket_id = 'media'
    and (
      public.is_org_member( public.uuid_or_null((storage.foldername(name))[1]) )
      or public.org_is_public( public.uuid_or_null((storage.foldername(name))[1]) )
    )
  );

-- Write (insert/update/delete): editor and above for the owning org. Viewers
-- and anonymous users have no write path to storage.
create policy media_write on storage.objects
  for all using (
    bucket_id = 'media'
    and public.has_org_role(
      public.uuid_or_null((storage.foldername(name))[1]),
      array['owner','admin','editor']
    )
  )
  with check (
    bucket_id = 'media'
    and public.has_org_role(
      public.uuid_or_null((storage.foldername(name))[1]),
      array['owner','admin','editor']
    )
  );

-- ===========================================================================
-- Team Hub Platform — 0035 Discard unpublished changes
--
-- Restores the live/draft tables (pages, blocks, app_settings) from the last
-- published snapshot, so leaving edit mode without publishing throws away the
-- unpublished edits. Publish stays the only way to keep changes.
--
-- Safe: if the workspace has never been published (no snapshot), it does
-- nothing — it will never wipe the only copy of the content.
-- ===========================================================================

create or replace function public.discard_changes(p_org uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_snap public.published_content;
begin
  if not public.has_org_role(p_org, array['owner','admin','editor']) then
    raise exception 'only owner/admin/editor can discard changes';
  end if;

  select * into v_snap from public.published_content where org_id = p_org;
  if v_snap.org_id is null then
    return; -- never published — nothing to revert to; don't destroy the draft
  end if;

  -- Rebuild pages + blocks from the snapshot (deleting pages cascades to their
  -- blocks/sections; the snapshot preserves ids, so re-inserted blocks still
  -- point at their pages).
  delete from public.pages where org_id = p_org;
  insert into public.pages
    select * from jsonb_populate_recordset(null::public.pages, coalesce(v_snap.pages, '[]'::jsonb));
  insert into public.blocks
    select * from jsonb_populate_recordset(null::public.blocks, coalesce(v_snap.blocks, '[]'::jsonb));

  -- Restore settings (theme, name, nav tabs, etc.).
  if v_snap.settings is not null then
    update public.app_settings a set
      app_name      = s.app_name,
      logo_url      = s.logo_url,
      icon_url      = s.icon_url,
      theme         = s.theme,
      font_family   = s.font_family,
      splash        = s.splash,
      nav_style     = s.nav_style,
      viewer_access = s.viewer_access,
      tabs          = s.tabs
    from jsonb_populate_record(null::public.app_settings, v_snap.settings) s
    where a.org_id = p_org;
  end if;

  -- Mark the draft clean again (content matches the last publish).
  update public.organizations set content_touched_at = v_snap.published_at where id = p_org;
end;
$$;

revoke all on function public.discard_changes(uuid) from public;
grant execute on function public.discard_changes(uuid) to authenticated;

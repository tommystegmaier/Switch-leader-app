-- ===========================================================================
-- Team Hub Platform — 0006 draft → publish workflow
--
-- Model: editors edit the LIVE tables (pages/blocks/app_settings) = the DRAFT.
-- Viewers read a PUBLISHED SNAPSHOT (this file's `published_content`). A single
-- "Publish" action copies the current draft into the snapshot. This guarantees
-- in the DATABASE that viewers never see unpublished edits.
--
-- Changes here:
--   1. published_content snapshot table (+ public/member read policy).
--   2. organizations.content_touched_at, bumped by triggers on any content
--      write (incl. deletes) — powers the "unpublished changes" indicator.
--   3. publish_workspace() and get_publish_status() RPCs.
--   4. Tighten SELECT on pages/blocks/sections/app_settings to MEMBERS ONLY,
--      so anonymous/public viewers can read ONLY the published snapshot — never
--      live drafts. (Anonymous still resolves the org + reads the snapshot.)
-- ===========================================================================

-- 1. Snapshot table -------------------------------------------------------
create table if not exists public.published_content (
  org_id       uuid primary key references public.organizations(id) on delete cascade,
  settings     jsonb,
  pages        jsonb not null default '[]'::jsonb,
  blocks       jsonb not null default '[]'::jsonb,
  published_at timestamptz not null default now()
);

alter table public.published_content enable row level security;

-- Read: members, or anyone if the workspace is public. Writes happen ONLY via
-- the SECURITY DEFINER publish RPC (which bypasses RLS), so there is no write
-- policy here.
drop policy if exists published_content_select on public.published_content;
create policy published_content_select on public.published_content
  for select using (
    public.is_org_member(org_id) or public.org_is_public(org_id)
  );

-- Table-level grant (RLS still filters rows). Writes happen only via the
-- publish RPC, so no insert/update/delete grant is given.
grant select on public.published_content to anon, authenticated;

-- 2. Dirty tracking -------------------------------------------------------
alter table public.organizations
  add column if not exists content_touched_at timestamptz not null default now();

create or replace function public.touch_org()
returns trigger
language plpgsql
as $$
begin
  update public.organizations
     set content_touched_at = now()
   where id = coalesce(NEW.org_id, OLD.org_id);
  return null;
end;
$$;

drop trigger if exists pages_touch        on public.pages;
drop trigger if exists blocks_touch       on public.blocks;
drop trigger if exists sections_touch     on public.sections;
drop trigger if exists app_settings_touch on public.app_settings;
create trigger pages_touch        after insert or update or delete on public.pages        for each row execute function public.touch_org();
create trigger blocks_touch       after insert or update or delete on public.blocks       for each row execute function public.touch_org();
create trigger sections_touch     after insert or update or delete on public.sections     for each row execute function public.touch_org();
create trigger app_settings_touch after insert or update or delete on public.app_settings for each row execute function public.touch_org();

-- 3. Publish + status RPCs ------------------------------------------------
create or replace function public.publish_workspace(p_org uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
begin
  if not public.has_org_role(p_org, array['owner','admin','editor']) then
    raise exception 'only owner/admin/editor can publish';
  end if;

  insert into public.published_content (org_id, settings, pages, blocks, published_at)
  values (
    p_org,
    (select to_jsonb(s) from public.app_settings s where s.org_id = p_org),
    coalesce((select jsonb_agg(to_jsonb(p) order by p.sort_order)
              from public.pages p where p.org_id = p_org and p.is_published), '[]'::jsonb),
    coalesce((select jsonb_agg(to_jsonb(b) order by b.sort_order)
              from public.blocks b
              where b.org_id = p_org
                and b.page_id in (select id from public.pages where org_id = p_org and is_published)), '[]'::jsonb),
    v_now
  )
  on conflict (org_id) do update
    set settings = excluded.settings,
        pages = excluded.pages,
        blocks = excluded.blocks,
        published_at = excluded.published_at;

  return v_now;
end;
$$;

create or replace function public.get_publish_status(p_org uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_pub   timestamptz;
  v_touch timestamptz;
begin
  if not public.is_org_member(p_org) then
    raise exception 'forbidden';
  end if;
  select published_at into v_pub from public.published_content where org_id = p_org;
  select content_touched_at into v_touch from public.organizations where id = p_org;
  return jsonb_build_object(
    'publishedAt', v_pub,
    'dirty', (v_pub is null) or (v_touch > v_pub)
  );
end;
$$;

revoke all on function public.publish_workspace(uuid) from public;
revoke all on function public.get_publish_status(uuid) from public;
grant execute on function public.publish_workspace(uuid) to authenticated;
grant execute on function public.get_publish_status(uuid) to authenticated;

-- 4. Tighten live-content reads to members only --------------------------
-- Viewers/anonymous now read ONLY the published snapshot, so live drafts are
-- never exposed. (organizations + published_content keep their public read.)
drop policy if exists pages_select on public.pages;
create policy pages_select on public.pages
  for select using (public.is_org_member(org_id));

drop policy if exists blocks_select on public.blocks;
create policy blocks_select on public.blocks
  for select using (public.is_org_member(org_id));

drop policy if exists sections_select on public.sections;
create policy sections_select on public.sections
  for select using (public.is_org_member(org_id));

drop policy if exists app_settings_select on public.app_settings;
create policy app_settings_select on public.app_settings
  for select using (public.is_org_member(org_id));

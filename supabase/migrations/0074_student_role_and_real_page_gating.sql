-- ===========================================================================
-- Switch Leader App — 0074 the Student role, and page visibility that is real
--
-- Two things, together because the second is what makes the first safe.
--
-- 1. A new role, 'student'. The other four keep their stored names; only what
--    they are CALLED changes, and that lives in the app (src/lib/roles.ts).
--    Renaming 'viewer' to 'leader' for real would mean rewriting every policy
--    and function in this directory against a live app, to change a word on a
--    screen. Not worth the risk.
--
-- 2. Page and block visibility enforced HERE rather than only in the app.
--
--    Until now `visibility` was a display rule: the app hid a page marked
--    "admins only", but the database happily handed every page and block to
--    any member who asked. That was tolerable when the whole audience was
--    leaders. It is not tolerable with students in the same app — the entire
--    point of a leader-only page is that the students being discussed on it
--    cannot read it, and "the app doesn't show it to you" is not a boundary.
--
-- The published snapshot is the other half of this and is dealt with below.
-- ===========================================================================

-- --- 1. Let 'student' be stored ------------------------------------------
alter table public.memberships drop constraint if exists memberships_role_check;
alter table public.memberships add constraint memberships_role_check
  check (role in ('owner','admin','editor','viewer','student'));

alter table public.invites drop constraint if exists invites_role_check;
alter table public.invites add constraint invites_role_check
  check (role in ('owner','admin','editor','viewer','student'));

-- --- 2. Who am I here ------------------------------------------------------
create or replace function public.my_org_role(p_org uuid)
returns text language sql stable security definer set search_path = public as $$
  select m.role from public.memberships m
   where m.org_id = p_org and m.user_id = auth.uid();
$$;
revoke all on function public.my_org_role(uuid) from public;
grant execute on function public.my_org_role(uuid) to anon, authenticated;

-- --- 3. The visibility rule, evaluated in the database ---------------------
-- Mirrors isVisibleTo() in src/blocks/BlockView.tsx. The app still applies the
-- same rule so the UI doesn't show a page it can't load; this is the copy that
-- actually decides.
--
-- Split in two. The inner one is pure arithmetic on a rule and a role name and
-- touches no tables, so a caller that already knows the role — every one of
-- the snapshot functions below — can check a hundred blocks without asking who
-- it is talking to a hundred times.
create or replace function public.can_see_visibility_as(p_vis jsonb, p_role text)
returns boolean language sql immutable set search_path = public as $$
  select case
    when coalesce(p_vis->>'kind', 'everyone') = 'everyone' then true
    when p_role is null then false
    -- Anyone who can edit the app can see all of it. They are the ones building
    -- the pages; hiding a page from its author only makes it uneditable.
    when p_role in ('owner','admin','editor') then true
    when p_vis->>'kind' = 'roles' then (p_vis->'roles' ? p_role)
    -- 'admins', and anything unrecognised, falls through to false. A rule this
    -- function doesn't understand is treated as private rather than public: a
    -- typo in a rule name should cost a leader a page, not expose one to a
    -- student.
    else false
  end;
$$;

create or replace function public.can_see_visibility(p_org uuid, p_vis jsonb)
returns boolean language sql stable security definer set search_path = public as $$
  select public.can_see_visibility_as(p_vis, public.my_org_role(p_org));
$$;

revoke all on function public.can_see_visibility_as(jsonb, text) from public;
revoke all on function public.can_see_visibility(uuid, jsonb) from public;
grant execute on function public.can_see_visibility_as(jsonb, text) to anon, authenticated;
grant execute on function public.can_see_visibility(uuid, jsonb) to anon, authenticated;

-- --- 4. Apply it to the live (draft) tables --------------------------------
drop policy if exists pages_select on public.pages;
create policy pages_select on public.pages
  for select using (
    public.is_org_member(org_id) and public.can_see_visibility(org_id, visibility)
  );

drop policy if exists blocks_select on public.blocks;
create policy blocks_select on public.blocks
  for select using (
    public.is_org_member(org_id) and public.can_see_visibility(org_id, visibility)
  );

-- --- 5. The published snapshot --------------------------------------------
-- published_content is a single row holding every page and block as one blob,
-- so row-level security cannot filter inside it — a policy can only hand over
-- the whole thing or none of it. These functions return the filtered slices
-- instead, and the app reads through them.
--
-- Direct SELECT on the table is deliberately NOT revoked yet. Every phone
-- running the current build reads the table directly, and pulling that out
-- from under them mid-session would empty the app until it updated itself.
-- There are no student accounts yet, so nothing is exposed in the meantime.
-- Migration 0075, which ships with the student accounts, does the revoke once
-- every client is on a build that uses these.

create or replace function public.published_settings(p_org uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select pc.settings from public.published_content pc
   where pc.org_id = p_org
     and (public.is_org_member(p_org) or public.org_is_public(p_org));
$$;

create or replace function public.published_pages_for_me(p_org uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_role text;
begin
  if not (public.is_org_member(p_org) or public.org_is_public(p_org)) then
    return '[]'::jsonb;
  end if;
  v_role := public.my_org_role(p_org);
  return coalesce((
    select jsonb_agg(p)
      from public.published_content pc,
           lateral jsonb_array_elements(pc.pages) as p
     where pc.org_id = p_org
       and public.can_see_visibility_as(p->'visibility', v_role)
  ), '[]'::jsonb);
end;
$$;

create or replace function public.published_blocks_for_me(p_org uuid, p_page uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_role text; v_page_ok boolean;
begin
  if not (public.is_org_member(p_org) or public.org_is_public(p_org)) then
    return '[]'::jsonb;
  end if;
  v_role := public.my_org_role(p_org);

  -- A block inherits its page's fate. Checked once here rather than per block,
  -- and checked at all because a leader-only page whose blocks were left as
  -- "everyone" must not leak its contents to someone who asks for them by id.
  select exists (
    select 1 from public.published_content pc,
                  lateral jsonb_array_elements(pc.pages) as pg
     where pc.org_id = p_org
       and pg->>'id' = p_page::text
       and public.can_see_visibility_as(pg->'visibility', v_role)
  ) into v_page_ok;
  if not v_page_ok then return '[]'::jsonb; end if;

  return coalesce((
    select jsonb_agg(b)
      from public.published_content pc,
           lateral jsonb_array_elements(pc.blocks) as b
     where pc.org_id = p_org
       and b->>'page_id' = p_page::text
       and public.can_see_visibility_as(b->'visibility', v_role)
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.published_settings(uuid) from public;
revoke all on function public.published_pages_for_me(uuid) from public;
revoke all on function public.published_blocks_for_me(uuid, uuid) from public;
grant execute on function public.published_settings(uuid) to anon, authenticated;
grant execute on function public.published_pages_for_me(uuid) to anon, authenticated;
grant execute on function public.published_blocks_for_me(uuid, uuid) to anon, authenticated;

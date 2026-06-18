-- ===========================================================================
-- Team Hub Platform — 0002 Row-Level Security
--
-- This file is the heart of the security model. Two guarantees, enforced in
-- the DATABASE (not just the UI):
--
--   1. TENANT ISOLATION — a workspace can never read or write another
--      workspace's rows. Every policy checks `org_id` against the caller's
--      memberships (members) or the public flag (anonymous viewers).
--
--   2. VIEWER READ-ONLY — viewers and anonymous visitors have NO write path to
--      content. Only owner/admin/editor of a workspace can write that
--      workspace's content. This is what guarantees no viewer can affect
--      another viewer's experience.
--
-- Helper functions are SECURITY DEFINER so that, when called inside a policy,
-- they bypass RLS on the tables they read. That avoids infinite recursion
-- (e.g. a memberships policy that needs to read memberships) and keeps the
-- policies themselves simple and fast.
-- ===========================================================================

-- --- helper: is the caller a member of this workspace? ---------------------
create or replace function public.is_org_member(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships m
    where m.org_id = p_org
      and m.user_id = auth.uid()
  );
$$;

-- --- helper: does the caller hold one of these roles in this workspace? -----
create or replace function public.has_org_role(p_org uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships m
    where m.org_id = p_org
      and m.user_id = auth.uid()
      and m.role = any(p_roles)
  );
$$;

-- --- helper: is this workspace publicly viewable (anonymous reads)? ---------
create or replace function public.org_is_public(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.app_settings s
    where s.org_id = p_org
      and s.viewer_access = 'public'
  );
$$;

-- "editor and above" — the set allowed to write content.
-- Used inline as: has_org_role(org_id, array['owner','admin','editor'])

-- Lock down the helpers (callable by the app roles; logic is RLS-safe).
revoke all on function public.is_org_member(uuid) from public;
revoke all on function public.has_org_role(uuid, text[]) from public;
revoke all on function public.org_is_public(uuid) from public;
grant execute on function public.is_org_member(uuid) to anon, authenticated;
grant execute on function public.has_org_role(uuid, text[]) to anon, authenticated;
grant execute on function public.org_is_public(uuid) to anon, authenticated;

-- ===========================================================================
-- Enable RLS on every table. With RLS on and no permissive policy, access is
-- denied by default — so the policies below are strictly additive grants.
-- ===========================================================================
alter table public.organizations enable row level security;
alter table public.app_settings  enable row level security;
alter table public.memberships   enable row level security;
alter table public.pages         enable row level security;
alter table public.sections      enable row level security;
alter table public.blocks        enable row level security;
alter table public.user_state    enable row level security;
alter table public.invites       enable row level security;

-- ---------------------------------------------------------------------------
-- organizations
-- Read: members of the org, OR anyone if the org is public (so anonymous
--       viewers can resolve /o/{slug}). Write: owner/admin only.
-- ---------------------------------------------------------------------------
create policy organizations_select on public.organizations
  for select using (
    public.is_org_member(id) or public.org_is_public(id)
  );

create policy organizations_update on public.organizations
  for update using (public.has_org_role(id, array['owner','admin']))
  with check  (public.has_org_role(id, array['owner','admin']));

create policy organizations_delete on public.organizations
  for delete using (public.has_org_role(id, array['owner']));

-- Note: org creation goes through the create_organization() RPC (0003) which
-- atomically inserts the org + owner membership + default settings, so there
-- is intentionally no direct INSERT policy here.

-- ---------------------------------------------------------------------------
-- app_settings
-- Read: members OR public. Write: editor and above.
-- ---------------------------------------------------------------------------
create policy app_settings_select on public.app_settings
  for select using (
    public.is_org_member(org_id) or public.org_is_public(org_id)
  );

create policy app_settings_write on public.app_settings
  for all using (public.has_org_role(org_id, array['owner','admin','editor']))
  with check  (public.has_org_role(org_id, array['owner','admin','editor']));

-- ---------------------------------------------------------------------------
-- memberships
-- Read: members can see who else is in their workspace (needed to manage
--       roles). Write: owner/admin manage members. A user may always read
--       their own membership row (covered by is_org_member).
-- ---------------------------------------------------------------------------
create policy memberships_select on public.memberships
  for select using (public.is_org_member(org_id));

create policy memberships_write on public.memberships
  for all using (public.has_org_role(org_id, array['owner','admin']))
  with check  (public.has_org_role(org_id, array['owner','admin']));

-- ---------------------------------------------------------------------------
-- pages
-- Read: members see all pages (incl. drafts, for editing); anonymous/public
--       see only PUBLISHED pages of public workspaces.
-- Write: editor and above.
-- ---------------------------------------------------------------------------
create policy pages_select on public.pages
  for select using (
    public.is_org_member(org_id)
    or (is_published and public.org_is_public(org_id))
  );

create policy pages_write on public.pages
  for all using (public.has_org_role(org_id, array['owner','admin','editor']))
  with check  (public.has_org_role(org_id, array['owner','admin','editor']));

-- ---------------------------------------------------------------------------
-- sections — same visibility as their parent page.
-- ---------------------------------------------------------------------------
create policy sections_select on public.sections
  for select using (
    public.is_org_member(org_id)
    or (
      public.org_is_public(org_id)
      and exists (
        select 1 from public.pages p
        where p.id = sections.page_id and p.is_published
      )
    )
  );

create policy sections_write on public.sections
  for all using (public.has_org_role(org_id, array['owner','admin','editor']))
  with check  (public.has_org_role(org_id, array['owner','admin','editor']));

-- ---------------------------------------------------------------------------
-- blocks — readable when the caller is a member, or the block's page is
--          published in a public workspace. Write: editor and above.
-- ---------------------------------------------------------------------------
create policy blocks_select on public.blocks
  for select using (
    public.is_org_member(org_id)
    or (
      public.org_is_public(org_id)
      and exists (
        select 1 from public.pages p
        where p.id = blocks.page_id and p.is_published
      )
    )
  );

create policy blocks_write on public.blocks
  for all using (public.has_org_role(org_id, array['owner','admin','editor']))
  with check  (public.has_org_role(org_id, array['owner','admin','editor']));

-- ---------------------------------------------------------------------------
-- user_state — a user may read/write ONLY their own rows. Full stop.
-- This is how per-user personalization stays isolated and unshareable.
-- ---------------------------------------------------------------------------
create policy user_state_rw on public.user_state
  for all using (user_id = auth.uid())
  with check  (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- invites — managed by owner/admin of the workspace. (Redemption happens via
-- a SECURITY DEFINER RPC in a later phase so a signing-up user never needs
-- broad read access to the invites table.)
-- ---------------------------------------------------------------------------
create policy invites_admin on public.invites
  for all using (public.has_org_role(org_id, array['owner','admin']))
  with check  (public.has_org_role(org_id, array['owner','admin']));

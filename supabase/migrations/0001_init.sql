-- ===========================================================================
-- Team Hub Platform — 0001 schema
--
-- Multi-tenant content model. A WORKSPACE (organizations row) is the top-level
-- tenant; every content row carries `org_id` so tenant isolation can be
-- enforced with Row-Level Security (see 0002_rls.sql) without table joins.
--
-- UUID primary keys + timestamps everywhere. RLS is enabled in 0002; this file
-- only defines structure.
-- ===========================================================================

create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- --- updated_at helper -----------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- --- organizations (tenants) ----------------------------------------------
create table if not exists public.organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text not null unique,          -- viewer URL: /o/{slug}
  created_at timestamptz not null default now()
);

-- --- app_settings (one row per workspace) ----------------------------------
create table if not exists public.app_settings (
  org_id        uuid primary key references public.organizations(id) on delete cascade,
  app_name      text not null default 'My Team Hub',
  logo_url      text,
  icon_url      text,
  -- Generic, theme-driven defaults — NOT tied to any specific workspace brand.
  theme         jsonb not null default jsonb_build_object(
                  'background', '#ffffff',
                  'text',       '#0f1420',
                  'primary',    '#0f1420',
                  'primaryText','#ffffff',
                  'accent',     '#e23b2e',
                  'heading',    '#1c2541'
                ),
  font_family   text not null default 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  splash        jsonb not null default jsonb_build_object('background', '#0f1420', 'text', '#ffffff'),
  nav_style     text not null default 'top' check (nav_style in ('top','bottom','both')),
  viewer_access text not null default 'public' check (viewer_access in ('public','invite_only')),
  updated_at    timestamptz not null default now()
);

create trigger app_settings_updated_at
  before update on public.app_settings
  for each row execute function public.set_updated_at();

-- --- memberships (user ↔ workspace ↔ role) ---------------------------------
create table if not exists public.memberships (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  org_id     uuid not null references public.organizations(id) on delete cascade,
  role       text not null check (role in ('owner','admin','editor','viewer')),
  created_at timestamptz not null default now(),
  unique (user_id, org_id)
);

create index if not exists memberships_user_idx on public.memberships(user_id);
create index if not exists memberships_org_idx  on public.memberships(org_id);

-- --- pages -----------------------------------------------------------------
create table if not exists public.pages (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  name         text not null,
  icon         text,
  slug         text not null,
  sort_order   int  not null default 0,
  is_published boolean not null default true,
  visibility   jsonb not null default jsonb_build_object('kind', 'everyone'),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (org_id, slug)
);

create index if not exists pages_org_sort_idx on public.pages(org_id, sort_order);

create trigger pages_updated_at
  before update on public.pages
  for each row execute function public.set_updated_at();

-- --- sections (optional grouping within a page) ----------------------------
create table if not exists public.sections (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  page_id     uuid not null references public.pages(id) on delete cascade,
  title       text,
  sort_order  int  not null default 0,
  collapsible boolean not null default false
);

create index if not exists sections_page_sort_idx on public.sections(page_id, sort_order);

-- --- blocks (the content elements) -----------------------------------------
create table if not exists public.blocks (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  page_id     uuid not null references public.pages(id) on delete cascade,
  section_id  uuid references public.sections(id) on delete set null,
  type        text not null,
  sort_order  int  not null default 0,
  props       jsonb not null default '{}'::jsonb,
  visibility  jsonb not null default jsonb_build_object('kind', 'everyone'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists blocks_page_sort_idx on public.blocks(page_id, sort_order);
create index if not exists blocks_org_idx        on public.blocks(org_id);

create trigger blocks_updated_at
  before update on public.blocks
  for each row execute function public.set_updated_at();

-- --- user_state (per-user, per-workspace personalization) ------------------
-- Isolated to a single user; NEVER shared content (last page, bookmarks, etc.).
create table if not exists public.user_state (
  user_id    uuid not null references auth.users(id) on delete cascade,
  org_id     uuid not null references public.organizations(id) on delete cascade,
  key        text not null,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, org_id, key)
);

-- --- invites (for invite_only workspaces) ----------------------------------
create table if not exists public.invites (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  code       text not null unique,
  role       text not null check (role in ('owner','admin','editor','viewer')),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists invites_org_idx on public.invites(org_id);

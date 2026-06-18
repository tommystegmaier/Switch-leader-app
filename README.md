# Team Hub Platform

A multi-tenant **"Team Hub"** platform: any creator/admin can build their own
mobile app — pages of resources, weekly info, links, and documents — for their
team, **without writing code**. Each creator gets an isolated workspace; within
it, hundreds of team members open a **read-only** viewer.

The first reference workspace is a youth-ministry **"Switch Leader"** app, but
the product is the *platform*, not that one app. Switch is only example content
built from the same general block palette every creator uses.

> **Status:** Phases 1–3 complete (scaffolding; multi-tenant data model, auth &
> RLS; and the full block builder). See the build sequence below.

---

## Two sides, one content database

- **Creator/Admin side** — visually edit everything (text, layout, buttons,
  links, images, pages, navigation, colors, PDFs) with no coding. Edits publish
  to all viewers.
- **Viewer side** — team members see the published content, read-only. Anonymous
  public viewing is supported per-workspace.

A **workspace** (organization) is the top-level tenant. Everything content-related
is scoped to a workspace by `org_id`, and tenant isolation + viewer read-only
access are enforced in the database with Postgres Row-Level Security (Phase 2),
not just in the UI.

## Tech stack

- **Frontend:** React + Vite + TypeScript + Tailwind CSS v4
- **Data/auth/storage:** Supabase (Postgres, Auth, Storage, RLS, Realtime) — Phase 2
- **Data fetching:** TanStack Query · **Routing:** React Router
- **Rich text:** Tiptap · **Reordering:** dnd-kit · **PWA:** vite-plugin-pwa (later phases)
- **Native-ready:** structured for a future Capacitor wrapper (see `GOING-NATIVE.md`, later phase)

## Getting started

```bash
# 1. Install dependencies
npm install

# 2. Configure environment (optional in Phase 1 — falls back to sample data)
cp .env.example .env
#   then fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY

# 3. Run the dev server
npm run dev
```

Open the app and you'll be redirected to the bundled **sample workspace** at
`/o/demo`. Without Supabase configured, the app reads from an in-memory sample
repository so the Viewer shell renders immediately.

### Scripts

| Command             | What it does                                  |
| ------------------- | --------------------------------------------- |
| `npm run dev`       | Start the Vite dev server                     |
| `npm run build`     | Type-check and build for production           |
| `npm run preview`   | Preview the production build                  |
| `npm run typecheck` | Type-check without emitting                   |

## Architecture (Phase 1)

```
src/
  lib/
    env.ts            # typed env access (single place that reads import.meta.env)
    supabase.ts       # lazy Supabase client (anon key); null until configured
    queryClient.ts    # shared TanStack Query client (caches published content)
    theme.ts          # applies a workspace theme to CSS variables
  types/
    index.ts          # domain types mirroring the Postgres schema
  data/                # THE DATA-LAYER SEAM — UI never imports Supabase directly
    contentRepository.ts        # interface the UI depends on
    sampleContentRepository.ts  # in-memory sample (Phase 1)
    index.ts                    # selects the active repository
    hooks.ts                    # TanStack Query hooks over the repository
  viewer/              # read-only Viewer surface
    ViewerLayout.tsx  # top bar + hamburger nav, applies theme
    ViewerPage.tsx    # renders a page's blocks
    BlockRenderer.tsx # minimal Phase 1 renderer (replaced by registry in Phase 3)
  router/
    index.tsx         # client-side routes incl. per-workspace deep link /o/{slug}
  main.tsx            # app entry: Query + Router providers
```

**The data-layer seam** (`src/data/`) is deliberate: the UI talks only to
`ContentRepository`. Phase 2 adds a Supabase-backed implementation behind the
same interface — no UI changes — which also keeps the app native-ready.

**Theme-driven, not hardcoded:** all colors/fonts come from a workspace's
`app_settings.theme` and are applied as `--th-*` CSS variables. Nothing about
Switch (or any workspace) is baked into the code.

## Multi-tenancy & RLS isolation (Phase 2)

The database is the source of truth for security — not the UI.

- **Tenant isolation:** every content table carries `org_id`. RLS policies check
  it against the caller's `memberships` (members) or the workspace's public flag
  (anonymous viewers), so one workspace can never read or write another's rows.
- **Viewer read-only:** only `owner`/`admin`/`editor` of a workspace have a write
  path to its content (`pages`, `sections`, `blocks`, `app_settings`, storage).
  Viewers and anonymous visitors have **no** write policy at all — so nothing a
  viewer does can change content or another viewer's experience.
- **Public vs invite_only:** anonymous users can read the *published* content of
  workspaces whose `viewer_access = 'public'`. `invite_only` workspaces return
  nothing to anonymous callers.
- **Per-user state:** `user_state` rows are readable/writable only by their owner
  (`user_id = auth.uid()`), so personalization is never shared.

Recursion is avoided with `SECURITY DEFINER` helpers (`is_org_member`,
`has_org_role`, `org_is_public`) that the policies call. The migrations and these
guarantees are validated by the RLS test scenarios documented in
`supabase/migrations/`.

### Database setup

Apply the SQL migrations to your Supabase project (Supabase SQL editor, or
`supabase db push` with the CLI), **in order**:

```
supabase/migrations/0001_init.sql              # tables, indexes, triggers
supabase/migrations/0002_rls.sql               # RLS helpers + policies
supabase/migrations/0003_functions_storage.sql # create_organization RPC + media bucket
```

A non-technical admin signs in at `/login` (email + password). To create the
first workspace, an authenticated user calls the `create_organization(name, slug)`
RPC, which atomically creates the workspace, its default settings, and an
`owner` membership for that user. (A guided seed for the Switch starter workspace
comes in Phase 7.)

## The block system (Phase 3)

The builder is a general creative palette — the same blocks compose any app.
Everything is driven by a single **registry** (`src/blocks/registry.tsx`). Each
entry pairs a block `type` with a viewer component, a list of editor `fields`,
generic `defaultProps`, an icon, a label, and a one-line description.

- **Viewer Mode** renders each block via `BlockView` → the registry's `Viewer`.
- **Edit Mode** (owner/admin/editor only) overlays controls on the *same*
  layout: inline text editing (click a heading/paragraph and type; autosave on
  blur), a hover toolbar (⚙ edit · ⧉ duplicate · ↑/↓ move · ⠿ drag · 🗑 delete),
  drag-and-drop reorder (dnd-kit), and a visual **+ Add block** picker.
- The property drawer is **data-driven** from each block's `fields`, so most
  blocks need no bespoke editor UI. Rich text uses **Tiptap**; all creator HTML
  and URLs are sanitized (`src/blocks/sanitize.ts`) to prevent XSS.
- The whole editing surface (Tiptap, dnd-kit, drawer) is **lazy-loaded**, and
  the PDF viewer is split out too — public viewers download a lean bundle.

**Block types:** heading, paragraph (rich text), image, gallery, button, link,
card, list, divider, spacer, video, document/PDF, embed, map, qr, countdown,
accordion.

### Adding a new block type

1. Add the type name to `BlockType` in `src/types/index.ts`.
2. Define its props shape in `src/blocks/blockProps.ts`.
3. Write a viewer component (in `src/blocks/viewers/…`).
4. Register it in `src/blocks/registry.tsx` with `{ type, label, icon,
   description, category, defaultProps, fields, Viewer }`.

That's it — the picker, the renderer, and the property editor all pick it up
automatically. No database migration is needed (block props are JSONB).

## Build sequence

- [x] **Phase 1 — Scaffolding:** Vite + React + TS + Tailwind + Router; Supabase
      client seam; env; Viewer shell reading a sample page.
- [x] **Phase 2 — Multi-tenant data model + auth + RLS:** full Postgres schema,
      tenant-isolation + viewer-read-only policies, email/password auth,
      role-gated Edit toggle, Supabase-backed repository, `/o/{slug}` URLs.
- [x] **Phase 3 — Block system:** registry + all 17 block types (viewer +
      data-driven editor panels), inline editing, add/reorder/duplicate/delete,
      dnd-kit reorder, Tiptap rich text, XSS sanitization, lazy-loaded editor.
- [ ] **Phase 4 — Pages + navigation**
- [ ] **Phase 5 — Theme + media + settings**
- [ ] **Phase 6 — Draft/Publish + visibility + PWA**
- [ ] **Phase 7 — Seed the Switch starter workspace; docs**

Deployment (`netlify.toml` + `DEPLOY.md`), `GOING-NATIVE.md`, and the
non-technical-admin guide are written in later phases.

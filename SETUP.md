# Getting started with Supabase

This walks you through connecting the app to your Supabase project: applying the
database migrations, setting environment variables, and creating your first
workspace with yourself as owner. (A fuller production `DEPLOY.md` + Netlify
steps land in Phase 7.)

## 1. Get your API keys

In the Supabase dashboard for your project:

- **Project Settings → API**
  - **Project URL** → use as `VITE_SUPABASE_URL`
  - **Project API keys → `anon` `public`** → use as `VITE_SUPABASE_ANON_KEY`

> The `anon` key is **safe to expose** in the browser. Security comes from
> Row-Level Security, not from hiding the key. Never put the `service_role`
> key in a `VITE_` variable.

Create your local env file:

```bash
cp .env.example .env
# edit .env and paste the two values
```

## 2. Apply the database migrations (in order)

Run the three files in `supabase/migrations/` **in numeric order**. Pick ONE
method:

### Option A — SQL Editor (simplest, no tooling)

1. Open **SQL Editor** in the Supabase dashboard.
2. Open `supabase/migrations/0001_init.sql`, copy its full contents, paste, **Run**.
3. Repeat for `0002_rls.sql`, then `0003_functions_storage.sql`.

That's it — tables, RLS policies, the `create_organization` RPC, and the
`media` storage bucket are now created.

### Option B — Supabase CLI (repeatable)

```bash
npm install -g supabase           # or: brew install supabase/tap/supabase
supabase login
supabase link --project-ref <your-project-ref>   # ref is in your project URL
supabase db push                  # applies everything in supabase/migrations/
```

### Option C — Supabase GitHub integration

If you've connected this repo via the Supabase **GitHub integration**, it runs
the files in `supabase/migrations/` automatically when they land on the branch
it watches (usually your default branch). Since these migrations currently live
on the `claude/team-hub-platform-spec-*` branch, either merge that branch to the
branch Supabase watches, or just use Option A/B for now.

## 3. Allow email/password sign-in

Auth uses **email + password**. By default Supabase requires email confirmation:

- **Authentication → Providers → Email**: make sure "Email" is enabled.
- For quick local testing you can toggle **"Confirm email" off** so you can sign
  in immediately after signing up. (Turn it back on for production.)

## 4. Run the app and create your account

```bash
npm install
npm run dev
```

Open the app, go to **`/login`**, and **Create account** with your email +
password. (If email confirmation is on, click the link in your inbox first.)

## 5. Create your first workspace (make yourself owner)

The app calls a `create_organization(name, slug)` RPC, but until the "new
workspace" UI lands you can bootstrap one directly. After signing up once (so
your user exists), run this in the **SQL Editor** — it makes you the **owner**
of a workspace at `/o/switch`:

```sql
do $$
declare
  v_uid uuid;
  v_org uuid;
begin
  -- your account email:
  select id into v_uid from auth.users
   where email = 'tommy.stegmaier@life.church';
  if v_uid is null then
    raise exception 'No auth user found — sign up at /login first.';
  end if;

  insert into public.organizations (name, slug)
  values ('Switch Leader', 'switch')
  returning id into v_org;

  insert into public.app_settings (org_id, app_name)
  values (v_org, 'Switch Leader');

  insert into public.memberships (user_id, org_id, role)
  values (v_uid, v_org, 'owner');
end $$;
```

Now visit **`/o/switch`**. Because you're an owner, the **✎ Edit** toggle appears
in the top bar. (Public visitors won't see it — and the database blocks any write
from them regardless.) The page will be empty until you add content — the
visual block builder for that arrives in **Phase 3**.

> Prefer to start blank? Use any `name`/`slug` you like, or once the new-workspace
> UI exists, just click "Create workspace" — the RPC makes you owner automatically.

## Troubleshooting

- **"Workspace not found" at `/o/switch`** — the org row doesn't exist yet, or the
  slug differs. Re-check step 5.
- **Edit toggle missing** — you're signed in but not a member; confirm the
  `memberships` row exists for your `user_id` + `org_id` with an editor+ role.
- **Sign-in says "not configured"** — `.env` is missing/incorrect or the dev
  server wasn't restarted after editing `.env`.
- **Blank page / sample "Demo" workspace at `/`** — env vars aren't loaded, so the
  app fell back to sample data. Set them and restart `npm run dev`.

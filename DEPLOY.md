# Deploying your app to a live link (plain-English guide)

This gets your app onto a real, shareable web address using **Netlify** — all
through websites, **no Terminal, no Node.js to install**. You'll use three
dashboards you can navigate: GitHub (code), Supabase (data), Netlify (the live
site).

You only do steps 1–2 once. After that, every code change re-deploys
automatically.

---

## Before you start

Make sure you've done the Supabase setup in **SETUP.md**:
- Ran the three migration files in the Supabase SQL Editor.
- Have your two keys handy from **Supabase → Project Settings → API**:
  - **Project URL**
  - **`anon` `public`** key

---

## Step 1 — Connect GitHub to Netlify

1. Go to **https://netlify.com** and sign up / log in. Choose **"Sign up with
   GitHub"** so the two are connected automatically.
2. Click **"Add new site" → "Import an existing project"**.
3. Choose **GitHub**, then pick your repository (`switch-leader-app`).
4. Netlify reads `netlify.toml` automatically, so the build settings are already
   filled in:
   - **Build command:** `npm run build`
   - **Publish directory:** `dist`
   You don't need to change these.
5. **Important — don't click Deploy yet.** First add your keys (Step 2). If you
   already clicked it, that's fine — just add the keys, then re-deploy (Step 3).

## Step 2 — Add your Supabase keys to Netlify

Netlify needs the same two keys your app uses to talk to Supabase. These are the
equivalent of the `.env` file, but entered in Netlify's website.

1. In the import screen, expand **"Add environment variables"** (or later:
   **Site configuration → Environment variables → Add a variable**).
2. Add these two (names must match exactly):

   | Key | Value |
   | --- | --- |
   | `VITE_SUPABASE_URL` | your Project URL (e.g. `https://abcd.supabase.co`) |
   | `VITE_SUPABASE_ANON_KEY` | your long `anon public` key (starts with `eyJ…`) |

   > The `anon` key is safe to use here — it's designed for the browser. Never
   > paste the `service_role` key.

3. Click **Deploy**.

## Step 3 — Open your live link

1. Netlify builds for a minute, then shows a link like
   `https://your-site-name.netlify.app`. Click it.
2. You'll land on the app. Visit your workspace at
   `https://your-site-name.netlify.app/o/switch` (use whatever slug you created
   in SETUP.md §5).
3. Sign in at `/login` with the account you created. Because you're the owner,
   the **✎ Edit** toggle appears in the top bar.

You can rename the site (and add a custom domain later) under
**Site configuration → General → Site details → Change site name**.

## Step 4 — From now on, it's automatic

Every time the code changes in GitHub (for example, when I finish a new feature
and it's merged), Netlify automatically rebuilds your live link. You don't have
to do anything — just refresh the page.

---

## "Add to Home Screen" (installable app)

Once the PWA packaging lands (Phase 6), opening your Netlify link on a phone will
offer **"Add to Home Screen"**, giving your team an app icon that opens
full-screen — no App Store needed yet. (Native App Store / Google Play wrapping
comes later via Capacitor — see `GOING-NATIVE.md`.)

## Troubleshooting

- **Build fails on Netlify** — open the build log (Netlify shows it). Most often
  it's a missing environment variable from Step 2.
- **App loads but says "not configured" at login** — the two environment
  variables are missing or misspelled. Fix them under **Site configuration →
  Environment variables**, then **Deploys → Trigger deploy → Deploy site**.
- **"/o/..." gives a 404 when refreshed** — the SPA redirect in `netlify.toml`
  handles this; make sure that file is present in your repo (it is by default).
- **Changes don't show up** — give it a minute; check **Deploys** in Netlify to
  see the build status.

# Push notifications — one-time setup

This turns on real phone notifications: viewers add the app to their Home Screen,
tap "Turn on notifications," and creators broadcast messages to everyone.

There are **4 things to configure once**. None require a terminal.

## Your signing keys (already generated)

```
VAPID_PUBLIC_KEY  = BFeZAappJaOxyewy7xvDkvtCrT1Mpg7gsfBRqsjfpq23uo29UXpTBnToTu-Pr4bZu5QuA1GUBdKeEVUjXX7NeOk
VAPID_PRIVATE_KEY = GzHWHYVJYPL0QSWqJWNdYqcDWwc5zs_W5JU0kSw9jRQ
```

> The **public** key is safe to expose. Keep the **private** key secret — only
> paste it into Cloudflare's server-side variables (step 3), never anywhere with
> a `VITE_` name.

## 1. Run the database migration

Supabase → SQL Editor → run **`supabase/migrations/0007_push.sql`** (creates the
`push_subscriptions` table).

## 2. Add the public key for the app (build variable)

Cloudflare → your Pages project → **Settings → Variables and secrets** → add:

| Name | Value |
| --- | --- |
| `VITE_VAPID_PUBLIC_KEY` | the `VAPID_PUBLIC_KEY` above |

## 3. Add the server secrets for sending

Same screen, add these **server-side** variables (no `VITE_` prefix — they must
stay private):

| Name | Value |
| --- | --- |
| `SUPABASE_URL` | your Project URL, e.g. `https://txzxvjhrvttkiooynekc.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API Keys → **service_role** secret |
| `VAPID_PUBLIC_KEY` | the public key above |
| `VAPID_PRIVATE_KEY` | the **private** key above |
| `VAPID_SUBJECT` | `mailto:tommy.stegmaier@life.church` |

> The `service_role` key is powerful — it's only ever used by the server
> function here, never sent to browsers.

## 4. Re-deploy

Cloudflare → **Deployments** → newest → **Retry deployment** (or push a change),
so the new build picks up the keys.

## How it works for people

- **Viewers:** open the app → the popup (or ☰ menu) has **"🔔 Turn on
  notifications."** On **iPhone they must Add to Home Screen first**, then open
  it from the Home Screen icon and turn on notifications (Apple's rule).
- **Creators:** in Edit Mode, the top bar has **🔔 Notify** → type a title +
  message → **Send to everyone.**

## Notes & limits

- iOS 16.4+ only, and only for the installed (Home Screen) app.
- If someone uninstalls or blocks notifications, their subscription is cleaned
  up automatically on the next send.
- Notifications are per-workspace: each app's creator only reaches their own
  app's subscribers.

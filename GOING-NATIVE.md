# Going native (App Store + Google Play) with Capacitor

This app is built **native-ready**: a clean data layer (Supabase JS SDK),
client-side routing, no browser-only assumptions, and a PWA shell. When you're
ready to ship to the Apple App Store and Google Play, you wrap **this same
codebase** with [Capacitor](https://capacitorjs.com/) — no rewrite.

> You do **not** need to do any of this to use the app on phones today: the PWA
> is already installable via "Add to Home Screen." This is only for listing in
> the native app stores.

## Why it's ready

- **Data via the Supabase JS SDK** through a single repository seam
  (`src/data/`), so the app talks to your backend the same way inside a native
  shell.
- **Client-side routing** (React Router) with per-workspace deep links
  (`/o/{slug}`), which map cleanly to native deep links / universal links.
- **No server-rendering or Node-only APIs** in the client; it's a static SPA.
- **PWA assets** (icons, manifest, service worker) already exist.

## Prerequisites

- Node.js 18+ and the built web app (`npm run build` → `dist/`).
- **iOS:** a Mac with Xcode + an Apple Developer account ($99/yr).
- **Android:** Android Studio + a Google Play Developer account ($25 once).

## One-time setup

```bash
npm install @capacitor/core @capacitor/cli @capacitor/app @capacitor/browser
npx cap init "Team Hub" church.life.teamhub --web-dir=dist

# Add the native platforms (creates ios/ and android/ folders)
npm install @capacitor/ios @capacitor/android
npx cap add ios
npx cap add android
```

## Build & run loop

```bash
npm run build      # produce dist/
npx cap sync       # copy web build + plugins into the native projects
npx cap open ios       # opens Xcode      → run on simulator/device
npx cap open android   # opens Android Studio → run on emulator/device
```

Repeat `npm run build && npx cap sync` whenever the web code changes.

## Deep links (open a workspace from a link)

Map your domain's `/o/{slug}` paths to the app so links open natively:

- **iOS:** add an **Associated Domains** entitlement
  (`applinks:your-domain.com`) and host an
  `apple-app-site-association` file.
- **Android:** add an **intent filter** for your domain in
  `AndroidManifest.xml` and host a `.well-known/assetlinks.json`.
- Handle the incoming URL with `@capacitor/app`'s `appUrlOpen` listener and push
  the path into React Router (`navigate(path)`).

## Auth note

Email/password auth via Supabase works as-is in the native webview. If you later
add OAuth providers, use `@capacitor/browser` (or native auth) and configure
each provider's redirect URLs for your app scheme.

## Store submission (high level)

- **iOS:** set version/icons/splash in Xcode → Archive → upload to App Store
  Connect → submit for review.
- **Android:** set version/icons in Android Studio → generate a signed
  **App Bundle (.aab)** → upload to the Play Console → submit for review.

## What to keep clean to stay native-ready

- Keep all data access behind `src/data/` (don't call `fetch` to browser-only
  endpoints from components).
- Avoid `window`-only assumptions; prefer the SDK and React Router.
- Keep secrets in env/config, never hardcoded.

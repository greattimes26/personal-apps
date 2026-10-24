# Personal Apps — Project Guide

## Goal
Simple personal apps I use on both iPhone and Mac, without an Apple Developer
account or the App Store.

## Architecture
- Each app is a static web app (HTML, CSS, vanilla JavaScript), installable as a
  PWA (manifest, icons, service worker for offline use).
- Hosted on GitHub Pages. Hosting serves code only — no user data ever goes to a server.
- iPhone: open in Safari → Share → Add to Home Screen.
- Mac: open the same URL in Safari (optionally File → Add to Dock).
- No backend, no accounts, no analytics, no third-party network calls.

## Data
- Stored locally on each device in IndexedDB (localStorage only for tiny apps).
- All apps share one GitHub Pages origin, so namespace every database name and
  storage key by app name to avoid collisions.
- On iPhone, the Home Screen app has separate storage from Safari tabs — always
  use the Home Screen version.
- Each device keeps its own copy; syncing is manual via iCloud Drive.

## Export / Import (required in every app)
- Export creates `<app-name>-backup.json`. On iPhone, use the Web Share API with
  the file (share sheet → Save to Files → iCloud Drive); fall back to a download.
- File format: `{ app, schemaVersion, exportedAt, items: [...] }`
- Every item has: `id` (UUID), `createdAt`, `updatedAt`, `deleted` (soft-delete
  flag, so deletions also sync).
- Import merges, never silently replaces: for each `id`, keep the version with
  the newer `updatedAt`. Show a summary (added / updated / unchanged).
- If `schemaVersion` is older, migrate the data on import.
- Show "Last exported: <date>" in the UI.

## Shared template
- Storage, export, import, and merge logic live in a reusable module in
  `/shared/`, used by every app. Each app only adds its own UI and data fields.

## Repo layout
```
/shared/            storage + backup/merge module, base styles
/apps/<app-name>/   index.html, app.js, styles.css, manifest.json, sw.js, icons/
index.html          simple list linking to each app
```

## Conventions
- No build step and no frameworks unless clearly needed.
- Mobile-first; works at iPhone width; supports dark mode and safe-area insets.
- Safari (iOS and macOS) is the target browser — test there.
- Bump the service worker cache version on every release so updates load.

## Deploy
- Push to `main` → GitHub Pages publishes automatically.

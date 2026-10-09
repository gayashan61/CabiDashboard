# Tiljay CF Pro: project notes for Claude

Production dashboard for **Tiljay Computer Forms Production** (spelled "Tiljay", not "TilJay"). Employees' daily counts per task are shown on factory TVs, entered or approved by an admin, and sent by employees from an Android app.
**It is live with real data (since 2026-09-30): treat the database as production.**

A sanitised snapshot of Claude's working memory is in [`claude/memory/`](claude/memory/). Read it for history and decisions.

## Where things run
| What | Where |
|---|---|
| Site (static HTML + vanilla JS, no build) | Vercel project `kpidashboard` (team Torbit), auto-deploys `main` in ~20 s, https://kpidashboard-one.vercel.app |
| Database, auth, Edge Functions | Supabase project `bbhtejcxjytxmnxfsjxx` (Free plan: **no backups**) |
| Phone push | Firebase project `tiljay-cf-pro` (FCM HTTP v1) |
| Code | github.com/gayashan61/CabiDashboard, **public**, so never commit `docs/` or any key, password or secret |

## Map
- `index.html`: sign-in for everyone, then routes. Admin/TV → screen chooser; employee → `me.html`.
- `admin.html`: admin console with tabs Daily entry (Excel-like sheet + counts waiting for approval), Tasks (each task's **People** button / the popup after adding tasks: give a task to many people at once via `save_assignments`, only changed people are saved), Departments, Employees (logins, task lists, TV logins, bulk logins).
- `me.html`: employee page (My tasks: send counts, ‹ date › bar for the last 7 days, progress + department filter; Performance: ‹ date › bar back 400 days, Daily / Weekly / Monthly chart card; notifications).
- `tv-slides.html`, `tv-grid.html`, `tv-departments.html`: wall screens (admin or TV account).
- `assets/core.js`: shared `KPI` API. Plain REST to Supabase, sessions, charts, avatars, icons, `noteHTML` notification cards, `setupPush`.
- `assets/config.js`: names, Supabase URL + publishable key, `LOGIN_DOMAIN`, `ANDROID_PUSH`, thresholds.
- `assets/style.css`: design tokens (light/dark); `[hidden]{display:none!important}` is deliberate.
- `supabase/schema.sql`: the whole database (idempotent, run in the SQL Editor). `migrations/` covers older upgrades.
- `supabase/functions/admin-users`: creates and deletes logins (service role; caller must be in `admins`; Verify JWT **on**).
- `supabase/functions/push`: sends FCM pushes. Called by a Database Webhook on `notifications` INSERT with header `x-webhook-secret`. Verify JWT **off**. Secrets: `FIREBASE_SERVICE_ACCOUNT`, `PUSH_WEBHOOK_SECRET`.
- `mobile/`: Capacitor 8 Android shell (appId `lk.tiljay.cfpro`) that opens the live URL. `node build-apk.mjs [--test | --url <url>]`. It needs `mobile/android/app/google-services.json` (git-ignored, kept in `docs/`). Debug-signed with this PC's `~/.android/debug.keystore`; a build from another keystore won't install over it. **Google Play** (internal testing, since 2026-10-09): `node build-apk.mjs --aab` → `dist/TiljayCFPro-<version>.aab`, signed with the upload key `docs/tiljay-upload-key.jks` (password in `docs/tiljay-upload-key.txt`; `mobile/android/keystore.properties` git-ignored). Raise `versionCode` in `android/app/build.gradle` for every upload. The Play version is signed differently from the sideloaded APK, so phones must uninstall one to install the other.
- `tests/`: see `tests/README.md`. `npm test` needs `python -m http.server 8080 --bind 127.0.0.1` in the project folder and the private `docs/test-data.json`.

## Data model and rules
- `departments` → `jobs` (called **Tasks** in the UI; machine, name, unit, soft-deleted with `active`) → `entries(date, employee, job, qty)`.
- Colours compare a count with the average of everyone on the same task that day (ratio; the bar runs to 150%). The big TV number is the person's **main** department (the first in `employees.department`); "–" when they did no work there.
- Roles: `admins` (everything), `viewers` = TV accounts (read everything), employees (`employees.user_id`) read only their own rows. Anonymous visitors get **nothing**. Enforced by RLS and security-definer RPCs, not by the pages.
- Usernames sign in as `<username>@tiljay.local`.
- Employees send counts with `submit_count` (only for assigned, active tasks; today back to 7 days). The admin decides with `review_submission` (approve / edit / reject), or by typing in the sheet. Approved counts go into `entries` and are locked for the employee.
- Every decision or assignment inserts into `notifications`, which the webhook pushes to the person's phone. Give someone a login **before** their tasks, or the assignment notification has no recipient.

## How to work here
- The user writes Singlish (Sinhala in Latin letters). English replies are fine.
- **Commit locally, show what was verified (screenshots welcome), and push only when the user says so.** Push as gayashan61: `GH_TOKEN="$(gh auth token --user gayashan61)" git -c credential.helper= -c 'credential.helper=!gh auth git-credential' push origin main`. Confirm a deploy by curling the live site for a marker.
- **Never change production data.** Writes through the Supabase MCP are blocked anyway. Test SQL locally (PGlite), give the user the exact SQL to run in the SQL Editor, then verify with read-only checks. Test users are fine if they're deleted afterwards.
- "Check on dev" means http://localhost:8080 served from this folder. That copy uses the **real** database.
- Keep `CLAUDE.md` and `claude/memory/` updated when something important changes.

## Open items (as of 2026-10-03)
- Backups: Supabase Pro and/or a nightly backup to a private repo was recommended; the user hasn't decided.
- No self-service "change password" for employees yet. Their initial passwords follow a simple pattern.
- Unconfirmed task units (PR, Plate 10x24, Impression, Packing total); leftover "Other" tasks; duplicate empty Vercel project `cabidashboard`.
- The logo is only 225×225; a larger PNG or SVG was requested.

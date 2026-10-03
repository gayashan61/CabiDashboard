---
name: testing-approach
description: "Test suite in the repo's tests/ folder (since 2026-10-03): PGlite runs the real schema with RLS, puppeteer-core drives installed Edge against localhost:8080 with Supabase mocked; plus live read-only load test and real-phone tests"
metadata:
  node_type: memory
  type: reference
  originSessionId: e6832881-c895-45d1-9ff7-6f6555384bbd
  modified: 2026-09-30T12:51:47.403Z
---

Since 2026-10-03 the suite is committed in `tests/` (see tests/README.md): `cd tests && npm install && npm test` with `python -m http.server 8080 --bind 127.0.0.1` running in the project folder. It needs the private sample data `docs/test-data.json` (from the client's sheet, git-ignored). Suites: database, roles, screens, phone-layout, employees-tab, notifications (TEST user end to end), hidden; plus load.mjs (live, read-only, LOAD_USER/LOAD_PASSWORD env), firebase-check.mjs, real-phone.mjs. How it works:

- **SQL:** `@electric-sql/pglite` (in-memory Postgres in Node) runs `supabase/schema.sql` / migrations after stubbing `anon`/`authenticated` roles, `auth.users` and `auth.uid()` (read from `current_setting('test.uid')`). Seed a copy of the live state first (read it with read-only `execute_sql`) and run migrations twice to prove they're idempotent.
- **Pages:** `python -m http.server 8080` in the repo, then `puppeteer-core` with `C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`, request interception answering `*.supabase.co/rest/v1/rpc/*` from that PGlite DB (so the real SQL functions run) and aborting everything else. A fake admin session goes in sessionStorage `kpi_sb_session`; freezing `Date` makes screenshots repeatable.
- The client's Excel days (21–25 Sep 2026) make good realistic test data; pasting its TSV tests the whole-sheet paste.
- Since logins (2026-10-03) the mock must run each RPC as the signed-in role (`set role authenticated` + `test.uid`) so RLS applies, and mock `/auth/v1/token`, `/auth/v1/logout` and `/functions/v1/admin-users`; tokens look like `tok.<uuid>`.
- Real phone (Pixel 8 Pro over USB): a node test server serves the repo with config.js pointed at a fake Supabase (same mock), `adb reverse tcp:8090 tcp:8090`, install the `--test` APK, then `adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>` and `puppeteer.connect({browserURL})` to drive the app's WebView; `adb exec-out screencap -p` for real screenshots.
- Changing `isMobile` in `setViewport` reloads the page (and trips the unsaved-changes prompt) — keep it constant when resizing.
- Two people signed in at once (admin + employee) need separate browser contexts (`h.open(..., { isolated: true })`): tabs share localStorage, so signing in one replaces the other. Call `page.bringToFront()` before clicking in a tab that was in the background — puppeteer clicks hang in background tabs.
- Checking `el.hidden` isn't enough: assert computed `display` (a CSS class once overrode `[hidden]` on the live sign-in page). style.css now has `[hidden]{display:none!important}`.
- Load test 2026-10-03 (live, read-only, 30 phones polling every 2 s + a 30-phone burst): 1,072 requests, 0 errors, inbox ~0.2 s, me() ~0.6 s.

Related: [[deployment-targets]].

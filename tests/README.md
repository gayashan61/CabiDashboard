# Tests

These tests never touch the live database. They run the real `supabase/schema.sql` in an in-memory Postgres
([PGlite](https://pglite.dev)) with Supabase-like roles, so the row-level security rules apply to every request.
The pages run in the installed Microsoft Edge (puppeteer-core), with Supabase replaced by that local database.

## Setup (once)
```
cd tests
npm install
```
You also need:
- **The sample data:** `docs/test-data.json` holds counts from the client's sheet. It's private, like the rest of `docs/`, and is not in git.
- **The site served on port 8080:** from the project folder, run `python -m http.server 8080 --bind 127.0.0.1`.
- **A browser:** Edge at its usual place, or set `BROWSER` to another Chromium-based browser.

## Run
| Command | What it checks |
|---|---|
| `node database.mjs` | The schema: who can read and change what (admin, TV account, employee, signed out); sending, approving and locking counts; notifications; upgrading from the version before logins (`fixtures/schema-before-logins.sql`) |
| `node roles.mjs` | Sign-in sends each kind of login to the right screen; task lists, logins and TV logins; counts sent, approved, changed and rejected end to end |
| `node screens.mjs` | Admin console and TV screens on a computer: daily sheet, Excel paste and export, tasks, departments, employees, charts |
| `node phone-layout.mjs` | The same on a phone-sized screen |
| `node employees-tab.mjs` | Employees tab fits the screen; "Create logins for everyone without one" |
| `node notifications.mjs` | A TEST user created by the admin goes through the whole flow; the notification colours; the TEST user is removed at the end |
| `node hidden.mjs` | Nothing marked hidden shows on any page or tab |
| `npm test` | All of the above |

Screenshots land in `*shots/` folders here, which are not in git.

## Live and phone checks (run by hand)
- `LOAD_USER=<employee username> LOAD_PASSWORD=<password> node load.mjs`: a read-only load test against the live site and database (30 phones at once). It changes nothing.
- `node firebase-check.mjs <service-account.json> [device-token "title" "body"]`: checks the Firebase key. With a device token, it also sends a test notification.
- `node real-phone.mjs`: drives the Android app on a USB-connected phone. Build it with `node build-apk.mjs --test` (in `mobile/`), run `node testserver.mjs`, then `adb reverse tcp:8090 tcp:8090`.

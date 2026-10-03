# Tiljay CF Pro

**Tiljay Computer Forms Production** — a production performance dashboard for a wall TV. It is a plain static website (no build step), hosted free on **Vercel**, with data stored in **Supabase** (free Postgres).

Everyone signs in. The **admin** sees every screen and the admin console; **TV accounts** show the wall screens; each **employee** sees only their own page, where they send counts for their tasks for the admin to approve. There is also an **Android app** (the same site, with push notifications).

Each day the admin fills in (or approves) a sheet laid out like the client's Excel file: **tasks down the side** (grouped by department, e.g. Sheets → RT1 → Blank) and **people across the top**, one count per person per task. Each task has its own unit (sheets, sets, boxes, rolls …). There are no targets. Colours compare each person's count with the **average of everyone who did the same task that day**.

| Page | What it's for |
|---|---|
| `index.html` | **Sign in** for everyone, then the screen list (admins, TV accounts); employees go to their own page |
| `me.html` | **Employee's page**: their tasks (send a count for the day), the admin's decisions, their performance and history, notifications |
| `tv-slides.html` | **Slideshow**: department totals and top performers, then one full-screen slide per person. Rotates every 10 s. |
| `tv-grid.html` | **Team grid**: everyone as tiles. Click a person to open their profile. |
| `tv-departments.html` | **Departments**: a leaderboard per department, ranked by today's count |
| `admin.html` | **Admin**: enter and approve daily counts, manage tasks, departments, employees, their logins and task lists, TV logins |

### How the numbers work
- **Count**: what a person made on one task that day, in that task's unit (for example 12,500 *sheets* on RT1 Blank).
- 🟢 **Above avg**: at or above the average of everyone who did that task that day. 🟡 **Near avg**: 80–99% of it. 🔴 **Below avg**: under 80%. The tick on each bar marks the average. Someone who was alone on a task that day shows "only one" (counted as at average). Change the bands with `THRESHOLDS` in `assets/config.js`.
- People who did several tasks get one colour for the day: the average of how they did on each task. Their tile's big number is their biggest count in their **main department** (the first one in Employees). If they didn't work in their main department that day it shows **–** ("No Rolls count"), so that's easy to spot. Their tasks are listed underneath, main department first.
- **Department total**: adds up the department's tasks counted in the department's unit (Departments tab). Tasks in other units are shown next to it, e.g. *1,050 boxes + 750 sheets*. Department leaderboards rank people against the task averages, not by raw count, because units differ.
- **7-day avg**: the average count per working day on that task over the last 7 working days on which they had a count.
- **Profile chart**: **Daily** shows counts for the last 7 working days. **Weekly**, **Monthly** and **Yearly** show totals. It follows one task at a time; people who do several tasks can switch with the chips above the chart.

### Screens and navigation
- **Past days:** use ‹ › next to the date, or click the date to open the calendar (a dot marks days with counts). **Back to live** returns to today. A link can open a day directly: `tv-grid.html?date=2026-09-15`.
- **Slideshow:** ◀ ⏸ ▶ in the bottom bar, or Space to pause and ← → to move.
- **Team grid:** click a person to open their profile, with the rest of the team and a search box on the right. Esc goes back.
- **More people than fit:** the grid and each department column scroll instead of shrinking.
- **Name and logo:** the app name and company name are `APP_NAME` and `COMPANY_NAME` in `assets/config.js`. The logo is `assets/logo.png` (with `favicon.png` for the browser tab and `apple-touch-icon.png` for phone home screens); replace those files to change it.
- **Light and dark themes:** use the sun/moon button. To lock a TV to one theme, add `?theme=light` or `?theme=dark` to its link. The default for everyone is `DEFAULT_THEME` in `assets/config.js`.
- **Kiosk mode:** add `&kiosk=1` to a TV link, for example `tv-slides.html?theme=dark&kiosk=1`, to hide the buttons and navigation.

### Phones and tablets
Every page works on a phone (from 360px wide) and a tablet. From 1024px up, the desktop and TV layouts are exactly as before.
- **Daily entry** becomes one card per task instead of the wide sheet. Pick a department with the chips, tap a task, and type each person's count. The department's own people come first; **+ N people from other departments** shows the rest. The keyboard's **Next** key moves to the next person. The card header shows the task total. **Export Excel** is in the **⋯** menu. Pasting from Excel works best on a computer.
- **Tasks, Departments, Employees**: each row becomes a card with full-width fields.
- The admin bar keeps the theme and log-out buttons; the TV screen links and your email are in the **⋯** menu.
- **TV screens**: the view switcher becomes a bar at the bottom and the calendar opens as a sheet. Team grid shows one column of tiles (two on a tablet); tap a person for their profile and use **Search team** to jump to someone else. Departments shows one leaderboard at a time: tap the chips or swipe sideways. The slideshow doesn't move on its own on a phone; swipe or use ‹ ▶ ›.

### Profile photos
- Go to **Admin → Employees** and click a person's picture or **Upload**. On a phone you can take the photo with the camera.
- The photo is cropped to a square and shrunk to about 10–30 KB automatically. Anyone who has the site link can see the photos, so get staff consent first.
- If someone has no photo, their initials are shown on their department colour.

---

## Daily use (admin)
1. Open `admin.html` and sign in with your admin email and password.
2. **Daily entry**: pick the date. The sheet has one row per task and one column per person, just like the Excel file. Type each count in the task's row under the person's name, then click **Save changes** (or press Ctrl+S).
   - You can type sums like `1500+250`. Leaving a box empty (or 0) means no count.
   - **Enter** / **↓** moves down, **↑** up, **← →** sideways, **Esc** undoes the box you're in. Changed boxes turn amber until saved.
   - **Paste from Excel:** in the Excel file, select the day's sheet from the *Dept* / names row down (for example `A1:W40`) and copy. Click any box and paste: every count goes to the right person and task, matched by name. Anything it can't match (a new task, someone not in Employees) is listed in the message. Check, then **Save**. Pasting a smaller block copies it into the boxes from the one you clicked.
   - Hatched boxes mean the person isn't in that department. You can still fill them in.
   - Pick a department at the top right to show only its tasks (and, with the tick box, only its people).
3. **Tasks**: the rows of the sheet, per department: an optional **machine / type** (RT1, Collator 2 …), the **task** name and its **unit**. Add, rename, reorder or remove them. Removing a task hides it; its past counts stay saved, and adding it back with the same name brings them back.
4. **Departments**: add, rename or remove departments and change their order. The order is the order on the TV screens and also sets each department's colour. **Total counts** is the unit the department's TV total adds up.
   - Renaming a department keeps its tasks, history and people.
   - Removing one takes it off everyone's list and hides its tasks. Their past counts stay in the database.
5. **Employees**: add people, choose their **main department** and tick any others under **Also works in**, or untick **Show** to hide someone from the TV. Renaming a person keeps their history.

---

## Logins, tasks and approvals
- **Employee logins**: Admin ➜ Employees ➜ **Set login** gives a person a username and password (a strong one is suggested; it's shown once to pass on). They sign in on the app or the website and see only their own page. **Change** sets a new password or removes the login. Removing an employee removes their login too.
- **Tasks**: Admin ➜ Employees ➜ **Tasks** picks the tasks each person usually does. They see these on their page; newly added tasks are sent to them as a notification.
- **Sending counts**: on their page, an employee types how much they did on each task (today or up to 7 days back) and taps **Send**. While it waits they can change or withdraw it.
- **Approving**: Admin ➜ Daily entry shows **counts waiting for approval** (with a badge on the tab and the bell). **Approve** as sent, change the number first, or **Reject** with an optional reason. Typing a sent count into the sheet also approves it. The employee is notified of the result. Approved counts are locked for them; the admin can still change or reject them (**Show decided**).
- **TV screens** need a sign-in: Admin ➜ Employees ➜ **TV screen logins** ➜ **+ Add TV login**, then sign each TV in once with **Keep me signed in** ticked. The TV header's sign-out button signs it out.
- Usernames sign in as `<username>@tiljay.local` behind the scenes (never emailed). The admin still signs in with their email.

### Going live with logins (one time, in this order)
1. **Edge Function `admin-users`** (creates logins): Supabase ➜ Edge Functions ➜ **Deploy a new function** ➜ *Via editor* ➜ name `admin-users`, paste `supabase/functions/admin-users/index.ts`, deploy (keep **Verify JWT** on).
2. **Database**: run all of `supabase/schema.sql` in the SQL Editor. From this moment nothing can be read without signing in, so the TVs show the sign-in page until step 4.
3. Publish the site (push to `main`).
4. Sign in as the admin ➜ Employees ➜ add a **TV screen login** and sign each TV in with it. Then give employees logins and tasks.

### Push notifications (Android app)
Set up on 2026-10-03 (Firebase project `tiljay-cf-pro`; the key files are kept in `docs/`, never in git). To set it up again:
1. Create a free Firebase project ➜ add an **Android app** with package name `lk.tiljay.cfpro` ➜ download `google-services.json` into `mobile/android/app/` (kept out of git).
2. Firebase ➜ Project settings ➜ Service accounts ➜ **Generate new private key**.
3. Supabase ➜ Edge Functions ➜ **Secrets**: `FIREBASE_SERVICE_ACCOUNT` = the whole key JSON; `PUSH_WEBHOOK_SECRET` = any long random text.
4. Deploy the Edge Function `push` (`supabase/functions/push/index.ts`) with **Verify JWT turned off**.
5. Supabase ➜ Database ➜ **Webhooks** ➜ new webhook on table `notifications`, event **Insert**, type *Supabase Edge Functions* ➜ `push`, with HTTP header `x-webhook-secret` = the same secret.
6. Set `ANDROID_PUSH: true` in `assets/config.js`, publish, and build the app again.

## Android app
The app (`mobile/`) is the website in a Capacitor shell: it opens https://kpidashboard-one.vercel.app, so site updates reach it without a new app. It adds the app icon, push notifications and a "can't reach the server" page.
- Build: `cd mobile && npm install && node build-apk.mjs` ➜ `mobile/dist/TiljayCFPro.apk` (needs Android Studio). Install it on phones (allow installing from this source), or publish it on Google Play.
- Test build against a local copy of the data: `node build-apk.mjs --test` opens `http://localhost:8090` on a USB-connected phone after `adb reverse tcp:8090 tcp:8090`.
- Try site changes in the app before publishing them: serve this folder on port 8080, `node build-apk.mjs --url http://localhost:8080`, then `adb reverse tcp:8080 tcp:8080` (uses the real database).

## Setup

### 1. Supabase database
1. Create a free project at [supabase.com](https://supabase.com).
2. Open **SQL Editor → New query**, paste all of `supabase/schema.sql` and click **Run**. It creates the departments and tasks from the client's Excel sheet. For a brand-new project, then run `supabase/seed.sql`, which adds the starting employees. Both are safe to run again.
3. **Project Settings → API Keys**: copy the **Project URL** and the **publishable** key. Never use the `secret` / `service_role` key in the website.

**Upgrading an older database?** Run the migrations it hasn't had yet, in order, then `supabase/schema.sql`. Until then, the new site shows a "database needs updating" message.
- From the old targets/tasks version: `supabase/migrations/2026-09-29_counts_per_department.sql`. ⚠ It **deletes all old entries**, which were counted per task. Employees, photos, their departments and admin logins are kept.
- From "one count per department": `supabase/migrations/2026-09-29_jobs.sql`. It renames *TH & 2ply* to *Rolls*, adds *Clean* and *Stores*, fixes *Packings* → *Packing* in employee lists, and moves any counts already entered to a task called *Other* in their department. Nothing is deleted.

### 2. Admin logins
1. **Authentication → Users → Add user → Create new user**. Enter an email and password, and tick **Auto Confirm User**.
2. Make that login an admin by running this in the SQL Editor, with the right email:
   ```sql
   insert into public.admins (user_id, email)
   select id, email from auth.users where email = 'you@example.com'
   on conflict (user_id) do nothing;
   ```
3. Repeat for every person who should enter data. Only accounts listed in `admins` can change anything.
4. Recommended: **Authentication → Sign In / Providers → Email** → turn off **Allow new users to sign up**.

### 3. Connect and publish
1. Put the Project URL and publishable key into `assets/config.js` (`SUPABASE_URL`, `SUPABASE_KEY`). The publishable key is meant to be public: the database rules in `schema.sql` let anyone *read*, since this is a wall display, and only admins *change* data.
2. In Vercel: **Add New… → Project**, import the GitHub repository. Use framework preset **Other**, no build command, with the root as the output directory. Every push to `main` redeploys automatically.

The TVs check every minute whether anything changed, which is a tiny request, and download the data only when it has. That keeps a few TVs well inside Supabase's free limits. Free Supabase projects pause after a week with **no** requests at all, but a TV that is on every day keeps it awake.

---

## The wall TV
- Open one of the TV pages in the TV's browser, or on a mini-PC or Chromecast-style stick, and press **F11** for full screen.
- The pages check for new data every 60 seconds and reload themselves every 6 hours. If the network drops, they keep showing the last data they had.
- You can change the slide time with `tv-slides.html?interval=15`.
- On a Fire TV Stick or Android TV, a "kiosk browser" app that opens a fixed URL at startup works well.

## Security note
Since the logins update, **nothing can be read without signing in**. TV accounts can read everything and change nothing; an employee can read only their own rows and can only send counts for their own tasks (never approve them); only admins change data. These rules are enforced by the database, not by the pages.

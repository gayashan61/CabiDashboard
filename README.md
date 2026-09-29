# Production KPI Dashboard

A performance dashboard for a wall TV. It is a plain static website (no build step), hosted free on **Vercel**, with data stored in **Supabase** (free Postgres).

Each day the admin fills in a sheet laid out like the client's Excel file: **tasks down the side** (grouped by department, e.g. Sheets → RT1 → Blank) and **people across the top**, one count per person per task. Each task has its own unit (sheets, sets, boxes, rolls …). There are no targets. Colours compare each person's count with the **average of everyone who did the same task that day**.

| Page | What it's for |
|---|---|
| `index.html` | Start page with links to every screen |
| `tv-slides.html` | **Slideshow**: department totals and top performers, then one full-screen slide per person. Rotates every 10 s. |
| `tv-grid.html` | **Team grid**: everyone as tiles. Click a person to open their profile. |
| `tv-departments.html` | **Departments**: a leaderboard per department, ranked by today's count |
| `admin.html` | **Admin** (sign-in required): enter daily counts, manage tasks, departments and employees |

### How the numbers work
- **Count**: what a person made on one task that day, in that task's unit (for example 12,500 *sheets* on RT1 Blank).
- 🟢 **Above avg**: at or above the average of everyone who did that task that day. 🟡 **Near avg**: 80–99% of it. 🔴 **Below avg**: under 80%. The tick on each bar marks the average. Someone who was alone on a task that day shows "only one" (counted as at average). Change the bands with `THRESHOLDS` in `assets/config.js`.
- People who did several tasks get one colour for the day: the average of how they did on each task. Their tile's big number is their biggest count, with their tasks listed underneath.
- **Department total**: adds up the department's tasks counted in the department's unit (Departments tab). Tasks in other units are shown next to it, e.g. *1,050 boxes + 750 sheets*. Department leaderboards rank people against the task averages, not by raw count, because units differ.
- **7-day avg**: the average count per working day on that task over the last 7 working days on which they had a count.
- **Profile chart**: **Daily** shows counts for the last 7 working days. **Weekly**, **Monthly** and **Yearly** show totals. It follows one task at a time; people who do several tasks can switch with the chips above the chart.

### Screens and navigation
- **Past days:** use ‹ › next to the date, or click the date to open the calendar (a dot marks days with counts). **Back to live** returns to today. A link can open a day directly: `tv-grid.html?date=2026-09-15`.
- **Slideshow:** ◀ ⏸ ▶ in the bottom bar, or Space to pause and ← → to move.
- **Team grid:** click a person to open their profile, with the rest of the team and a search box on the right. Esc goes back.
- **More people than fit:** the grid and each department column scroll instead of shrinking.
- **Light and dark themes:** use the sun/moon button. To lock a TV to one theme, add `?theme=light` or `?theme=dark` to its link. The default for everyone is `DEFAULT_THEME` in `assets/config.js`.
- **Kiosk mode:** add `&kiosk=1` to a TV link, for example `tv-slides.html?theme=dark&kiosk=1`, to hide the buttons and navigation.

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
Every change is checked by the database itself: only signed-in users listed in `public.admins` can write, whatever the web page does. The dashboard data can be read by anyone who has the site URL, which is normal for a wall display. Don't put anything sensitive in it.

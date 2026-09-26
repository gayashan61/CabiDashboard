# Production KPI Dashboard

A performance dashboard for a wall TV. It is a plain static website (no build step), hosted free on **Vercel** (or GitHub Pages), with data stored in **Supabase** (free Postgres) or a **Google Sheet**.

| Page | What it's for |
|---|---|
| `index.html` | Start page with links to every screen |
| `tv-slides.html` | **Slideshow**: team overview, then one full-screen slide per person (today's output, last 7 days). Rotates every 10 s. |
| `tv-grid.html` | **Everyone grid**: all team members on one screen as tiles |
| `tv-departments.html` | **Departments**: a ranked leaderboard for Sheets, Sets, TH & 2ply and Packing |
| `admin.html` | **Admin** (password-protected): enter daily output, set targets, manage employees |

### Themes and navigation
- **Light and dark themes.** Use the sun/moon button in the header to switch. Each screen remembers the choice.
- To lock a TV to one theme, add `?theme=light` or `?theme=dark` to its link, for example `tv-grid.html?theme=light`. To change the default for everyone, set `DEFAULT_THEME` in `assets/config.js` to `"dark"`, `"light"` or `"auto"`.
- The **Home** button (or the logo) goes back to the start page. The view switcher in the header moves between Slideshow, Team grid and Departments.
- **Past days:** use ‹ › next to the date, or click the date to open the calendar (the dots show each day's team average). **Back to live** returns to today. A link can open a day directly: `tv-grid.html?date=2026-09-15`.
- **Slideshow:** ◀ ⏸ ▶ in the bottom bar, or Space to pause and ← → to move.
- **Team grid:** click a person to open their profile, with the rest of the team and a search box on the right. Esc goes back. The profile chart can show **Daily, Weekly, Monthly or Yearly** averages.
- **Kiosk mode:** add `&kiosk=1` to a TV link, for example `tv-slides.html?theme=dark&kiosk=1`, to hide the buttons and navigation for a clean wall display.

### Profile photos
- Go to **Admin → Employees** and click a person's picture or **Upload**. On a phone you can take the photo with the camera.
- The photo is cropped to a square and shrunk automatically, to about 10–30 KB, then saved in the Google Sheet (**Employees** tab, column E). Anyone who has the site link can see the photos, so get staff consent first.
- If someone has no photo, their initials are shown on their department colour. On the TV the ring around each picture shows their status colour.

It runs in **demo mode** until you connect Supabase or the Google Sheet. In demo mode the password is `admin` and data is saved only in that browser, so you can try everything straight away. Demo mode starts with **2 years of generated sample numbers** so the trend charts have history to show. These are not real figures. **Admin → Demo tools** can generate new sample data or switch to only the numbers from your Excel file.

---

## How the score works

Each task has a **daily target**: what one person should produce in a full day doing only that task.

```
score = Σ (quantity ÷ daily target) × 100      across every task the person did that day
```

For example, 30 TH (target 60) plus 75 Packing (target 150) gives 50% + 50% = **100%**. People who switch between tasks during the day are scored fairly this way.

- 🟢 **On target**: 100% or more
- 🟡 **Close**: 80–99%
- 🔴 **Below**: under 80%
- **7-day avg**: the average over the last 7 working days on which the person had entries

You can change the colour thresholds, working days, slide timing and departments in `assets/config.js`.

> ⚠️ The targets in this project are **placeholders** that I estimated from the numbers in your Excel file. Set the real ones under **Admin → Targets** before showing the dashboard to the team.

---

## Setup with Supabase + Vercel (recommended, about 15 minutes)

### 1. Supabase database
1. Create a free project at [supabase.com](https://supabase.com) (any region close to you; save the database password somewhere safe).
2. Open **SQL Editor → New query**, paste all of `supabase/schema.sql` and click **Run**. Then do the same with `supabase/seed.sql` (employees, placeholder targets and the Excel data). Both are safe to run again.
3. **Create an admin login:** **Authentication → Users → Add user → Create new user**. Enter an email and password and tick **Auto Confirm User**.
4. **Make that login an admin:** back in the SQL Editor, run (with your email):
   ```sql
   insert into public.admins (user_id, email)
   select id, email from auth.users where email = 'you@example.com';
   ```
   Repeat steps 3–4 for every person who should enter data. Only people in `admins` can change anything.
5. Recommended: **Authentication → Sign In / Providers → Email** → turn off **Allow new users to sign up**, so nobody else can create logins.
6. **Project Settings → API Keys**: copy the **Project URL** and the **publishable** key (older projects: the `anon` `public` key). Never use the `secret` / `service_role` key in the website.

### 2. Connect the website
Open `assets/config.js` and fill in:
```js
SUPABASE_URL: "https://xxxxxxxx.supabase.co",
SUPABASE_KEY: "sb_publishable_…",
```
The publishable key is meant to be public: the database rules in `schema.sql` allow anyone to *read* (it's a wall display) and only admins to *change* data.

### 3. Publish on Vercel
1. Push this folder to a GitHub repository.
2. In Vercel: **Add New… → Project**, import the repository. Framework preset **Other**, no build command, output directory = the root. **Deploy**.
3. Every push to `main` redeploys automatically. Your site is at `https://<project>.vercel.app/`.

The TVs check every minute whether anything changed (a tiny request) and only download the data when it has, so a few TVs stay well inside Supabase's free limits. Free Supabase projects pause after a week with **no** requests at all; a TV that is on every day keeps it awake. If it ever pauses, restore it from the Supabase dashboard.

---

## Alternative: Google Sheet backend (about 15 minutes)

### 1. Google Sheet backend
1. Create a new Google Sheet, for example "Production KPI Data".
2. Go to **Extensions → Apps Script**. Delete the sample code and paste in all of `apps-script/Code.gs`. Save.
3. Choose the **`setup`** function in the toolbar, then click **Run**. Authorise it when asked. This creates the tabs **Entries**, **Employees** and **Targets** and imports the data from your Excel file.
4. Open **Project Settings (⚙) → Script properties** and change `ADMIN_PASSWORD` from `change-me` to your own password.
5. Click **Deploy → New deployment**, choose the type **Web app**, and set:
   - Execute as: **Me**
   - Who has access: **Anyone**
6. Click **Deploy** and copy the **Web app URL** (it ends in `/exec`).

### 2. Connect the website
Leave `SUPABASE_URL` empty, open `assets/config.js` and paste in the URL:
```js
API_URL: "https://script.google.com/macros/s/XXXXXXXX/exec",
```

### 3. Publish on Vercel (as above) or GitHub Pages
1. Create a new repository on GitHub, for example `kpi-dashboard`.
2. Upload every file from this folder, keeping the `assets/` folder.
3. Go to **Settings → Pages → Build and deployment**, set Source to **Deploy from a branch**, and choose `main` / `(root)`. Save.
4. After about a minute your site is live at `https://<your-username>.github.io/kpi-dashboard/`.

---

## The wall TV
- Open one of the TV pages in the TV's browser, or on a mini-PC or Chromecast-style stick, and press **F11** for full screen.
- The pages reload data every 60 seconds and reload themselves every 6 hours. If the network drops, they keep showing the last data they had.
- You can change the slide time with `tv-slides.html?interval=15`.
- On a Fire TV Stick or Android TV, a "kiosk browser" app that opens a fixed URL at startup works well.

---

## Daily use (admin)
1. Open `admin.html` and sign in (with Supabase: your admin email and password).
2. **Daily entry**: pick the date, type each person's quantities, and click **Save changes** (or press Ctrl+S). You can type sums like `86000+20000+7500`, just like in Excel. **Enter** moves to the next box.
3. **Targets**: edit the daily target for each task, or add new tasks. The **Department** column says which department a task's output counts for (see below).
4. **Employees**: add people, change their department, tick the tasks they do, or untick **Show** to hide someone from the TV. Renaming a person keeps their history.

### People who work in two departments
In **Employees**, pick the main department and tick the others under **Also works in**. On the Departments screen that person is listed in each department, scored only on the tasks that count for it (from the **Department** column in **Targets**; tasks without one count for their main department). For example, TH 30 of 60 + Packing 75 of 150 shows as 50% in *TH & 2ply* and 50% in *Packing*, with "100% total" next to their name. Department averages count them as half a person in each, so splitting time never pulls either average down. In the Sheet the Department cell holds the list, main first: `TH & 2ply, Packing`.

You can also view or fix data directly in the Google Sheet. The **Entries** tab has one row per date, employee and task.

## Updating the Apps Script later
> **Photos and task departments need the latest `Code.gs`.** If you deployed an earlier version, paste in the new `Code.gs` and redeploy it as described below. Saving the **Targets** tab once then adds the **Department** column to the Targets sheet.

If you edit `Code.gs`, go to **Deploy → Manage deployments → ✏ Edit**, set Version to **New version**, and click **Deploy**. This keeps the same URL.

## Notes on the data imported from the Excel file
- The 18 sheets became **17 employees**. Piyal's two sheets (TH/2ply and Packing) were merged.
- Column names were standardised: "RT1|RT2 Blank" and "RT2 Blank Sheets" both became **RT Blank Sheets**, "Collating Normal" became **Collating**, "Boxes" became **Packing Boxes**, and "Clean" became **Cleaning**.
- Excel formulas such as `=86000+20000+7500` were converted to their totals. Zero values were skipped.
- Nandani's and Piyal's sheets already contain values for dates up to 14 Oct. Future dates are ignored until they arrive. On 21 Sep, Nandani has TH = 5,000, which gives a very large score, so please check whether that is a typo.

## Security note
With Supabase, every change is checked by the database itself: only signed-in users listed in `public.admins` can write, whatever the web page does. With the Google Sheet, the admin password is checked by the Apps Script, not by the web page. The dashboard data itself can be read by anyone who has the site URL, which is normal for a wall display. Don't put anything sensitive in it.

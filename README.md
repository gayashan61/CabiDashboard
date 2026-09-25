# Production KPI Dashboard

A performance dashboard for a wall TV, hosted free on **GitHub Pages**, with data stored in a **Google Sheet**.

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
- **Kiosk mode:** add `&kiosk=1` to a TV link, for example `tv-slides.html?theme=dark&kiosk=1`, to hide the buttons and navigation for a clean wall display.

### Profile photos
- Go to **Admin → Employees** and click a person's picture or **Upload**. On a phone you can take the photo with the camera.
- The photo is cropped to a square and shrunk automatically, to about 10–30 KB, then saved in the Google Sheet (**Employees** tab, column E). Anyone who has the site link can see the photos, so get staff consent first.
- If someone has no photo, their initials are shown on their department colour. On the TV the ring around each picture shows their status colour.

It runs in **demo mode** until you connect the Google Sheet. In demo mode the password is `admin` and data is saved only in that browser, so you can try everything straight away. Demo mode starts with **8 weeks of generated sample numbers** so the trend charts have history to show. These are not real figures. **Admin → Demo tools** can generate new sample data or switch to only the numbers from your Excel file.

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

## Setup (about 15 minutes)

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
Open `assets/config.js` and paste in the URL:
```js
API_URL: "https://script.google.com/macros/s/XXXXXXXX/exec",
```

### 3. Publish on GitHub Pages
1. Create a new repository on GitHub, for example `kpi-dashboard`.
2. Upload every file from this folder, keeping the `assets/` folder.
3. Go to **Settings → Pages → Build and deployment**, set Source to **Deploy from a branch**, and choose `main` / `(root)`. Save.
4. After about a minute your site is live at `https://<your-username>.github.io/kpi-dashboard/`.

### 4. The wall TV
- Open one of the TV pages in the TV's browser, or on a mini-PC or Chromecast-style stick, and press **F11** for full screen.
- The pages reload data every 60 seconds and reload themselves every 6 hours. If the network drops, they keep showing the last data they had.
- You can change the slide time with `tv-slides.html?interval=15`.
- On a Fire TV Stick or Android TV, a "kiosk browser" app that opens a fixed URL at startup works well.

---

## Daily use (admin)
1. Open `admin.html` and log in.
2. **Daily entry**: pick the date, type each person's quantities, and click **Save changes** (or press Ctrl+S). You can type sums like `86000+20000+7500`, just like in Excel. **Enter** moves to the next box.
3. **Targets**: edit the daily target for each task, or add new tasks.
4. **Employees**: add people, change their department, tick the tasks they do, or untick **Show** to hide someone from the TV. Renaming a person keeps their history.

You can also view or fix data directly in the Google Sheet. The **Entries** tab has one row per date, employee and task.

## Updating the Apps Script later
> **Photos need the latest `Code.gs`.** If you deployed an earlier version, paste in the new `Code.gs` and redeploy it as described below.

If you edit `Code.gs`, go to **Deploy → Manage deployments → ✏ Edit**, set Version to **New version**, and click **Deploy**. This keeps the same URL.

## Notes on the data imported from the Excel file
- The 18 sheets became **17 employees**. Piyal's two sheets (TH/2ply and Packing) were merged.
- Column names were standardised: "RT1|RT2 Blank" and "RT2 Blank Sheets" both became **RT Blank Sheets**, "Collating Normal" became **Collating**, "Boxes" became **Packing Boxes**, and "Clean" became **Cleaning**.
- Excel formulas such as `=86000+20000+7500` were converted to their totals. Zero values were skipped.
- Nandani's and Piyal's sheets already contain values for dates up to 14 Oct. Future dates are ignored until they arrive. On 21 Sep, Nandani has TH = 5,000, which gives a very large score, so please check whether that is a typo.

## Security note
The admin password is checked by the Google Apps Script, not by the web page. The dashboard data itself can be read by anyone who has the site URL, which is normal for a wall display. Don't put anything sensitive in it.

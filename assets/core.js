// Shared data layer + calculations for all pages.
// Data lives in Supabase: like the client's daily sheet, each person gets a count per job per day
// (department ➜ machine ➜ job, e.g. Sheets ➜ RT1 ➜ Blank, each job in its own unit).
// Colours compare a person's count with the average of everyone who did the same job that day.
(function () {
  const CFG = window.KPI_CONFIG;

  const svg = (d, cls = "") => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICONS = {
    camera: svg('<path d="M14.5 4h-5L7.5 6.5H4a2 2 0 0 0-2 2V18a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8.5a2 2 0 0 0-2-2h-3.5z"/><circle cx="12" cy="13" r="3.5"/>'),
    home: svg('<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5"/>'),
    logo: svg('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
    up: svg('<path d="m6 15 6-6 6 6"/>'),
    down: svg('<path d="m6 9 6 6 6-6"/>'),
    dot: svg('<circle cx="12" cy="12" r="4" fill="currentColor"/>'),
    dash: svg('<path d="M6 12h12"/>'),
    sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>', 'i-sun'),
    moon: svg('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>', 'i-moon'),
    expand: svg('<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>'),
    play: svg('<rect x="3" y="4" width="18" height="14" rx="2"/><path d="m10 8 5 3-5 3z"/><path d="M8 21h8"/>'),
    grid: svg('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'),
    list: svg('<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>'),
    edit: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
    trophy: svg('<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>'),
    logout: svg('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>'),
    external: svg('<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>'),
    calendar: svg('<rect x="3" y="4.5" width="18" height="16.5" rx="2"/><path d="M16 2.5v4M8 2.5v4M3 10h18"/>'),
    chevL: svg('<path d="m15 18-6-6 6-6"/>'),
    chevR: svg('<path d="m9 18 6-6-6-6"/>'),
    chevU: svg('<path d="m18 15-6-6-6 6"/>'),
    chevD: svg('<path d="m6 9 6 6 6-6"/>'),
    playSolid: svg('<path d="M7 4.5v15l12.5-7.5z" fill="currentColor"/>'),
    pause: svg('<rect x="6" y="4.5" width="4" height="15" rx="1" fill="currentColor"/><rect x="14" y="4.5" width="4" height="15" rx="1" fill="currentColor"/>'),
    search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
    close: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
    trash: svg('<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>'),
    download: svg('<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>'),
    more: svg('<circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/>'),
  };

  // Day chosen with the header date picker (?date=YYYY-MM-DD). null = live (follows DISPLAY_DAY).
  let pickedDay = new URLSearchParams(location.search).get("date");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(pickedDay || "")) pickedDay = null;
  let lastData = null;
  let rerender = null;
  let reload = null;      // fetch again now (set by autoRefresh)
  let loadedDays = 0;     // how many days of history the last load asked for
  let shownDay = null;
  // Period of the profile bar chart (daily / weekly / monthly / yearly), remembered per viewer.
  let period = "daily";
  try { period = localStorage.getItem("kpi_period") || "daily"; } catch (e) {}
  const chartJob = {};    // person ➜ job id their profile charts show (people who do several jobs)
  let deptOrder = [];     // department names in display order (for colours)

  let chartId = 0;
  // ───────── helpers ─────────
  const pad = (n) => String(n).padStart(2, "0");
  const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseDay = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parseDay(s); d.setDate(d.getDate() + n); return dayKey(d); };
  const todayKey = () => dayKey(new Date());
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

  const fmtNum = (n) => {
    if (n == null || isNaN(n)) return "–";
    const a = Math.abs(n);
    if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/, "") + "M";
    if (a >= 1e4) return (n / 1e3).toFixed(a >= 1e5 ? 0 : 1).replace(/\.0$/, "") + "k";
    return Math.round(n).toLocaleString();
  };
  const fmtFull = (n) => (n == null ? "–" : Math.round(n).toLocaleString());
  const fmtDate = (s, opts = { weekday: "short", day: "numeric", month: "short" }) =>
    parseDay(s).toLocaleDateString(undefined, opts);

  // Allows admin to type "86000+20000+7500" like in Excel.
  const parseQty = (v) => {
    if (v == null) return null;
    const s = String(v).replace(/[,\s]/g, "").replace(/^=/, "");
    if (s === "") return null;
    if (!/^\d+(\.\d+)?(\+\d+(\.\d+)?)*$/.test(s)) return NaN;
    return s.split("+").reduce((a, b) => a + Number(b), 0);
  };

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // ───────── Supabase ─────────
  // Plain REST calls (no library): reads use the public key; admin changes use the signed-in admin's token.
  const SB_URL = String(CFG.SUPABASE_URL || "").replace(/\/+$/, "");
  const SB_SESSION = "kpi_sb_session";
  let sbSession = null;
  try { sbSession = JSON.parse(sessionStorage.getItem(SB_SESSION)); } catch (e) {}
  function sbKeep(s) {
    sbSession = s ? { access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at || Math.floor(Date.now() / 1000) + (s.expires_in || 3600), email: s.user?.email || s.email } : null;
    try { if (sbSession) sessionStorage.setItem(SB_SESSION, JSON.stringify(sbSession)); else sessionStorage.removeItem(SB_SESSION); } catch (e) {}
  }
  function sbError(j, status) {
    const m = (j && (j.message || j.msg || j.error_description || j.error)) || `Request failed (${status})`;
    if (j && (j.code === "42501" || /row-level security|permission denied|not an admin/i.test(m))) return "Not allowed: this account is not an admin";
    if (j && (j.error_code === "invalid_credentials" || j.error === "invalid_grant" || /invalid login/i.test(m))) return "Wrong email or password";
    if (j && j.error_code === "email_not_confirmed") return "This email is not confirmed yet — confirm it in Supabase ➜ Authentication ➜ Users";
    if (/JWT|refresh token/i.test(m)) return "Your sign-in has expired — please sign in again";
    if (j && (j.code === "PGRST202" || /could not find the function/i.test(m))) return DB_OUTDATED;
    return m;
  }
  const DB_OUTDATED = "The database needs updating: run supabase/migrations/2026-09-29_jobs.sql and then supabase/schema.sql in the Supabase SQL Editor.";
  async function sbFetch(path, body, { user = false } = {}) {
    if (!SB_URL || !CFG.SUPABASE_KEY) throw new Error("Supabase is not set up: fill in SUPABASE_URL and SUPABASE_KEY in assets/config.js.");
    const headers = { apikey: CFG.SUPABASE_KEY, "Content-Type": "application/json" };
    if (user) headers.Authorization = "Bearer " + (await sbToken());
    const r = await fetch(SB_URL + path, { method: "POST", headers, body: JSON.stringify(body ?? {}) });
    const text = await r.text();
    let j = null; try { j = text ? JSON.parse(text) : null; } catch (e) {}
    if (!r.ok) throw new Error(sbError(j, r.status));
    return j;
  }
  // The admin's access token, refreshed a minute before it expires.
  async function sbToken() {
    if (!sbSession) throw new Error("Please sign in again");
    if (Date.now() / 1000 > sbSession.expires_at - 60) {
      try { sbKeep(await sbFetch("/auth/v1/token?grant_type=refresh_token", { refresh_token: sbSession.refresh_token })); }
      catch (e) { sbKeep(null); throw new Error("Your sign-in has expired — please sign in again"); }
    }
    return sbSession.access_token;
  }
  const sbRpc = (fn, args, opts) => sbFetch("/rest/v1/rpc/" + fn, args, opts);

  // ───────── status: count compared with the job's average that day ─────────
  // ratio 1 = exactly the average of everyone who did that job. THRESHOLDS are in % of that average.
  function status(ratio) {
    if (ratio == null) return { key: "none", label: "No entry", icon: ICONS.dash };
    const pct = ratio * 100;
    if (pct >= CFG.THRESHOLDS.good) return { key: "good", label: "Above avg", icon: ICONS.up };
    if (pct >= CFG.THRESHOLDS.warning) return { key: "warning", label: "Near avg", icon: ICONS.dot };
    return { key: "critical", label: "Below avg", icon: ICONS.down };
  }
  // "+12% vs avg" / "−8% vs avg" / "= avg"
  const vsAvg = (ratio) => {
    if (ratio == null) return "";
    const d = Math.round((ratio - 1) * 100);
    return d === 0 ? "at avg" : (d > 0 ? "+" : "−") + Math.abs(d) + "% vs avg";
  };
  // Bar width for a ratio: bars run to 150% of the average; the tick marks the average.
  const BAR_MAX = 1.5;
  const ratioW = (r) => (r == null ? 0 : Math.min(r, BAR_MAX) / BAR_MAX * 100);
  const AVG_TICK = 100 / BAR_MAX;

  // The company logo (on a white tile, see .brand-mark) — used in every header, the start page and sign-in
  const LOGO = `<img src="assets/logo.png" alt="${String(CFG.APP_NAME || "TilJay").replace(/"/g, "")} logo" width="256" height="256" decoding="async">`;

  const KPI = {
    CFG, ICONS, LOGO, dayKey, parseDay, addDays, todayKey, fmtNum, fmtFull, fmtDate, parseQty, esc, mean,
    DB_OUTDATED, status, vsAvg, ratioW, AVG_TICK,

    async load(days = 60) {
      const j = await sbRpc("get_data", { days });
      if (!j || !Array.isArray(j.jobs)) throw new Error(DB_OUTDATED); // still an older database
      return normalise(j);
    },
    // Cheap "has anything changed?" check
    async version() { return sbRpc("data_version", {}); },

    async auth(password, email) {
      sbKeep(await sbFetch("/auth/v1/token?grant_type=password", { email, password }));
      if (!(await sbRpc("is_admin", {}, { user: true }))) {
        await KPI.logout();
        throw new Error("Signed in, but this account is not an admin yet — see README ➜ Admin logins");
      }
      return true;
    },
    // Is someone still signed in from earlier in this tab?
    async resume() {
      if (!sbSession) return false;
      try { return !!(await sbRpc("is_admin", {}, { user: true })); } catch (e) { sbKeep(null); return false; }
    },
    signedInAs() { return sbSession?.email || ""; },
    async logout() {
      if (sbSession) { try { await sbFetch("/auth/v1/logout", {}, { user: true }); } catch (e) {} }
      sbKeep(null);
    },

    // rows: [{employee, job, qty}] — qty null/'' deletes the cell
    async saveEntries(date, rows) { await sbRpc("save_entries", { p_date: date, p_rows: rows }, { user: true }); },
    // rows: [{name, unit, renamedFrom?}] in display order
    async saveDepartments(rows) { await sbRpc("save_departments", { p_rows: rows }, { user: true }); },
    // rows: [{id?, department, machine, name, unit}] in display order — jobs left out are hidden
    async saveJobs(rows) { await sbRpc("save_jobs", { p_rows: rows }, { user: true }); },
    // rows: [{name, department ("Main, Other"), active, photo, renamedFrom?}] in display order
    async saveEmployees(rows) { await sbRpc("save_employees", { p_rows: rows }, { user: true }); },

    // ───────── departments & jobs ─────────
    deptNames(data) { return data.departments.map((d) => d.name); },
    // The unit a department's total counts (its jobs in other units are shown on their own)
    unit(data, dept) { return data.deptByName[dept]?.unit || "pcs"; },
    // Department colours come from theme tokens (--dept-1 … --dept-8) so they adapt to light/dark.
    deptColor(name) {
      const i = deptOrder.indexOf(name);
      return i < 0 ? "var(--muted)" : `var(--dept-${(i % 8) + 1})`;
    },
    // "■ Sheets  ■ Sets" with a colour dot per department
    deptLabel(p) {
      return p.departments.map((d) => `<span class="dept-lbl"><span class="dept-dot" style="background:${KPI.deptColor(d)}"></span>${esc(d)}</span>`).join("");
    },
    // "RT1 Blank", "Printed" — the machine (if any) and the job, as on the sheet
    jobLabel(job) { return job ? [job.machine, job.name].filter(Boolean).join(" ") : "?"; },

    // ───────── calculations ─────────
    displayDay(data) { return pickedDay || KPI.liveDay(data); },
    liveDay(data) {
      const t = todayKey();
      if (CFG.DISPLAY_DAY === "today") return t;
      let best = null;
      data.entries.forEach((e) => { if (e.date <= t && (!best || e.date > best)) best = e.date; });
      return best || t;
    },
    // Last n working days ending at `day` (inclusive)
    workDays(day, n) {
      const out = []; let d = day; let guard = 0;
      while (out.length < n && guard++ < n * 3) {
        if (CFG.WORK_DAYS.includes(parseDay(d).getDay())) out.unshift(d);
        d = addDays(d, -1);
      }
      return out;
    },
    // One job on one day: total, how many people did it, their average.
    jobDay(data, id, day) {
      const k = day + "|" + id;
      if (!data.jobDayCache[k]) {
        const qs = data.byJobDay[k] || [];
        const total = qs.reduce((a, b) => a + b, 0);
        data.jobDayCache[k] = { total: qs.length ? total : null, n: qs.length, avg: qs.length ? total / qs.length : null };
      }
      return data.jobDayCache[k];
    },
    // One department on one day: total in the department's unit, the other units' totals, people who logged.
    deptDay(data, dept, day) {
      const x = data.byDeptDay[day + "|" + dept];
      const unit = KPI.unit(data, dept);
      if (!x) return { total: null, n: 0, others: [] };
      return {
        total: x.units[unit] ?? null, n: x.people.size,
        others: Object.entries(x.units).filter(([u]) => u !== unit).map(([u, total]) => ({ unit: u, total })),
      };
    },
    // One person on one job on a day (null = no count that day)
    empJobDay(data, name, id, day) {
      const q = data.byKey[day + "|" + name]?.[id];
      if (q == null) return null;
      const jd = KPI.jobDay(data, id, day);
      return { qty: q, ratio: jd.avg ? q / jd.avg : null, avg: jd.avg, n: jd.n };
    },
    // A person's counts for one day: [{id, dept, label, qty, unit, avg, n, ratio}] in sheet order.
    // index = their counts compared with each job's average (1 = average), used for colour and ranking.
    empDay(data, name, day) {
      const rows = data.byKey[day + "|" + name] || {};
      const parts = data.jobs.filter((j) => rows[j.id] != null).map((j) => ({
        id: j.id, dept: j.department, label: KPI.jobLabel(j), unit: j.unit, ...KPI.empJobDay(data, name, j.id, day),
      }));
      return { parts, has: parts.length > 0, index: parts.length ? mean(parts.map((p) => p.ratio ?? 1)) : null };
    },
    // Average count per working day over the last 7 working days (days with a count only)
    weekAvg(data, name, id, day) {
      if (id == null) return null;
      return mean(KPI.workDays(day, 7).map((d) => KPI.empJobDay(data, name, id, d)?.qty).filter((v) => v != null));
    },
    // Jobs a person has done lately, most frequent first (for their profile chart)
    recentJobs(data, name) { return data.jobsByEmp[name] || []; },
    // Their biggest count of the day — the one shown in big numbers
    topPart(parts) { return parts.reduce((a, b) => (!a || b.qty > a.qty ? b : a), null); },

    empSummary(data, emp, day) {
      const today = KPI.empDay(data, emp.name, day);
      const week = KPI.workDays(day, 7).map((d) => KPI.empDay(data, emp.name, d));
      const mainPart = KPI.topPart(today.parts);
      // The job their small charts follow: today's main one, else the one they do most
      const mainJob = mainPart?.id ?? KPI.recentJobs(data, emp.name)[0] ?? null;
      return {
        ...emp, today, mainPart, mainJob,
        weekIndex: mean(week.map((w) => w.index).filter((v) => v != null)),
        daysWorked: week.filter((w) => w.has).length,
        mainWeekAvg: KPI.weekAvg(data, emp.name, mainJob, day),
      };
    },
    summaries(data, day) {
      return data.employees.filter((e) => e.active !== false).map((e) => KPI.empSummary(data, e, day));
    },
    // Everyone in a department (or who did one of its jobs that day), best first.
    // dept = { parts, top, ratio }: their jobs in this department, the biggest one, and the average of their ratios.
    deptPeople(data, people, dept, day) {
      return people.map((p) => {
        const parts = p.today.parts.filter((t) => t.dept === dept);
        const top = KPI.topPart(parts);
        return { ...p, dept: parts.length ? { parts, top, ratio: mean(parts.map((t) => t.ratio ?? 1)) } : null, deptWeekAvg: top ? KPI.weekAvg(data, p.name, top.id, day) : null };
      }).filter((p) => p.dept || p.departments.includes(dept))
        .sort((a, b) => (b.dept?.ratio ?? -1) - (a.dept?.ratio ?? -1) || (b.dept?.top.qty ?? -1) - (a.dept?.top.qty ?? -1) || a.name.localeCompare(b.name));
    },
    // Department total for the last n working days: [{day, v}]
    deptSeries(data, dept, day, n) {
      return KPI.workDays(day, n).map((d) => ({ day: d, v: KPI.deptDay(data, dept, d).total }));
    },
    // Average daily department total over the 7 working days before `day` (days with counts only)
    deptWeekAvg(data, dept, day) {
      return mean(KPI.workDays(addDays(day, -1), 7).map((d) => KPI.deptDay(data, dept, d).total).filter((v) => v != null));
    },
    // A person's count on one job for the last n working days: [{day, v, st}]
    empJobSeries(data, name, id, day, n) {
      return KPI.workDays(day, n).map((d) => { const x = id == null ? null : KPI.empJobDay(data, name, id, d); return { day: d, v: x?.qty ?? null, st: x ? status(x.ratio).key : null }; });
    },

    // ───────── profile chart periods ─────────
    PERIODS: {
      daily: { label: "Daily", title: "Last 7 working days", sub: "count per day", days: 14 },
      weekly: { label: "Weekly", title: "Last 8 weeks", sub: "total per week", days: 60 },
      monthly: { label: "Monthly", title: "Last 12 months", sub: "total per month", days: 370 },
      yearly: { label: "Yearly", title: "By year", sub: "total per year", days: 5 * 366 },
    },
    period() { return period; },
    setPeriod(p) {
      if (!KPI.PERIODS[p] || p === period) return;
      period = p;
      try { localStorage.setItem("kpi_period", p); } catch (e) {}
      KPI.refresh();
    },
    setChartJob(name, id) { chartJob[name] = id; KPI.refresh(); },
    // Bars for the profile chart: [{ label, v, days, cur, title }] — v = total count on that job in that bucket.
    periodBars(data, name, id, day, per = period) {
      const sum = (from, to) => {
        let v = 0, days = 0;
        for (let d = from; d <= to && d <= day; d = addDays(d, 1)) { const x = id == null ? null : KPI.empJobDay(data, name, id, d); if (x) { v += x.qty; days++; } }
        return { v: days ? v : null, days };
      };
      const D = parseDay(day);
      if (per === "weekly") {
        const monday = addDays(day, -((D.getDay() + 6) % 7));
        return [...Array(8)].map((_, i) => {
          const from = addDays(monday, (i - 7) * 7);
          return { label: fmtDate(from, { day: "numeric", month: "short" }), cur: i === 7, title: "Week of " + fmtDate(from), ...sum(from, addDays(from, 6)) };
        });
      }
      if (per === "monthly") {
        return [...Array(12)].map((_, i) => {
          const m = new Date(D.getFullYear(), D.getMonth() - 11 + i, 1);
          const last = new Date(m.getFullYear(), m.getMonth() + 1, 0);
          return { label: m.toLocaleDateString(undefined, { month: "short" }) + (m.getMonth() === 0 || i === 0 ? " " + String(m.getFullYear()).slice(2) : ""), cur: i === 11, title: m.toLocaleDateString(undefined, { month: "long", year: "numeric" }), ...sum(dayKey(m), dayKey(last)) };
        });
      }
      if (per === "yearly") {
        const bars = [...Array(5)].map((_, i) => {
          const y = D.getFullYear() - 4 + i;
          return { label: String(y), cur: i === 4, title: String(y), ...sum(`${y}-01-01`, `${y}-12-31`) };
        });
        while (bars.length > 1 && bars[0].v == null) bars.shift(); // start at the first year with data
        return bars;
      }
      return KPI.workDays(day, 7).map((d) => ({ label: fmtDate(d, { weekday: "short", day: "numeric" }), cur: d === day, title: fmtDate(d), ...sum(d, d) }));
    },

    pill(ratio, label) {
      const st = status(ratio);
      return `<span class="pill pill-${st.key}">${st.icon}${esc(label || st.label)}</span>`;
    },
    initials(name) {
      const parts = String(name || "?").trim().split(/\s+/);
      return ((parts[0] || "?")[0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
    },
    // Profile picture (or initials on the department colour). `ring` = status key for a coloured ring.
    avatar(p, { cls = "", ring = "", size = "" } = {}) {
      const inner = p.photo
        ? `<img src="${esc(p.photo)}" alt="" loading="lazy" decoding="async">`
        : `<span>${esc(KPI.initials(p.name))}</span>`;
      return `<span class="av ${cls} ${ring ? "ring ring-" + ring : ""}" style="--dc:${KPI.deptColor(p.department)}${size ? ";--size:" + size : ""}" title="${esc(p.name)}">${inner}</span>`;
    },
    // Crops the centre square, resizes and compresses so the photo stays small (< 40,000 characters).
    async resizePhoto(file, size = 220) {
      if (!file || !/^image\//.test(file.type)) throw new Error("Please choose an image file");
      const url = URL.createObjectURL(file);
      try {
        const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("Could not read that image")); i.src = url; });
        const side = Math.min(img.naturalWidth, img.naturalHeight);
        const sx = (img.naturalWidth - side) / 2, sy = (img.naturalHeight - side) / 2;
        let dim = size, q = 0.85, out = "";
        for (let tries = 0; tries < 8; tries++) {
          const c = document.createElement("canvas"); c.width = c.height = dim;
          const ctx = c.getContext("2d");
          ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, dim, dim);
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(img, sx, sy, side, side, 0, 0, dim, dim);
          out = c.toDataURL("image/jpeg", q);
          if (out.length < 40000) return out;
          if (q > 0.55) q -= 0.1; else dim = Math.round(dim * 0.85);
        }
        return out;
      } finally { URL.revokeObjectURL(url); }
    },

    // ───────── charts ─────────
    // Smooth area/line chart of counts. SVG draws the shapes (stretched to fit), HTML draws dots and labels
    // so text never distorts. series: [{day, v, st?}] (st = status key for the dot colour).
    // opts: mini (no axes), values ("last" | "all" | "none"), color, ref (dashed reference value, e.g. an average), refLabel.
    trendChart(series, { mini = false, values = "last", color = "var(--accent)", ref = null, refLabel = "avg", xLabels = 6 } = {}) {
      const id = "tc" + (++chartId);
      const pts = series.map((p) => p.v ?? null);
      const valid = pts.filter((v) => v != null);
      const max = Math.max(1, (ref || 0) * 1.25, ...valid.map((v) => v * 1.15));
      const n = series.length;
      const padX = mini ? 3 : 2.5;
      const X = (i) => (n <= 1 ? 50 : padX + (i / (n - 1)) * (100 - padX * 2));
      const Y = (v) => 100 - (v / max) * 100;
      // contiguous runs (gaps = no entry)
      const runs = []; let cur = [];
      pts.forEach((v, i) => { if (v == null) { if (cur.length) runs.push(cur); cur = []; } else cur.push([X(i), Y(v)]); });
      if (cur.length) runs.push(cur);
      const smooth = (r) => {
        if (r.length === 1) return `M${r[0][0]} ${r[0][1]}`;
        let d = `M${r[0][0]} ${r[0][1]}`;
        for (let i = 0; i < r.length - 1; i++) {
          const p0 = r[i - 1] || r[i], p1 = r[i], p2 = r[i + 1], p3 = r[i + 2] || p2;
          const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
          const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
          d += ` C${c1[0].toFixed(2)} ${Math.min(100, c1[1]).toFixed(2)} ${c2[0].toFixed(2)} ${Math.min(100, c2[1]).toFixed(2)} ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
        }
        return d;
      };
      const lines = runs.map(smooth);
      const areas = runs.map((r, k) => r.length > 1 ? `${lines[k]} L${r[r.length - 1][0]} 100 L${r[0][0]} 100 Z` : "");
      // "nice" gridlines: 1, 2 or 5 × a power of ten, about three of them
      const raw = max / 3, pow = Math.pow(10, Math.floor(Math.log10(raw))), step = [1, 2, 5, 10].find((m) => m * pow >= raw) * pow;
      // (a gridline right next to the reference line would print its label on top of it)
      const grid = mini ? [] : [1, 2, 3, 4].map((k) => k * step).filter((g) => g < max && !(ref && Math.abs(g - ref) < max * 0.08));
      const lastIdx = pts.map((v, i) => (v == null ? -1 : i)).filter((i) => i >= 0).pop();
      const dots = pts.map((v, i) => {
        if (v == null) return "";
        const isLast = i === lastIdx;
        if (mini && !isLast) return "";
        const st = series[i].st;
        const c = st ? `var(--${st})` : color;
        const showVal = !mini && (values === "all" || (values === "last" && isLast));
        return `<i class="tc-dot ${isLast ? "last" : ""}" style="left:${X(i)}%;bottom:${100 - Y(v)}%;--c:${c}" title="${esc(fmtDate(series[i].day))}: ${fmtFull(v)}"></i>` +
          (showVal ? `<span class="tc-val ${st ? "st-" + st : ""}" style="left:${X(i)}%;bottom:${100 - Y(v)}%">${fmtNum(v)}</span>` : "");
      }).join("");
      const xstep = Math.max(1, Math.ceil(n / xLabels));
      const xl = mini ? "" : `<div class="tc-x">${series.map((p, i) => (i % xstep === 0 || i === n - 1) && !(i !== n - 1 && n - 1 - i < xstep / 2)
        ? `<span style="left:${X(i)}%">${esc(fmtDate(p.day, { day: "numeric", month: "short" }))}</span>` : "").join("")}</div>`;
      return `<div class="tc ${mini ? "mini" : ""}" style="--lc:${color}">
        <div class="tc-plot">
          ${grid.map((g) => `<div class="tc-grid" style="bottom:${100 - Y(g)}%"><span>${fmtNum(g)}</span></div>`).join("")}
          ${ref ? `<div class="tc-target" style="bottom:${100 - Y(ref)}%">${mini ? "" : `<span>${fmtNum(ref)}<b>${esc(refLabel)}</b></span>`}</div>` : ""}
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity="0.32"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
            ${areas.map((d) => d && `<path d="${d}" fill="url(#${id})"/>`).join("")}
            ${lines.map((d) => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${mini ? 2 : 3}" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>`).join("")}
          </svg>
          ${dots}
        </div>${xl}</div>`;
    },

    // "today", or "on Sat 20 Sep" when looking at another day
    dayWord(day) { return day === todayKey() ? "today" : "on " + fmtDate(day); },

    // One person's full profile: header card, today's counts + trend, and the period chart.
    // Used by the slideshow and the team grid's profile view.
    personView(p, day, data) {
      const st = status(p.today.index); // colour = all their jobs today against each job's average
      // Job the charts show: chosen chip, else today's main one (or the one they do most)
      const choices = [...new Set([...p.today.parts.map((t) => t.id), ...KPI.recentJobs(data, p.name)])].slice(0, 4);
      const cj = data.jobById[chartJob[p.name]] ? chartJob[p.name] : p.mainJob;
      if (cj != null && !choices.includes(cj)) choices.unshift(cj);
      const job = data.jobById[cj];
      const color = KPI.deptColor(job?.department), unit = job?.unit || "";
      const jobName = job ? `${job.department} · ${KPI.jobLabel(job)}` : "no counts yet";
      const todayRows = p.today.parts.length ? p.today.parts.map((t) => {
        const s = status(t.ratio);
        return `<div><div class="task-h"><span title="${esc(t.dept)}"><span class="dept-dot" style="background:${KPI.deptColor(t.dept)}"></span>${esc(t.label)}</span><span><b>${fmtFull(t.qty)}</b> <span class="of">${esc(t.unit)}</span>&nbsp; ${KPI.pill(t.ratio, t.n > 1 ? vsAvg(t.ratio) : "only one")}</span></div>
          <div class="bar" title="Average of the ${t.n} ${t.n === 1 ? "person" : "people"} on this task: ${fmtFull(t.avg)} ${esc(t.unit)}"><span class="bg-${s.key}" style="width:${ratioW(t.ratio)}%"></span><i class="tgt" style="left:${AVG_TICK}%"></i></div></div>`;
      }).join("") : `<div class="empty" style="text-align:left;padding:1rem 0">No count recorded for this day yet.</div>`;
      const trend = KPI.empJobSeries(data, p.name, cj, day, 20);
      const per = KPI.PERIODS[period] ? period : "daily";
      const bars = KPI.periodBars(data, p.name, cj, day, per);
      const barAvg = mean(bars.map((b) => b.v).filter((v) => v != null));
      const max = Math.max(1, (barAvg || 0) * 1.25, ...bars.map((t) => (t.v || 0) * 1.18));
      const cols = bars.map((t) => {
        const h = t.v == null ? 0 : t.v / max * 100;
        const tip = `${t.title}: ${t.v == null ? "no counts" : fmtFull(t.v) + " " + unit}${per === "daily" || t.v == null ? "" : ` · ${t.days} day${t.days === 1 ? "" : "s"} worked · ${fmtFull(t.v / t.days)} per day`}`;
        return `<div class="c7 ${t.cur ? "today" : ""}" title="${esc(tip)}"><div class="c7-track">
          <div class="c7-b" style="height:${h}%;background-color:${color}"></div>
          <div class="c7-v" style="bottom:calc(${h}% + 0.35rem)"><span>${t.v == null ? "–" : fmtNum(t.v)}</span></div></div>
          <div class="c7-d">${esc(t.label)}</div></div>`;
      }).join("");
      const seg = Object.entries(KPI.PERIODS).map(([k, v]) => `<button type="button" data-period="${k}" class="${k === per ? "on" : ""}" aria-pressed="${k === per}">${v.label}</button>`).join("");
      const chips = choices.length > 1 ? `<div class="pseg" role="group" aria-label="Task">${choices.map((id) => { const j = data.jobById[id]; return `<button type="button" data-pjob="${id}" data-person="${esc(p.name)}" class="${id === cj ? "on" : ""}" aria-pressed="${id === cj}" title="${esc(j.department)}"><span class="dept-dot" style="background:${KPI.deptColor(j.department)}"></span>${esc(KPI.jobLabel(j))}</button>`; }).join("")}</div>` : "";
      const best = Math.max(...trend.slice(-7).map((t) => t.v ?? -1));
      return `
        <div class="card ps-head" style="--dc:${KPI.deptColor(p.department)}">
          ${KPI.avatar(p, { cls: "xl", ring: st.key })}
          <div class="ps-id"><div class="ps-name">${esc(p.name)}</div><div class="ps-dept">${KPI.deptLabel(p)}</div></div>
          <div class="ps-mini"><div>7-day avg<b>${fmtNum(KPI.weekAvg(data, p.name, cj, day))}</b></div><div>Best day<b>${best < 0 ? "–" : fmtNum(best)}</b></div><div>Days worked<b>${p.daysWorked}</b></div></div>
          <div class="ps-score"><div class="big st-${st.key}">${p.mainPart ? fmtFull(p.mainPart.qty) : "–"}<small>${p.mainPart ? esc(p.mainPart.unit) : ""}</small></div>${KPI.pill(p.today.index, p.mainPart ? `${st.label} · ${p.mainPart.label}` : "No entry yet")}</div>
        </div>
        <div class="card panel"><div class="card-h"><h2 class="card-title">${day === todayKey() ? "Today's count" : "Count · " + esc(fmtDate(day))}</h2><span class="card-sub">tick = average of everyone on that task</span></div><div class="tasks">${todayRows}</div>
          <div class="card-h" style="margin-top:1.6rem"><h2 class="card-title">Trend <span class="card-sub">· ${esc(jobName)} · last 20 working days</span></h2></div>
          <div class="chart-fill">${KPI.trendChart(trend, { values: "last", xLabels: matchMedia("(max-width: 720px)").matches ? 3 : 5, color, ref: mean(trend.map((t) => t.v).filter((v) => v != null)), refLabel: "avg" })}</div></div>
        <div class="card panel"><div class="card-h"><h2 class="card-title">${KPI.PERIODS[per].title} <span class="card-sub">· ${KPI.PERIODS[per].sub}${unit ? " · " + esc(unit) : ""}</span></h2><div class="pbtns">${chips}<div class="pseg" role="group" aria-label="Chart period">${seg}</div></div></div>
          <div class="chart-area"><div class="cols7 n${bars.length}">${cols}</div></div>
          <div class="note">${esc(jobName)}${unit ? ` in ${esc(unit)}` : ""}${barAvg != null ? ` · average ${fmtFull(barAvg)} per ${per === "daily" ? "day" : per.replace(/ly$/, "")}` : ""}</div></div>`;
    },

    // Query string for links between screens (keeps ?theme, ?kiosk, ?date …)
    linkQs() { return location.search; },

    // Header date picker: null = back to live.
    setDay(day) {
      const t = todayKey();
      if (day && day > t) day = t;
      if (day && lastData && day === KPI.liveDay(lastData)) day = null;
      pickedDay = day;
      const qs = new URLSearchParams(location.search);
      if (day) qs.set("date", day); else qs.delete("date");
      const s = qs.toString();
      history.replaceState(null, "", location.pathname + (s ? "?" + s : "") + location.hash);
      document.querySelectorAll("[data-nav]").forEach((a) => (a.href = a.dataset.nav + KPI.linkQs()));
      KPI.refresh();
    },
    // Days of history the screen needs: back to the day shown (or the calendar month open),
    // plus enough before it for the trend lines and the profile chart period.
    neededDays() {
      const ago = (d) => Math.round((parseDay(todayKey()) - parseDay(d)) / 864e5);
      const back = Math.max(ago(pickedDay || todayKey()), calFrom ? ago(calFrom) : 0);
      return back + Math.max(60, KPI.PERIODS[period]?.days || 0);
    },
    // Redraw after a date / period change, fetching more history first when needed.
    refresh() {
      if (reload && KPI.neededDays() > loadedDays) return reload();
      if (rerender) rerender();
    },
    // Previous / next working day from the day on screen (never past today).
    stepDay(dir) {
      let d = shownDay || todayKey();
      for (let i = 0; i < 14; i++) {
        d = addDays(d, dir);
        if (CFG.WORK_DAYS.includes(parseDay(d).getDay())) break;
      }
      if (d > todayKey()) return;
      KPI.setDay(d);
    },

    // Shared TV header: title, date shown (with picker), clock, last-updated
    mountHeader(el, title, active) {
      const views = [["tv-slides.html", "Slideshow", ICONS.play], ["tv-grid.html", "Team grid", ICONS.grid], ["tv-departments.html", "Departments", ICONS.list]];
      const qs = KPI.linkQs();
      el.innerHTML = `
        <a class="brand" href="index.html${qs}" data-nav="index.html" title="Home" style="color:inherit;text-decoration:none"><div class="brand-mark">${LOGO}</div>
          <div class="brand-text"><div class="brand-eyebrow">${esc(CFG.APP_NAME || CFG.COMPANY_NAME)}</div><div class="brand-title">${esc(title)}</div></div></a>
        <nav class="seg" aria-label="Views">${views.map(([h, l, i]) => `<a href="${h}${qs}" data-nav="${h}" class="${h === active ? "on" : ""}">${i}${l}</a>`).join("")}</nav>
        <div class="hdr-spacer"></div>
        <div class="hdr-date">
          <div class="hdr-day-row">
            <button class="icon-btn date-btn" id="day-prev" title="Previous working day" aria-label="Previous working day">${ICONS.chevL}</button>
            <button class="date-pick" id="day-pick" title="Pick a date to view" aria-haspopup="dialog" aria-expanded="false"><span class="d" id="hdr-day">&nbsp;</span>${ICONS.calendar}</button>
            <button class="icon-btn date-btn" id="day-next" title="Next working day" aria-label="Next working day">${ICONS.chevR}</button>
          </div>
          <div class="cal" id="cal" role="dialog" aria-label="Choose a date" hidden></div>
          <div class="s"><span class="live"></span><span id="hdr-upd">Loading…</span><button class="hdr-live-btn" id="day-live" hidden>Back to live</button></div>
        </div>
        <div class="hdr-clock" id="hdr-clock"></div>
        <div class="hdr-actions">
          <a class="icon-btn" href="index.html${qs}" data-nav="index.html" title="Home" aria-label="Home">${ICONS.home}</a>
          <button class="icon-btn theme-toggle" id="theme-btn" title="Switch light / dark theme" aria-label="Switch light or dark theme">${ICONS.moon}${ICONS.sun}</button>
          <button class="icon-btn" id="fs-btn" title="Full screen" aria-label="Full screen">${ICONS.expand}</button>
        </div>`;
      const tick = () => { document.getElementById("hdr-clock").textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); };
      tick(); setInterval(tick, 10000);
      document.getElementById("theme-btn").onclick = () => window.KPITheme.toggle();
      document.getElementById("fs-btn").onclick = () => {
        if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.();
      };
      document.getElementById("day-prev").onclick = () => KPI.stepDay(-1);
      document.getElementById("day-next").onclick = () => KPI.stepDay(1);
      document.getElementById("day-live").onclick = () => KPI.setDay(null);
      mountCalendar();
      // Profile chart buttons (slideshow + team grid): period, and department for people in several
      document.addEventListener("click", (e) => {
        const b = e.target.closest("[data-period]"); if (b) KPI.setPeriod(b.dataset.period);
        const j = e.target.closest("[data-pjob]"); if (j) KPI.setChartJob(j.dataset.person, Number(j.dataset.pjob));
      });
    },
    setHeaderDay(day) {
      shownDay = day;
      const t = todayKey();
      const opts = { weekday: "long", day: "numeric", month: "long" };
      if (day.slice(0, 4) !== t.slice(0, 4)) opts.year = "numeric";
      const prefix = day === t ? "Today · " : pickedDay ? "" : "Latest · ";
      document.getElementById("hdr-day").textContent = prefix + fmtDate(day, opts);
      document.getElementById("hdr-upd").textContent = pickedDay
        ? (day === t ? "Pinned to today · " : "Viewing a past day · ")
        : "Live · updated " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      document.getElementById("day-live").hidden = !pickedDay;
      document.body.classList.toggle("history", !!pickedDay);
      document.getElementById("day-next").disabled = day >= t;
    },

    // A message across the screen when the data can't be loaded (setup problem or no connection yet)
    showProblem(msg) {
      let el = document.getElementById("load-problem");
      if (!msg) { el?.remove(); return; }
      if (!el) { el = document.createElement("div"); el.id = "load-problem"; el.className = "load-problem"; el.setAttribute("role", "alert"); document.body.appendChild(el); }
      el.textContent = msg;
    },

    // Runs render(data) now and every REFRESH_SECONDS; keeps last good data on network errors.
    autoRefresh(render) {
      let last = null;
      rerender = () => { if (last) render(last); drawCal(); };
      const run = async () => {
        const days = KPI.neededDays();
        try {
          if (last?.version && days <= loadedDays && (await KPI.version()) === last.version) {
            render(last); drawCal(); document.body.classList.remove("offline"); return; // nothing new
          }
          last = lastData = await KPI.load(days);
          loadedDays = days;
          render(last); drawCal(); document.body.classList.remove("offline"); KPI.showProblem(null);
        }
        catch (e) {
          console.error(e); document.body.classList.add("offline");
          if (last) render(last); else KPI.showProblem(e.message === "Failed to fetch" ? "Can't reach the database — check the network connection. Retrying every minute." : e.message);
        }
      };
      reload = run;
      run();
      setInterval(run, CFG.REFRESH_SECONDS * 1000);
      // Reload the page every 6 h so TVs pick up site updates.
      setTimeout(() => location.reload(), 6 * 3600 * 1000);
    },
  };

  // ───────── header calendar ─────────
  // Month grid in the theme's colours. A dot marks each day that has counts.
  let calMonth = null;  // "YYYY-MM-01" of the month on show, null = closed
  let calFrom = null;   // first day of a month browsed to, so its history gets loaded
  const monthKey = (d) => d.slice(0, 8) + "01";
  function drawCal() {
    const el = document.getElementById("cal");
    if (!el || !calMonth) return;
    const t = todayKey(), sel = shownDay || t;
    const m0 = parseDay(calMonth), y = m0.getFullYear(), mo = m0.getMonth();
    const offset = (m0.getDay() + 6) % 7; // weeks start on Monday
    const count = new Date(y, mo + 1, 0).getDate();
    const wd = [...Array(7)].map((_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(undefined, { weekday: "short" }).slice(0, 2));
    const loading = KPI.neededDays() > loadedDays;
    let cells = "";
    for (let i = 0; i < offset; i++) cells += "<span></span>";
    for (let n = 1; n <= count; n++) {
      const d = dayKey(new Date(y, mo, n));
      const people = d <= t && lastData ? lastData.peopleByDay[d] || 0 : 0;
      const work = CFG.WORK_DAYS.includes(parseDay(d).getDay());
      const tip = fmtDate(d, { weekday: "long", day: "numeric", month: "long" }) + (people ? ` · ${people} ${people === 1 ? "person" : "people"} logged` : d > t ? "" : " · no counts");
      cells += `<button type="button" class="cal-d${d === sel ? " sel" : ""}${d === t ? " today" : ""}${work ? "" : " off"}" data-day="${d}" ${d > t ? "disabled" : ""} title="${esc(tip)}">${n}${people ? "<i></i>" : ""}</button>`;
    }
    el.innerHTML = `
      <div class="cal-h">
        <button type="button" class="icon-btn cal-nav" data-cal="-1" aria-label="Previous month">${ICONS.chevL}</button>
        <div class="cal-title">${esc(m0.toLocaleDateString(undefined, { month: "long", year: "numeric" }))}${loading ? '<span class="cal-load">loading…</span>' : ""}</div>
        <button type="button" class="icon-btn cal-nav" data-cal="1" aria-label="Next month" ${calMonth >= monthKey(t) ? "disabled" : ""}>${ICONS.chevR}</button>
      </div>
      <div class="cal-grid">${wd.map((w) => `<b>${esc(w)}</b>`).join("")}${cells}</div>
      <div class="cal-f">
        <span class="cal-key"><i></i>counts entered</span>
        <span class="cal-btns"><button type="button" class="btn" data-day="${t}">Today</button>${pickedDay ? '<button type="button" class="btn primary" data-live>Back to live</button>' : ""}</span>
      </div>`;
  }
  function openCal(open) {
    const el = document.getElementById("cal");
    calMonth = open ? monthKey(shownDay || todayKey()) : null;
    calFrom = null;
    el.hidden = !open;
    document.getElementById("day-pick").setAttribute("aria-expanded", String(open));
    if (open) { drawCal(); (el.querySelector(".cal-d.sel") || el.querySelector(".cal-d:not([disabled])"))?.focus(); }
  }
  function mountCalendar() {
    const el = document.getElementById("cal");
    const wrap = el.parentElement;
    document.getElementById("day-pick").onclick = () => openCal(el.hidden);
    el.addEventListener("click", (e) => {
      const nav = e.target.closest("[data-cal]");
      if (nav) {
        const m = parseDay(calMonth); m.setMonth(m.getMonth() + Number(nav.dataset.cal));
        calMonth = calFrom = dayKey(m);
        drawCal();
        if (KPI.neededDays() > loadedDays) reload();
        return;
      }
      if (e.target.closest("[data-live]")) { openCal(false); KPI.setDay(null); return; }
      const b = e.target.closest("[data-day]");
      if (b && !b.disabled) { openCal(false); KPI.setDay(b.dataset.day); }
    });
    document.addEventListener("mousedown", (e) => { if (calMonth && !wrap.contains(e.target)) openCal(false); });
    // Capture phase so Esc / arrows stay inside the calendar instead of changing slides or closing a profile.
    window.addEventListener("keydown", (e) => {
      if (!calMonth) return;
      if (e.key === "Escape") { openCal(false); document.getElementById("day-pick").focus(); }
      else if (e.target.classList.contains("cal-d") && /^Arrow/.test(e.key)) {
        const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
        const d = addDays(e.target.dataset.day, step);
        if (d <= todayKey()) {
          if (monthKey(d) !== calMonth) { calMonth = calFrom = monthKey(d); drawCal(); }
          el.querySelector(`[data-day="${d}"]`)?.focus();
        }
      } else return;
      e.stopImmediatePropagation(); e.preventDefault();
    }, true);
  }

  // get_data ➜ the shape the screens use, with lookup tables for fast calculations
  function normalise(d) {
    const departments = (d.departments || []).map((x) => ({ name: String(x.name).trim(), unit: String(x.unit || "pcs").trim() || "pcs" }));
    deptOrder = departments.map((x) => x.name);
    const employees = (d.employees || []).map((e) => {
      // The department cell may list several, e.g. "Rolls, Packing" — the first is the main one.
      const list = [...new Set(String(e.department || "").split(",").map((s) => s.trim()).filter(Boolean))];
      return {
        name: String(e.name).trim(),
        department: list[0] || "",
        departments: list,
        active: e.active !== false,
        photo: /^(data:image\/(jpeg|png|webp);base64,|https:\/\/)/.test(String(e.photo || "")) ? String(e.photo) : "",
      };
    });
    // Jobs in sheet order: by department order, then their own order (get_data sends them sorted).
    const dIdx = (n) => { const i = deptOrder.indexOf(n); return i < 0 ? 999 : i; };
    const jobs = (d.jobs || []).map((j, i) => ({
      id: Number(j.id), department: String(j.department || "").trim(), machine: String(j.machine || "").trim(),
      name: String(j.name || "").trim(), unit: String(j.unit || "pcs").trim() || "pcs", active: j.active !== false, i,
    })).sort((a, b) => dIdx(a.department) - dIdx(b.department) || a.i - b.i);
    const jobById = Object.fromEntries(jobs.map((j) => [j.id, j]));
    const entries = (d.entries || []).map(([date, employee, job, qty]) => ({ date, employee, job: Number(job), qty: Number(qty) || 0 })).filter((e) => jobById[e.job]);
    const byKey = {}, byJobDay = {}, byDeptDay = {}, peopleSets = {}, freq = {};
    entries.forEach((e) => {
      const k = e.date + "|" + e.employee, j = jobById[e.job], dk = e.date + "|" + j.department;
      (byKey[k] = byKey[k] || {})[e.job] = e.qty;
      (byJobDay[e.date + "|" + e.job] = byJobDay[e.date + "|" + e.job] || []).push(e.qty);
      const dd = (byDeptDay[dk] = byDeptDay[dk] || { units: {}, people: new Set() });
      dd.units[j.unit] = (dd.units[j.unit] || 0) + e.qty;
      dd.people.add(e.employee);
      (peopleSets[e.date] = peopleSets[e.date] || new Set()).add(e.employee);
      const f = ((freq[e.employee] = freq[e.employee] || {})[e.job] = freq[e.employee][e.job] || { n: 0, last: "" });
      f.n++; if (e.date > f.last) f.last = e.date;
    });
    const peopleByDay = Object.fromEntries(Object.entries(peopleSets).map(([k, s]) => [k, s.size]));
    // Each person's jobs, most often done first (then most recent)
    const jobsByEmp = Object.fromEntries(Object.entries(freq).map(([name, m]) => [name,
      Object.entries(m).sort(([, a], [, b]) => b.n - a.n || b.last.localeCompare(a.last)).map(([id]) => Number(id))]));
    return {
      departments, jobs, employees, entries, byKey, byJobDay, byDeptDay, peopleByDay, jobsByEmp, jobDayCache: {}, version: d.version || null,
      deptByName: Object.fromEntries(departments.map((x) => [x.name, x])),
      jobById,
      empByName: Object.fromEntries(employees.map((x) => [x.name, x])),
    };
  }

  window.KPI = KPI;
})();

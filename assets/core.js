// Shared data layer + calculations for all pages.
(function () {
  const CFG = window.KPI_CONFIG;
  // Backend: Supabase if configured, else the Google Sheet (API_URL), else demo data in this browser.
  const SB = !!(CFG.SUPABASE_URL && CFG.SUPABASE_KEY);
  const DEMO = !SB && !CFG.API_URL;
  const BACKEND = SB ? "supabase" : DEMO ? "demo" : "sheets";
  const DEMO_KEY = "kpi_demo_v2";

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
    playSolid: svg('<path d="M7 4.5v15l12.5-7.5z" fill="currentColor"/>'),
    pause: svg('<rect x="6" y="4.5" width="4" height="15" rx="1" fill="currentColor"/><rect x="14" y="4.5" width="4" height="15" rx="1" fill="currentColor"/>'),
    search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
    close: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
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

  let chartId = 0;
  // ───────── helpers ─────────
  const pad = (n) => String(n).padStart(2, "0");
  const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseDay = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parseDay(s); d.setDate(d.getDate() + n); return dayKey(d); };
  const todayKey = () => dayKey(new Date());

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

  // ───────── demo storage ─────────
  function demoGet() {
    let db = null;
    try { db = JSON.parse(localStorage.getItem(DEMO_KEY)); } catch (e) {}
    if (!db) { db = demoInitial(); demoSet(db); }
    else if (db.sample && !db.long) { demoBackfill(db); demoSet(db); }
    return db;
  }
  // Excel data only (21 Sep onwards — sparse).
  function demoExcel() {
    const s = window.SEED_DATA || { employees: [], entries: [] };
    return {
      employees: JSON.parse(JSON.stringify(s.employees)),
      targets: { ...CFG.DEFAULT_TARGETS },
      entries: JSON.parse(JSON.stringify(s.entries)),
    };
  }
  // Demo mode starts with ~2 years of realistic SAMPLE numbers so the charts (up to yearly) have something to show.
  const DEMO_DAYS = 730;
  function demoInitial() { return demoGenerate(demoExcel(), DEMO_DAYS); }
  // Older demo data only had 8 weeks: add sample history before it, keeping everything already there.
  function demoBackfill(db) {
    const oldest = db.entries.reduce((m, e) => (e.date < m ? e.date : m), todayKey());
    const older = demoGenerate({ ...db, entries: [] }, DEMO_DAYS).entries.filter((e) => e.date < oldest);
    db.entries = older.concat(db.entries);
    db.long = true;
  }
  function demoSet(db) { try { localStorage.setItem(DEMO_KEY, JSON.stringify(db)); } catch (e) {} }

  // Small seeded random generator so each person has a stable "profile".
  function rng(seed) { let x = seed >>> 0 || 1; return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 4294967296); }
  function hash(str) { let h = 2166136261; for (const c of String(str)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }

  // SAMPLE data generator (demo/testing only): every person gets a base level, a gentle trend,
  // weekday rhythm, day-to-day variation and the occasional absence.
  function demoGenerate(db, days = 56) {
    const t = todayKey();
    const run = rng(Date.now() % 100000);
    db.entries = [];
    const profiles = {};
    db.employees.forEach((e) => {
      const r = rng(hash(e.name));
      profiles[e.name] = { base: 0.78 + r() * 0.34, slope: (r() - 0.35) * 0.006, wave: r() * 6.28, main: e.tasks[Math.floor(r() * e.tasks.length)] || e.tasks[0] };
    });
    const weekday = { 1: 0.95, 2: 1.02, 3: 1.04, 4: 1.03, 5: 1.0, 6: 0.9, 0: 0.9 };
    for (let i = days - 1; i >= 0; i--) {
      const day = addDays(t, -i);
      const dow = parseDay(day).getDay();
      if (!CFG.WORK_DAYS.includes(dow)) continue;
      const recent = Math.max(-56, -i); // gentle trend over the last 8 weeks, flat before that
      db.employees.forEach((e) => {
        if (!e.tasks.length || run() < 0.05) return; // absent
        const pf = profiles[e.name];
        const season = 0.05 * Math.sin(i / 70 + pf.wave);
        const level = Math.max(0.35, (pf.base + pf.slope * (56 + recent) + season) * weekday[dow] * (0.88 + run() * 0.24));
        const split = e.tasks.length > 1 && run() < 0.35;
        const other = e.tasks.filter((x) => x !== pf.main)[Math.floor(run() * (e.tasks.length - 1))];
        const plan = split && other ? [[pf.main, 0.6], [other, 0.4]] : [[pf.main, 1]];
        plan.forEach(([task, share]) => {
          const target = db.targets[task] || 100;
          const qty = Math.round(target * share * level);
          if (qty > 0) db.entries.push({ date: day, employee: e.name, task, qty });
        });
      });
    }
    db.sample = true;
    db.long = days >= DEMO_DAYS;
    return db;
  }

  // ───────── API ─────────
  async function apiGet(params) {
    const url = CFG.API_URL + "?" + new URLSearchParams(params).toString();
    const r = await fetch(url, { redirect: "follow" });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || "Request failed");
    return j;
  }
  async function apiPost(body) {
    // text/plain avoids a CORS pre-flight, which Apps Script doesn't support.
    const r = await fetch(CFG.API_URL, { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "text/plain;charset=utf-8" }, redirect: "follow" });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || "Request failed");
    return j;
  }

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
    if (/JWT|refresh token/i.test(m)) return "Your sign-in has expired — please sign in again";
    return m;
  }
  async function sbFetch(path, body, { user = false } = {}) {
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
  // get_data returns targets as ordered rows and entries as [date, employee, task, qty]
  function fromSupabase(j) {
    const targets = {}, taskDepts = {};
    (j.targets || []).forEach((t) => { targets[t.task] = Number(t.target); if (t.department) taskDepts[t.task] = t.department; });
    return {
      version: j.version,
      employees: j.employees || [],
      targets, taskDepts,
      entries: (j.entries || []).map(([date, employee, task, qty]) => ({ date, employee, task, qty })),
    };
  }

  const KPI = {
    CFG, DEMO, BACKEND, ICONS, dayKey, parseDay, addDays, todayKey, fmtNum, fmtFull, fmtDate, parseQty, esc,

    async load(days = 60) {
      if (DEMO) {
        const db = demoGet();
        return normalise(db);
      }
      if (SB) return normalise(fromSupabase(await sbRpc("get_data", { days })));
      const j = await apiGet({ action: "data", days });
      return normalise(j);
    },
    // Cheap "has anything changed?" check (Supabase only; null = unknown, always reload)
    async version() {
      return SB ? await sbRpc("data_version", {}) : null;
    },

    // Supabase signs in with email + password; the Sheet and demo use one shared password.
    async auth(password, email) {
      if (DEMO) { if (password !== "admin") throw new Error("Wrong password (demo password is: admin)"); return true; }
      if (SB) {
        sbKeep(await sbFetch("/auth/v1/token?grant_type=password", { email, password }));
        if (!(await sbRpc("is_admin", {}, { user: true }))) {
          await KPI.logout();
          throw new Error("Signed in, but this account is not an admin yet — see README ➜ Supabase setup");
        }
        return true;
      }
      await apiPost({ action: "auth", password });
      return true;
    },
    // Supabase: is someone still signed in from earlier in this tab?
    async resume() {
      if (!SB || !sbSession) return false;
      try { return !!(await sbRpc("is_admin", {}, { user: true })); } catch (e) { sbKeep(null); return false; }
    },
    signedInAs() { return sbSession?.email || ""; },
    async logout() {
      if (SB && sbSession) { try { await sbFetch("/auth/v1/logout", {}, { user: true }); } catch (e) {} }
      sbKeep(null);
    },

    // rows: [{employee, task, qty}] — qty null/'' deletes the cell
    async saveEntries(password, date, rows) {
      if (DEMO) {
        const db = demoGet();
        rows.forEach((r) => {
          db.entries = db.entries.filter((e) => !(e.date === date && e.employee === r.employee && e.task === r.task));
          if (r.qty != null && r.qty !== "" && Number(r.qty) !== 0) db.entries.push({ date, employee: r.employee, task: r.task, qty: Number(r.qty) });
        });
        demoSet(db); return true;
      }
      if (SB) { await sbRpc("save_entries", { p_date: date, p_rows: rows }, { user: true }); return true; }
      await apiPost({ action: "saveEntries", password, date, rows });
      return true;
    },

    // taskDepts: { task: department } — which department a task's output counts for (see taskDept)
    async saveTargets(password, targets, taskDepts) {
      if (DEMO) { const db = demoGet(); db.targets = targets; db.taskDepts = taskDepts; demoSet(db); return true; }
      if (SB) {
        const rows = Object.keys(targets).map((task) => ({ task, target: targets[task], department: taskDepts?.[task] || null }));
        await sbRpc("save_targets", { p_rows: rows }, { user: true });
        return true;
      }
      await apiPost({ action: "saveTargets", password, targets, taskDepts });
      return true;
    },

    async saveEmployees(password, employees) {
      if (DEMO) {
        const db = demoGet();
        employees.forEach((e) => { if (e.renamedFrom) db.entries.forEach((x) => { if (x.employee === e.renamedFrom) x.employee = e.name; }); });
        db.employees = employees.map(({ renamedFrom, ...e }) => e);
        demoSet(db); return true;
      }
      if (SB) { await sbRpc("save_employees", { p_rows: employees }, { user: true }); return true; }
      await apiPost({ action: "saveEmployees", password, employees });
      return true;
    },

    demoReset() { demoSet(demoExcel()); },
    demoRandomize() { const db = demoGet(); demoSet(demoGenerate(db, DEMO_DAYS)); },

    // ───────── calculations ─────────
    displayDay(data) {
      return pickedDay || KPI.liveDay(data);
    },
    liveDay(data) {
      const t = todayKey();
      if (CFG.DISPLAY_DAY === "today") return t;
      let best = null;
      data.entries.forEach((e) => { if (e.date <= t && (!best || e.date > best)) best = e.date; });
      return best || t;
    },

    // Score = Σ (qty ÷ daily target) × 100 across every task the person did that day.
    // e.g. half a day on TH (30 of 60) + half on Packing (75 of 150) = 50% + 50% = 100%.
    empDay(data, emp, day) {
      const rows = data.byKey[day + "|" + emp] || {};
      const tasks = Object.keys(rows).map((task) => {
        const qty = rows[task];
        const target = data.targets[task] || 0;
        return { task, qty, target, pct: target ? (qty / target) * 100 : null };
      }).sort((a, b) => (b.pct || 0) - (a.pct || 0));
      const has = tasks.length > 0;
      const score = has ? tasks.reduce((a, t) => a + (t.pct || 0), 0) : null;
      return { tasks, score, has };
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

    empSummary(data, emp, day) {
      const today = KPI.empDay(data, emp.name, day);
      const days = KPI.workDays(day, 7);
      const trend = days.map((d) => ({ day: d, score: KPI.empDay(data, emp.name, d).score }));
      const worked = trend.filter((t) => t.score != null);
      const weekAvg = worked.length ? worked.reduce((a, t) => a + t.score, 0) / worked.length : null;
      return { ...emp, today, trend, weekAvg, daysWorked: worked.length };
    },

    summaries(data, day) {
      return data.employees.filter((e) => e.active !== false).map((e) => KPI.empSummary(data, e, day));
    },

    // ───────── people in more than one department ─────────
    // A task counts for its department (Admin ➜ Targets) when the person works there,
    // otherwise for the person's main department. One-department people: everything counts there.
    taskDept(data, emp, task) {
      const d = data.taskDepts[task];
      return d && emp.departments.includes(d) ? d : emp.department;
    },
    // The part of a person's day that counts for `dept`:
    // score = Σ task % for that department, share = fraction of their day's output it represents.
    deptPart(data, emp, dept, day) {
      const r = KPI.empDay(data, emp.name, day);
      if (!r.has) return null;
      const tasks = r.tasks.filter((t) => KPI.taskDept(data, emp, t.task) === dept);
      if (!tasks.length) return null;
      const score = tasks.reduce((a, t) => a + (t.pct || 0), 0);
      return { score, total: r.score, tasks, share: r.score ? score / r.score : tasks.length / r.tasks.length };
    },
    // Department average for a day. Someone who spent half their day here counts as half a person,
    // so splitting time between departments never drags either average down.
    deptAvg(data, dept, day) {
      let sum = 0, weight = 0;
      data.employees.forEach((e) => {
        if (e.active === false || !e.departments.includes(dept)) return;
        const p = KPI.deptPart(data, e, dept, day);
        if (p) { sum += p.score; weight += p.share; }
      });
      return weight ? sum / weight : null;
    },
    deptSeries(data, dept, day, n) {
      return KPI.workDays(day, n).map((d) => ({ day: d, v: KPI.deptAvg(data, dept, d) }));
    },
    // Summary of one person inside one department (today's part + 7-day average of that part)
    deptSummary(data, p, dept, day) {
      const part = KPI.deptPart(data, p, dept, day);
      const week = KPI.workDays(day, 7).map((d) => KPI.deptPart(data, p, dept, d)).filter(Boolean);
      return { part, score: part ? part.score : null, weekAvg: week.length ? week.reduce((a, x) => a + x.score, 0) / week.length : null };
    },
    // "Sheets · Sets" with a colour dot per department
    deptLabel(p) {
      return p.departments.map((d) => `<span class="dept-lbl"><span class="dept-dot" style="background:${KPI.deptColor(d)}"></span>${esc(d)}</span>`).join("");
    },

    // ───────── profile chart periods ─────────
    PERIODS: {
      daily: { label: "Daily", title: "Last 7 working days", sub: "score per day", days: 14 },
      weekly: { label: "Weekly", title: "Last 8 weeks", sub: "average score per week", days: 60 },
      monthly: { label: "Monthly", title: "Last 12 months", sub: "average score per month", days: 370 },
      yearly: { label: "Yearly", title: "By year", sub: "average score per year", days: 5 * 366 },
    },
    period() { return period; },
    setPeriod(p) {
      if (!KPI.PERIODS[p] || p === period) return;
      period = p;
      try { localStorage.setItem("kpi_period", p); } catch (e) {}
      KPI.refresh();
    },
    // Bars for the profile chart: [{ label, v, cur, days }] — v = average score over the days worked in that bucket.
    periodBars(data, name, day, per = period) {
      const avg = (from, to) => {
        const sc = [];
        for (let d = from; d <= to && d <= day; d = addDays(d, 1)) { const s = KPI.empDay(data, name, d).score; if (s != null) sc.push(s); }
        return { v: sc.length ? sc.reduce((a, b) => a + b, 0) / sc.length : null, days: sc.length };
      };
      const D = parseDay(day);
      if (per === "weekly") {
        const monday = addDays(day, -((D.getDay() + 6) % 7));
        return [...Array(8)].map((_, i) => {
          const from = addDays(monday, (i - 7) * 7);
          return { label: fmtDate(from, { day: "numeric", month: "short" }), cur: i === 7, title: "Week of " + fmtDate(from), ...avg(from, addDays(from, 6)) };
        });
      }
      if (per === "monthly") {
        return [...Array(12)].map((_, i) => {
          const m = new Date(D.getFullYear(), D.getMonth() - 11 + i, 1);
          const last = new Date(m.getFullYear(), m.getMonth() + 1, 0);
          return { label: m.toLocaleDateString(undefined, { month: "short" }) + (m.getMonth() === 0 || i === 0 ? " " + String(m.getFullYear()).slice(2) : ""), cur: i === 11, title: m.toLocaleDateString(undefined, { month: "long", year: "numeric" }), ...avg(dayKey(m), dayKey(last)) };
        });
      }
      if (per === "yearly") {
        const bars = [...Array(5)].map((_, i) => {
          const y = D.getFullYear() - 4 + i;
          return { label: String(y), cur: i === 4, title: String(y), ...avg(`${y}-01-01`, `${y}-12-31`) };
        });
        while (bars.length > 1 && bars[0].v == null) bars.shift(); // start at the first year with data
        return bars;
      }
      return KPI.workDays(day, 7).map((d) => ({ label: fmtDate(d, { weekday: "short", day: "numeric" }), cur: d === day, title: fmtDate(d), v: KPI.empDay(data, name, d).score, days: 1 }));
    },

    status(score) {
      if (score == null) return { key: "none", label: "No entry", icon: ICONS.dash };
      if (score >= CFG.THRESHOLDS.good) return { key: "good", label: "On target", icon: ICONS.up };
      if (score >= CFG.THRESHOLDS.warning) return { key: "warning", label: "Close", icon: ICONS.dot };
      return { key: "critical", label: "Below", icon: ICONS.down };
    },
    pill(score, label) {
      const st = KPI.status(score);
      return `<span class="pill pill-${st.key}">${st.icon}${esc(label || st.label)}</span>`;
    },

    // Department colours come from theme tokens (--dept-1 … --dept-8) so they adapt to light/dark.
    deptColor(name) {
      const i = CFG.DEPARTMENTS.findIndex((x) => (x.name || x) === name);
      return i < 0 ? "var(--muted)" : `var(--dept-${(i % 8) + 1})`;
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
    // Crops the centre square, resizes and compresses so it fits in one Google Sheet cell (< 50,000 chars).
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
    deptNames() { return CFG.DEPARTMENTS.map((d) => d.name || d); },

    // Sparkline SVG for a trend array [{day, score}]
    // ───────── charts ─────────
    // Series of team (or filtered) average score for the last n working days → [{day, v}]
    teamSeries(data, day, n, filter = () => true) {
      const emps = data.employees.filter((e) => e.active !== false && filter(e));
      return KPI.workDays(day, n).map((d) => {
        const sc = emps.map((e) => KPI.empDay(data, e.name, d).score).filter((v) => v != null);
        return { day: d, v: sc.length ? sc.reduce((a, b) => a + b, 0) / sc.length : null };
      });
    },
    empSeries(data, name, day, n) {
      return KPI.workDays(day, n).map((d) => ({ day: d, v: KPI.empDay(data, name, d).score }));
    },

    // Smooth area/line chart. SVG draws the shapes (stretched to fit), HTML draws dots and labels
    // so text never distorts. opts: mini (no axes), values ("last" | "all" | "none"), color.
    trendChart(series, { mini = false, values = "last", color = "var(--accent)", target = CFG.THRESHOLDS.good, xLabels = 6 } = {}) {
      const id = "tc" + (++chartId);
      const pts = series.map((p) => p.v ?? p.score ?? null);
      const valid = pts.filter((v) => v != null);
      const max = Math.max(target * 1.3, ...valid.map((v) => v * 1.12));
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
      const grid = mini ? [] : [50, 100, 150, 200].filter((g) => g < max && g !== target);
      const lastIdx = pts.map((v, i) => (v == null ? -1 : i)).filter((i) => i >= 0).pop();
      const dots = pts.map((v, i) => {
        if (v == null) return "";
        const isLast = i === lastIdx;
        if (mini && !isLast) return "";
        const st = KPI.status(v).key;
        const showVal = !mini && (values === "all" || (values === "last" && isLast));
        return `<i class="tc-dot ${isLast ? "last" : ""}" style="left:${X(i)}%;bottom:${100 - Y(v)}%;--c:var(--${st})" title="${esc(fmtDate(series[i].day))}: ${Math.round(v)}%"></i>` +
          (showVal ? `<span class="tc-val st-${st}" style="left:${X(i)}%;bottom:${100 - Y(v)}%">${Math.round(v)}%</span>` : "");
      }).join("");
      const step = Math.max(1, Math.ceil(n / xLabels));
      const xl = mini ? "" : `<div class="tc-x">${series.map((p, i) => (i % step === 0 || i === n - 1) && !(i !== n - 1 && n - 1 - i < step / 2)
        ? `<span style="left:${X(i)}%">${esc(fmtDate(p.day, { day: "numeric", month: "short" }))}</span>` : "").join("")}</div>`;
      return `<div class="tc ${mini ? "mini" : ""}" style="--lc:${color}">
        <div class="tc-plot">
          ${grid.map((g) => `<div class="tc-grid" style="bottom:${100 - Y(g)}%"><span>${g}%</span></div>`).join("")}
          <div class="tc-target" style="bottom:${100 - Y(target)}%">${mini ? "" : `<span>${target}%<b>target</b></span>`}</div>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity="0.32"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
            ${areas.map((d) => d && `<path d="${d}" fill="url(#${id})"/>`).join("")}
            ${lines.map((d) => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${mini ? 2 : 3}" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>`).join("")}
          </svg>
          ${dots}
        </div>${xl}</div>`;
    },
    // kept for compatibility: tiny trend line
    sparkline(trend, opts = {}) { return KPI.trendChart(trend, { mini: true, color: opts.color || "var(--accent)" }); },

    // "today", or "on Sat 20 Sep" when looking at another day
    dayWord(day) { return day === todayKey() ? "today" : "on " + fmtDate(day); },

    // One person's full profile: header card, output per task + trend, last 7 working days.
    // Used by the slideshow and the team grid's profile view.
    personView(p, day, data) {
      const pct = (v) => (v == null ? "–" : Math.round(v) + "%");
      const barW = (v, max = 150) => (v == null ? 0 : Math.min(v, max) / max * 100);
      const st = KPI.status(p.today.score);
      const color = KPI.deptColor(p.department);
      const tasks = p.today.tasks.length ? p.today.tasks.map((t) => {
        const s = KPI.status(t.pct);
        return `<div><div class="task-h"><span>${esc(t.task)}</span><span><b>${fmtFull(t.qty)}</b> <span class="of">/ ${fmtFull(t.target)}</span>&nbsp; ${KPI.pill(t.pct, t.pct == null ? "no target" : Math.round(t.pct) + "%")}</span></div>
          <div class="bar"><span class="bg-${s.key}" style="width:${barW(t.pct)}%"></span><i class="tgt" style="left:66.67%"></i></div></div>`;
      }).join("") : `<div class="empty" style="text-align:left;padding:1rem 0">No output recorded for this day yet.</div>`;
      const per = KPI.PERIODS[period] ? period : "daily";
      const bars = KPI.periodBars(data, p.name, day, per);
      const max = Math.max(CFG.THRESHOLDS.good * 1.3, ...bars.map((t) => (t.v || 0) * 1.18));
      const tpos = CFG.THRESHOLDS.good / max * 100;
      const cols = bars.map((t) => {
        const s = KPI.status(t.v);
        const h = t.v == null ? 0 : t.v / max * 100;
        const tip = `${t.title}: ${t.v == null ? "no entries" : pct(t.v)}${per === "daily" || t.v == null ? "" : ` · ${t.days} day${t.days === 1 ? "" : "s"} worked`}`;
        return `<div class="c7 ${t.cur ? "today" : ""}" title="${esc(tip)}"><div class="c7-track">
          <div class="c7-t" style="bottom:${tpos}%"></div>
          <div class="c7-b bg-${s.key}" style="height:${h}%"></div>
          <div class="c7-v st-${s.key}" style="bottom:calc(${h}% + 0.35rem)"><span>${pct(t.v)}</span></div></div>
          <div class="c7-d">${esc(t.label)}</div></div>`;
      }).join("");
      const seg = Object.entries(KPI.PERIODS).map(([k, v]) => `<button type="button" data-period="${k}" class="${k === per ? "on" : ""}" aria-pressed="${k === per}">${v.label}</button>`).join("");
      const best = p.trend.reduce((m, t) => (t.score != null && (m == null || t.score > m) ? t.score : m), null);
      return `
        <div class="card ps-head" style="--dc:${color}">
          ${KPI.avatar(p, { cls: "xl", ring: st.key })}
          <div class="ps-id"><div class="ps-name">${esc(p.name)}</div><div class="ps-dept">${KPI.deptLabel(p)}</div></div>
          <div class="ps-mini"><div>7-day avg<b>${pct(p.weekAvg)}</b></div><div>Best day<b>${pct(best)}</b></div><div>Days worked<b>${p.daysWorked}</b></div></div>
          <div class="ps-score"><div class="big st-${st.key}">${pct(p.today.score)}</div>${KPI.pill(p.today.score, p.today.score == null ? "No entry yet" : st.label + " · of daily target")}</div>
        </div>
        <div class="card panel"><div class="card-h"><h2 class="card-title">${day === todayKey() ? "Today's output" : "Output · " + esc(fmtDate(day))}</h2><span class="card-sub">quantity / daily target</span></div><div class="tasks">${tasks}</div>
          <div class="card-h" style="margin-top:1.6rem"><h2 class="card-title">Trend</h2><span class="card-sub">last 20 working days</span></div>
          <div class="chart-fill">${KPI.trendChart(KPI.empSeries(data, p.name, day, 20), { values: "last", xLabels: 5, color })}</div></div>
        <div class="card panel"><div class="card-h"><h2 class="card-title">${KPI.PERIODS[per].title} <span class="card-sub">· ${KPI.PERIODS[per].sub}</span></h2><div class="pseg" role="group" aria-label="Chart period">${seg}</div></div>
          <div class="chart-area"><div class="cols7 n${bars.length}">${cols}</div></div>
          <div class="note"><span class="dash"></span>Daily target (100%) · score = output ÷ target, added up across all tasks that day</div></div>`;
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
        <a class="brand" href="index.html${qs}" data-nav="index.html" title="Home" style="color:inherit;text-decoration:none"><div class="brand-mark">${ICONS.logo}</div>
          <div class="brand-text"><div class="brand-eyebrow">${esc(CFG.COMPANY_NAME)}</div><div class="brand-title">${esc(title)}</div></div></a>
        <nav class="seg" aria-label="Views">${views.map(([h, l, i]) => `<a href="${h}${qs}" data-nav="${h}" class="${h === active ? "on" : ""}">${i}${l}</a>`).join("")}</nav>
        <div class="hdr-spacer"></div>
        ${DEMO ? '<span class="demo-badge">DEMO DATA</span>' : ""}
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
      // Profile chart period buttons (slideshow + team grid)
      document.addEventListener("click", (e) => { const b = e.target.closest("[data-period]"); if (b) KPI.setPeriod(b.dataset.period); });
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
          loadedDays = DEMO ? Infinity : days; // demo keeps all of its data in the browser
          render(last); drawCal(); document.body.classList.remove("offline");
        }
        catch (e) { console.error(e); document.body.classList.add("offline"); if (last) render(last); }
      };
      reload = run;
      run();
      setInterval(run, CFG.REFRESH_SECONDS * 1000);
      // Reload the page every 6 h so TVs pick up site updates.
      setTimeout(() => location.reload(), 6 * 3600 * 1000);
      window.addEventListener("storage", run); // demo mode: admin in another tab
    },
  };

  // ───────── header calendar ─────────
  // Month grid in the theme's colours. Each day shows a dot coloured by that day's team average.
  let calMonth = null;  // "YYYY-MM-01" of the month on show, null = closed
  let calFrom = null;   // first day of a month browsed to, so its history gets loaded
  const monthKey = (d) => d.slice(0, 8) + "01";
  function teamDayAvg(d) {
    if (!lastData) return null;
    const sc = lastData.employees.filter((e) => e.active !== false).map((e) => KPI.empDay(lastData, e.name, d).score).filter((v) => v != null);
    return sc.length ? sc.reduce((a, b) => a + b, 0) / sc.length : null;
  }
  function drawCal() {
    const el = document.getElementById("cal");
    if (!el || !calMonth) return;
    const t = todayKey(), sel = shownDay || t;
    const m0 = parseDay(calMonth), y = m0.getFullYear(), mo = m0.getMonth();
    const offset = (m0.getDay() + 6) % 7; // weeks start on Monday
    const count = new Date(y, mo + 1, 0).getDate();
    const wd = [...Array(7)].map((_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(undefined, { weekday: "short" }).slice(0, 2));
    const loading = !DEMO && KPI.neededDays() > loadedDays;
    let cells = "";
    for (let i = 0; i < offset; i++) cells += "<span></span>";
    for (let n = 1; n <= count; n++) {
      const d = dayKey(new Date(y, mo, n));
      const avg = d <= t ? teamDayAvg(d) : null;
      const work = CFG.WORK_DAYS.includes(parseDay(d).getDay());
      const tip = fmtDate(d, { weekday: "long", day: "numeric", month: "long" }) + (avg != null ? ` · team average ${Math.round(avg)}%` : d > t ? "" : " · no entries");
      cells += `<button type="button" class="cal-d${d === sel ? " sel" : ""}${d === t ? " today" : ""}${work ? "" : " off"}" data-day="${d}" ${d > t ? "disabled" : ""} title="${esc(tip)}">${n}${avg != null ? `<i class="bg-${KPI.status(avg).key}"></i>` : ""}</button>`;
    }
    el.innerHTML = `
      <div class="cal-h">
        <button type="button" class="icon-btn cal-nav" data-cal="-1" aria-label="Previous month">${ICONS.chevL}</button>
        <div class="cal-title">${esc(m0.toLocaleDateString(undefined, { month: "long", year: "numeric" }))}${loading ? '<span class="cal-load">loading…</span>' : ""}</div>
        <button type="button" class="icon-btn cal-nav" data-cal="1" aria-label="Next month" ${calMonth >= monthKey(t) ? "disabled" : ""}>${ICONS.chevR}</button>
      </div>
      <div class="cal-grid">${wd.map((w) => `<b>${esc(w)}</b>`).join("")}${cells}</div>
      <div class="cal-f">
        <span class="cal-key"><i class="bg-good"></i><i class="bg-warning"></i><i class="bg-critical"></i>team average</span>
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
        if (!DEMO && KPI.neededDays() > loadedDays) reload();
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

  function normalise(d) {
    const targets = { ...CFG.DEFAULT_TARGETS, ...(d.targets || {}) };
    // Until the admin saves the Targets tab once, task departments come from config.js.
    const taskDepts = d.taskDepts ? { ...d.taskDepts } : { ...(CFG.DEFAULT_TASK_DEPARTMENTS || {}) };
    const employees = (d.employees || []).map((e) => {
      // The department cell may list several, e.g. "TH & 2ply, Packing" — the first is the main one.
      const departments = [...new Set(String(e.department || "").split(",").map((s) => s.trim()).filter(Boolean))];
      if (!departments.length) departments.push("Other");
      return {
      name: String(e.name).trim(),
      department: departments[0],
      departments,
      tasks: Array.isArray(e.tasks) ? e.tasks : String(e.tasks || "").split(",").map((s) => s.trim()).filter(Boolean),
      active: e.active !== false && e.active !== "FALSE" && e.active !== "false",
      photo: /^(data:image\/(jpeg|png|webp);base64,|https:\/\/)/.test(String(e.photo || "")) ? String(e.photo) : "",
      };
    });
    const entries = (d.entries || []).map((e) => ({ date: String(e.date).slice(0, 10), employee: String(e.employee).trim(), task: String(e.task).trim(), qty: Number(e.qty) || 0 }));
    const byKey = {};
    entries.forEach((e) => {
      const k = e.date + "|" + e.employee;
      byKey[k] = byKey[k] || {};
      byKey[k][e.task] = (byKey[k][e.task] || 0) + e.qty;
    });
    return { employees, targets, taskDepts, entries, byKey, version: d.version || null };
  }

  window.KPI = KPI;
})();

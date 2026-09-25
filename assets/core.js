// Shared data layer + calculations for all pages.
(function () {
  const CFG = window.KPI_CONFIG;
  const DEMO = !CFG.API_URL;
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
  };

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
  // Demo mode starts with ~8 weeks of realistic SAMPLE numbers so the charts have something to show.
  function demoInitial() { return demoGenerate(demoExcel(), 56); }
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
      profiles[e.name] = { base: 0.78 + r() * 0.34, slope: (r() - 0.35) * 0.006, main: e.tasks[Math.floor(r() * e.tasks.length)] || e.tasks[0] };
    });
    const weekday = { 1: 0.95, 2: 1.02, 3: 1.04, 4: 1.03, 5: 1.0, 6: 0.9, 0: 0.9 };
    for (let i = days - 1; i >= 0; i--) {
      const day = addDays(t, -i);
      const dow = parseDay(day).getDay();
      if (!CFG.WORK_DAYS.includes(dow)) continue;
      const age = days - 1 - i;
      db.employees.forEach((e) => {
        if (!e.tasks.length || run() < 0.05) return; // absent
        const pf = profiles[e.name];
        const level = Math.max(0.35, (pf.base + pf.slope * age) * weekday[dow] * (0.88 + run() * 0.24));
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

  const KPI = {
    CFG, DEMO, ICONS, dayKey, parseDay, addDays, todayKey, fmtNum, fmtFull, fmtDate, parseQty, esc,

    async load(days = 60) {
      if (DEMO) {
        const db = demoGet();
        return normalise(db);
      }
      const j = await apiGet({ action: "data", days });
      return normalise(j);
    },

    async auth(password) {
      if (DEMO) { if (password !== "admin") throw new Error("Wrong password (demo password is: admin)"); return true; }
      await apiPost({ action: "auth", password });
      return true;
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
      await apiPost({ action: "saveEntries", password, date, rows });
      return true;
    },

    async saveTargets(password, targets) {
      if (DEMO) { const db = demoGet(); db.targets = targets; demoSet(db); return true; }
      await apiPost({ action: "saveTargets", password, targets });
      return true;
    },

    async saveEmployees(password, employees) {
      if (DEMO) {
        const db = demoGet();
        employees.forEach((e) => { if (e.renamedFrom) db.entries.forEach((x) => { if (x.employee === e.renamedFrom) x.employee = e.name; }); });
        db.employees = employees.map(({ renamedFrom, ...e }) => e);
        demoSet(db); return true;
      }
      await apiPost({ action: "saveEmployees", password, employees });
      return true;
    },

    demoReset() { demoSet(demoExcel()); },
    demoRandomize() { const db = demoGet(); demoSet(demoGenerate(db, 56)); },

    // ───────── calculations ─────────
    displayDay(data) {
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

    // Shared TV header: title, date shown, clock, last-updated
    mountHeader(el, title, active) {
      const views = [["tv-slides.html", "Slideshow", ICONS.play], ["tv-grid.html", "Team grid", ICONS.grid], ["tv-departments.html", "Departments", ICONS.list]];
      const qs = location.search;
      el.innerHTML = `
        <a class="brand" href="index.html${qs}" title="Home" style="color:inherit;text-decoration:none"><div class="brand-mark">${ICONS.logo}</div>
          <div class="brand-text"><div class="brand-eyebrow">${esc(CFG.COMPANY_NAME)}</div><div class="brand-title">${esc(title)}</div></div></a>
        <nav class="seg" aria-label="Views">${views.map(([h, l, i]) => `<a href="${h}${qs}" class="${h === active ? "on" : ""}">${i}${l}</a>`).join("")}</nav>
        <div class="hdr-spacer"></div>
        ${DEMO ? '<span class="demo-badge">DEMO DATA</span>' : ""}
        <div class="hdr-date"><div class="d" id="hdr-day">&nbsp;</div><div class="s"><span class="live"></span><span id="hdr-upd">Loading…</span></div></div>
        <div class="hdr-clock" id="hdr-clock"></div>
        <div class="hdr-actions">
          <a class="icon-btn" href="index.html${qs}" title="Home" aria-label="Home">${ICONS.home}</a>
          <button class="icon-btn theme-toggle" id="theme-btn" title="Switch light / dark theme" aria-label="Switch light or dark theme">${ICONS.moon}${ICONS.sun}</button>
          <button class="icon-btn" id="fs-btn" title="Full screen" aria-label="Full screen">${ICONS.expand}</button>
        </div>`;
      const tick = () => { document.getElementById("hdr-clock").textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); };
      tick(); setInterval(tick, 10000);
      document.getElementById("theme-btn").onclick = () => window.KPITheme.toggle();
      document.getElementById("fs-btn").onclick = () => {
        if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.();
      };
    },
    setHeaderDay(day) {
      const isToday = day === todayKey();
      document.getElementById("hdr-day").textContent = (isToday ? "Today · " : "Latest · ") + fmtDate(day, { weekday: "long", day: "numeric", month: "long" });
      document.getElementById("hdr-upd").textContent = "Live · updated " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    },

    // Runs render(data) now and every REFRESH_SECONDS; keeps last good data on network errors.
    autoRefresh(render) {
      let last = null;
      const run = async () => {
        try { last = await KPI.load(); render(last); document.body.classList.remove("offline"); }
        catch (e) { console.error(e); document.body.classList.add("offline"); if (last) render(last); }
      };
      run();
      setInterval(run, CFG.REFRESH_SECONDS * 1000);
      // Reload the page every 6 h so TVs pick up site updates.
      setTimeout(() => location.reload(), 6 * 3600 * 1000);
      window.addEventListener("storage", run); // demo mode: admin in another tab
    },
  };

  function normalise(d) {
    const targets = { ...CFG.DEFAULT_TARGETS, ...(d.targets || {}) };
    const employees = (d.employees || []).map((e) => ({
      name: String(e.name).trim(),
      department: e.department || "Other",
      tasks: Array.isArray(e.tasks) ? e.tasks : String(e.tasks || "").split(",").map((s) => s.trim()).filter(Boolean),
      active: e.active !== false && e.active !== "FALSE" && e.active !== "false",
      photo: /^(data:image\/(jpeg|png|webp);base64,|https:\/\/)/.test(String(e.photo || "")) ? String(e.photo) : "",
    }));
    const entries = (d.entries || []).map((e) => ({ date: String(e.date).slice(0, 10), employee: String(e.employee).trim(), task: String(e.task).trim(), qty: Number(e.qty) || 0 }));
    const byKey = {};
    entries.forEach((e) => {
      const k = e.date + "|" + e.employee;
      byKey[k] = byKey[k] || {};
      byKey[k][e.task] = (byKey[k][e.task] || 0) + e.qty;
    });
    return { employees, targets, entries, byKey };
  }

  window.KPI = KPI;
})();

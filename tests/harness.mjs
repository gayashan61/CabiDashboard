// Test harness: the real schema in an in-memory Postgres with Supabase-like roles (RLS applies per signed-in
// user), a mocked Supabase Auth + the admin-users Edge Function contract, and a browser (installed Edge).
import { PGlite } from "@electric-sql/pglite";
import puppeteer from "puppeteer-core";
import fs from "fs";
import { fileURLToPath } from "url";
const repo = fileURLToPath(new URL("..", import.meta.url)); // the project folder
export const SITE = "http://127.0.0.1:8080/";
const DOMAIN = "tiljay.local";
export const IDS = { admin: "11111111-1111-1111-1111-111111111111", tv: "22222222-2222-2222-2222-222222222222", chamara: "33333333-3333-3333-3333-333333333333" };

export async function setup() {
  // sample counts from the client's sheet — private, kept in docs/ (not in git)
  const excel = JSON.parse(fs.readFileSync(repo + "docs/test-data.json", "utf8"));
  // the tests use made-up names; the real ones (and which made-up name stands for each) stay in docs/
  const fake = (s) => Object.entries(excel.pseudonyms || {}).reduce((t, [real, f]) => t.replace(new RegExp(`(?<![A-Za-z])${real}(?![a-z])`, "g"), f), s);
  for (const d in excel.days) excel.days[d].forEach((c) => (c.name = fake(c.name)));
  for (const d in excel.tsv) excel.tsv[d] = fake(excel.tsv[d]);
  const db = new PGlite();
  await db.exec(`create role anon nologin; create role authenticated nologin; create schema auth;
    create table auth.users (id uuid primary key, email text unique);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    grant usage on schema public to anon, authenticated; grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    alter default privileges in schema public grant execute on functions to anon, authenticated;`);
  await db.exec(fs.readFileSync(repo + "supabase/schema.sql", "utf8"));
  // accounts: email ➜ { id, password }
  const accounts = new Map([
    ["admin@test", { id: IDS.admin, password: "admin123" }],
    [`tv1@${DOMAIN}`, { id: IDS.tv, password: "tv1234" }],
    [`chamara@${DOMAIN}`, { id: IDS.chamara, password: "chamara123" }],
  ]);
  await db.exec(`insert into auth.users values ${[...accounts].map(([e, a]) => `('${a.id}', '${e}')`).join(",")};
    insert into admins (user_id, email) values ('${IDS.admin}', 'admin@test');
    insert into viewers (user_id, username, label) values ('${IDS.tv}', 'tv1', 'Factory TV');
    insert into employees (name, department, sort) values
    ('Kasun','Sheets, Sets',1),('Nuwan','Sheets',2),('Chamara','Sheets, Sets',3),('Ruwan','Sets, Sheets',4),('Tharushi','Sets, Rolls',5),
    ('Dinesh','Sheets, Sets, Rolls, Packing',6),('Saman','Sheets, Rolls',7),('Pradeep','Rolls, Sheets, Packing',8),('Nimali','Rolls, Packing',9),
    ('Ishara','Rolls, Packing',10),('Kavindi','Rolls, Packing',11),('Sachini','Rolls, Packing',12),('Gamini','Packing',13),('Lahiru','Packing, Rolls',14),
    ('Tharindu','Packing, Rolls',15),('Dulani','Packing, Sheets',16),('Sunil','Rolls, Sheets, Packing',17),('Chathura','Sets, Sheets',18),
    ('Yasas','Sheets',19),('Malith','Packing',20);
    update employees set user_id = '${IDS.chamara}', username = 'chamara' where name = 'Chamara';`);
  const jobs = (await db.query("select id, department, machine, name, unit from jobs order by sort")).rows;
  const lc = (s) => String(s || "").toLowerCase();
  const sc = (j, c) => (lc(j.machine) === lc(c.b)) * 4 + (lc(j.unit) === lc(c.b)) * 2 + (!c.b && !j.machine);
  const findJob = (c) => jobs.filter((j) => lc(j.name) === lc(c.job) && lc(j.department) === lc(c.dept)).sort((x, y) => sc(y, c) - sc(x, c))[0];
  for (const day of ["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24"]) {
    for (const c of excel.days[day]) await db.query("insert into entries (date, employee, job, qty) values ($1, $2, $3, $4) on conflict do nothing", [day, c.name, findJob(c).id, c.qty]);
  }

  const as = async (uid) => db.exec(`reset role; set test.uid = '${uid || ""}'; set role ${uid ? "authenticated" : "anon"}`);
  const calls = [];
  async function rpc(fn, a, uid) {
    const J = (v) => JSON.stringify(v ?? null);
    const sql = {
      get_data: ["select get_data($1::int) r", [Number(a.days) || 60]],
      data_version: ["select data_version() r", []],
      is_admin: ["select is_admin() r", []],
      whoami: ["select whoami() r", []],
      me: ["select me($1::int) r", [Number(a.days) || 400]],
      inbox: ["select inbox() r", []],
      admin_data: ["select admin_data() r", []],
      my_notifications: ["select my_notifications($1::int) r", [Number(a.p_limit) || 50]],
      read_notifications: ["select read_notifications($1::bigint[]) r", [a.p_ids ?? null]],
      submit_count: ["select submit_count($1::date, $2::int, $3::numeric) r", [a.p_date, a.p_job, a.p_qty ?? null]],
      review_submission: ["select review_submission($1::bigint, $2, $3::numeric, $4) r", [a.p_id, a.p_action, a.p_qty ?? null, a.p_note ?? ""]],
      save_assignments: ["select save_assignments($1, $2::int[]) r", [a.p_employee, a.p_jobs ?? []]],
      register_device: ["select register_device($1, $2) r", [a.p_token, a.p_platform]],
      unregister_device: ["select unregister_device($1) r", [a.p_token]],
      save_entries: ["select save_entries($1::date, $2::jsonb) r", [a.p_date, J(a.p_rows)]],
      save_jobs: ["select save_jobs($1::jsonb) r", [J(a.p_rows)]],
      save_departments: ["select save_departments($1::jsonb) r", [J(a.p_rows)]],
      save_employees: ["select save_employees($1::jsonb) r", [J(a.p_rows)]],
    }[fn];
    if (!sql) throw Object.assign(new Error("Could not find the function " + fn), { code: "PGRST202" });
    calls.push({ fn, args: a, uid });
    try { await as(uid); const r = (await db.query(sql[0], sql[1])).rows[0].r; return r === undefined ? null : r; }
    finally { await db.exec("reset role; set test.uid = ''"); }
  }
  // what supabase/functions/admin-users does, against this database
  async function adminUsers(b, uid) {
    if (!(await db.query(`select 1 from admins where user_id = '${uid}'`)).rows.length) return [403, { message: "Not allowed: this account is not an admin" }];
    const kind = b.kind === "viewer" ? "viewer" : "employee", username = String(b.username ?? "").trim().toLowerCase(), password = b.password ? String(b.password) : "";
    let userId = null;
    if (kind === "employee") {
      const e = (await db.query("select user_id from employees where name = $1", [String(b.employee ?? "")])).rows[0];
      if (!e) return [404, { message: `No employee called “${b.employee}” — save the employee first` }];
      userId = e.user_id;
    } else {
      userId = (await db.query("select user_id from viewers where username = $1", [String(b.current ?? username).toLowerCase()])).rows[0]?.user_id ?? null;
    }
    if (b.action === "delete") {
      if (userId) {
        for (const [e, a] of accounts) if (a.id === userId) accounts.delete(e);
        await db.query("delete from auth.users where id = $1", [userId]);
        if (kind === "employee") await db.query("update employees set user_id = null, username = null where name = $1", [b.employee]);
        else await db.query("delete from viewers where user_id = $1", [userId]);
      }
      return [200, { ok: true }];
    }
    if (!/^[a-z0-9._-]{3,32}$/.test(username)) return [400, { message: "Username: 3–32 letters, numbers, dots, dashes or underscores (no spaces)" }];
    if (password && password.length < 6) return [400, { message: "The password needs at least 6 characters" }];
    const email = `${username}@${DOMAIN}`;
    const taken = accounts.get(email);
    if (taken && taken.id !== userId) return [400, { message: `The username “${username}” is already taken` }];
    if (!userId) {
      if (!password) return [400, { message: "Set a password for the new login" }];
      userId = crypto.randomUUID();
      await db.query("insert into auth.users values ($1, $2)", [userId, email]);
      accounts.set(email, { id: userId, password });
    } else {
      let old = null; for (const [e, a] of accounts) if (a.id === userId) old = [e, a];
      if (old) { accounts.delete(old[0]); accounts.set(email, { id: userId, password: password || old[1].password }); }
      await db.query("update auth.users set email = $1 where id = $2", [email, userId]);
    }
    if (kind === "employee") await db.query("update employees set user_id = $1, username = $2 where name = $3", [userId, username, b.employee]);
    else await db.query("insert into viewers (user_id, username, label) values ($1, $2, $3) on conflict (user_id) do update set username = excluded.username, label = excluded.label", [userId, username, String(b.label ?? "")]);
    return [200, { ok: true, username }];
  }

  // One Supabase-style request ➜ [status, body]. path is everything after the project URL ("/rest/v1/rpc/me" …)
  async function handle(path, auth, body) {
    const tok = String(auth || "").replace(/^Bearer /, "");
    const uid = tok.startsWith("tok.") ? tok.slice(4) : null;
    if (tok && !uid) return [401, { message: "JWT expired" }];
    if (path.includes("/auth/v1/token?grant_type=password")) {
      const a = accounts.get(String(body.email).toLowerCase());
      if (!a || a.password !== body.password) return [400, { error_code: "invalid_credentials", msg: "Invalid login credentials" }];
      return [200, { access_token: "tok." + a.id, refresh_token: "ref." + a.id, expires_in: 3600, user: { email: body.email } }];
    }
    if (path.includes("/auth/v1/token?grant_type=refresh_token")) {
      const id = String(body.refresh_token).slice(4);
      const e = [...accounts].find(([, a]) => a.id === id)?.[0];
      if (!e) return [400, { error: "invalid_grant", error_description: "Invalid Refresh Token" }];
      return [200, { access_token: "tok." + id, refresh_token: "ref." + id, expires_in: 3600, user: { email: e } }];
    }
    if (path.includes("/auth/v1/logout")) return [204, null];
    if (path.includes("/functions/v1/admin-users")) return adminUsers(body, uid);
    const m = path.match(/\/rest\/v1\/rpc\/(\w+)/);
    if (m) {
      try { return [200, await rpc(m[1], body, uid)]; }
      catch (e) { return [e.code === "PGRST202" ? 404 : e.code === "42501" ? 403 : 400, { message: e.message, code: e.code }]; }
    }
    return [404, { message: "not mocked: " + path }];
  }

  let browser = null; // started on the first open()
  // opts: as ("admin" | "tv" | "chamara" | null = signed out), w, h, mobile, freeze (fixed clock 29 Sep 2026 14:30)
  async function open(path, { as: who = "admin", admin, w = 1600, h = 1000, mobile = false, freeze = true, isolated = false } = {}) {
    if (admin === false) who = null;
    browser = browser || await puppeteer.launch({ executablePath: process.env.BROWSER || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
    const page = isolated ? await (await browser.createBrowserContext()).newPage() : await browser.newPage(); // isolated = another device
    await page.setViewport({ width: w, height: h, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
    page.on("dialog", (d) => setTimeout(() => d.accept().catch(() => {}), 50)); // tests may handle a dialog themselves first
    await page.setRequestInterception(true);
    page.on("request", async (req) => {
      const u = req.url();
      if (u.startsWith(SITE) || u.startsWith("https://cdnjs.cloudflare.com/")) return req.continue();
      if (u.includes("supabase.co")) {
        const hdr = { "access-control-allow-origin": "*", "content-type": "application/json" };
        if (req.method() === "OPTIONS") return req.respond({ status: 204, headers: { ...hdr, "access-control-allow-headers": "apikey, authorization, content-type", "access-control-allow-methods": "POST, GET, OPTIONS" } });
        const [status, body] = await handle(u.replace(/^https:\/\/[^/]+/, ""), req.headers()["authorization"], JSON.parse(req.postData() || "{}"));
        return req.respond({ status, headers: hdr, body: body == null ? "" : JSON.stringify(body) });
      }
      req.abort(); // web fonts etc. — and never the real Supabase
    });
    const acct = who ? [...accounts].find(([, a]) => a.id === IDS[who]) : null;
    // set up storage once per tab (not on every navigation, or signing in would be undone)
    await page.evaluateOnNewDocument((s) => {
      if (sessionStorage.getItem("__harness")) return;
      localStorage.clear(); sessionStorage.clear(); sessionStorage.setItem("__harness", "1");
      if (s) localStorage.setItem("kpi_sb_session", JSON.stringify(s));
    },
      acct ? { access_token: "tok." + acct[1].id, refresh_token: "ref." + acct[1].id, expires_at: 4e9, email: acct[0] } : null);
    if (freeze) await page.evaluateOnNewDocument(() => {
      const T = new Date(2026, 8, 29, 14, 30, 0).getTime(), D = Date;
      class FD extends D { constructor(...a) { super(...(a.length ? a : [T])); } static now() { return T; } }
      window.Date = FD;
    });
    await page.goto(SITE + path, { waitUntil: "networkidle0" });
    return { page, errors };
  }
  const q = async (sql, params) => (await db.query(sql, params)).rows;
  return { db, q, calls, accounts, open, handle, excel, get browser() { return browser; }, close: () => browser?.close() };
}

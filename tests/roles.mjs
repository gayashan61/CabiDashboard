// Logins, roles, tasks, submissions and approvals — end to end in the browser.
import { setup, IDS } from "./harness.mjs";
import fs from "fs";
const h = await setup();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (ok, label, extra = "") => { results.push(!!ok); console.log(ok ? "ok  " : "FAIL", label, extra === "" ? "" : typeof extra === "string" ? extra : JSON.stringify(extra)); };
process.on("unhandledRejection", (e) => { console.log("CRASH:", e.message); process.exit(1); });
fs.mkdirSync("rshots", { recursive: true });
const shot = (p, n) => p.screenshot({ path: `rshots/${n}.png` });
const real = { freeze: false };
const today = (await h.q("select current_date::text d"))[0].d;
const jobId = async (machine, name) => (await h.q("select id from jobs where machine = $1 and name = $2", [machine, name]))[0].id;
const rt1 = await jobId("RT1", "Blank"), rt2 = await jobId("RT2", "1 color");
const signIn = async (page, user, pw) => {
  await page.waitForSelector("#signin:not([hidden])");
  await page.type("#un", user); await page.type("#pw", pw);
  await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }).catch(() => {}), page.click("#go")]);
  await wait(300);
};

// ── 1. Signing in sends each kind of login to the right place ──
{
  const { page, errors } = await h.open("index.html", { as: null, w: 390, h: 844, mobile: true, ...real });
  await page.waitForSelector("#signin:not([hidden])");
  await shot(page, "signin-phone");
  await page.type("#un", "chamara"); await page.type("#pw", "wrong-one");
  await page.click("#go"); await wait(400);
  check(/Wrong username or password/.test(await page.$eval("#err", (e) => e.textContent)), "wrong password is explained");
  await page.$eval("#pw", (i) => (i.value = "")); await page.type("#pw", "chamara123");
  await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), page.click("#go")]);
  check(page.url().endsWith("me.html"), "an employee lands on their own page", page.url());
  check(await page.$(".empty-card"), "no tasks yet: they're told to ask the admin");
  check(errors.length === 0, "no errors", errors.join(" | "));
  await page.close();
}
{
  const { page } = await h.open("tv-grid.html", { as: null, ...real });
  await wait(300);
  check(/index\.html\?next=tv-grid\.html/.test(page.url()), "a TV screen without a sign-in goes to the sign-in page", page.url());
  await signIn(page, "tv1", "tv1234");
  await page.waitForSelector(".tile");
  check(page.url().includes("tv-grid.html") && (await page.$$(".tile")).length === 20, "the TV account comes back to the team grid", page.url());
  check(await page.$("#hdr-logout"), "TV header has a sign-out button");
  await page.close();
}
for (const [who, path, expect] of [["chamara", "admin.html", "me.html"], ["tv", "admin.html", "index.html"], ["tv", "me.html", "index.html"], ["chamara", "tv-grid.html", "me.html"]]) {
  const { page } = await h.open(path, { as: who, ...real });
  await wait(400);
  check(page.url().endsWith(expect), `${who} opening ${path} ➜ ${expect}`, page.url());
  await page.close();
}

// ── 2. Admin: task lists, logins, TV logins ──
{
  const { page, errors } = await h.open("admin.html", { as: "admin", ...real });
  await page.waitForSelector(".tabs");
  await page.click('.tabs [data-t="employees"]');
  await page.waitForSelector("#tb");
  const row = async (name) => page.evaluateHandle((n) => [...document.querySelectorAll("#tb tr")].find((tr) => tr.dataset.orig === n), name);
  const chamara = await row("Chamara");
  check(/chamara/.test(await chamara.evaluate((tr) => tr.querySelector(".lg-cell").innerText)), "Chamara's login shows in Employees");
  await (await chamara.asElement().$(".tasks-btn")).click();
  await page.waitForSelector("dialog.dlg .tk-list");
  await page.evaluate((ids) => ids.forEach((id) => (document.querySelector(`.tk input[value="${id}"]`).checked = true)), [rt1, rt2]);
  await page.type("#t-q", "rt");
  await shot(page, "admin-tasks-dialog");
  await page.click("#t-ok"); await wait(600);
  const as = (await h.q("select job from assignments where employee = 'Chamara' order by job")).map((r) => r.job);
  check(as.join() === [rt1, rt2].sort((a, b) => a - b).join(), "tasks saved for Chamara", as);
  check(/2 tasks/.test(await chamara.evaluate((tr) => tr.querySelector(".tk-cell").innerText)), "the Tasks button shows the new count");
  const n1 = await h.q(`select title, body from notifications where user_id = '${IDS.chamara}'`);
  check(n1.length === 1 && n1[0].title === "2 new tasks for you", "Chamara is notified about the new tasks", n1[0]);
  // a login for Nuwan
  const nuwan = await row("Nuwan");
  await (await nuwan.asElement().$(".set-login")).click();
  await page.waitForSelector("#d-un");
  check((await page.$eval("#d-un", (i) => i.value)) === "nuwan" && (await page.$eval("#d-pw", (i) => i.value)).length >= 8, "suggests a username and a password");
  const pw = await page.$eval("#d-pw", (i) => i.value);
  await page.click("#d-ok"); await page.waitForSelector(".creds");
  await shot(page, "admin-login-saved");
  check((await page.$eval(".creds", (c) => c.innerText)).includes(pw) && h.accounts.get("nuwan@tiljay.local")?.password === pw, "login created; details shown once to pass on");
  await page.click("#d-close"); await wait(400);
  check(/nuwan/.test(await nuwan.evaluate((tr) => tr.querySelector(".lg-cell").innerText)), "Employees shows Nuwan's username");
  // a TV login
  await page.click("#add-tv"); await page.waitForSelector("#d-lb");
  await page.$eval("#d-un", (i) => (i.value = "office.tv")); await page.type("#d-lb", "Office");
  await page.click("#d-ok"); await page.waitForSelector(".creds");
  await page.click("#d-close"); await wait(700);
  check((await h.q("select username, label from viewers order by username")).map((r) => `${r.username}:${r.label}`).join() === "office.tv:Office,tv1:Factory TV", "TV login added");
  await shot(page, "admin-employees");
  check(errors.length === 0, "no errors in Employees", errors.join(" | "));
  await page.close();
}

// ── 3. Employee sends counts ──
{
  const { page, errors } = await h.open("me.html", { as: "chamara", w: 390, h: 844, mobile: true, ...real });
  await page.waitForSelector(".task");
  check((await page.$$(".task")).length === 2, "Chamara sees their 2 tasks");
  check(!(await page.$eval("#bell-n", (b) => b.hidden)), "bell shows the new-tasks notification");
  const inp = await page.$(`input[data-job="${rt1}"]`);
  await inp.type("1500+250");
  await page.click(`.send[data-job="${rt1}"]`); await wait(700);
  check(/waiting/i.test(await page.$eval(".toast", (t) => t.textContent)), "sent: waiting for approval");
  const s = (await h.q("select status, qty from submissions where employee = 'Chamara' and job = $1", [rt1]))[0];
  check(s?.status === "pending" && Number(s.qty) === 1750, "the sum is sent as 1,750, pending", s);
  check((await page.$eval(`.send[data-job="${rt1}"]`, (b) => b.textContent)) === "Update" && await page.$(".withdraw"), "still changeable while pending (Update / Withdraw)");
  await (await page.$(`input[data-job="${rt2}"]`)).type("300");
  await page.click(`.send[data-job="${rt2}"]`); await wait(700);
  await shot(page, "me-today-pending");
  check((await h.q(`select count(*)::int c from notifications where user_id = '${IDS.admin}' and kind = 'submission'`))[0].c === 2, "the admin got 2 notifications");
  check(errors.length === 0, "no errors on the employee page", errors.join(" | "));
  await page.close();
}

// ── 4. Admin approves (with a change) and rejects ──
{
  const { page, errors } = await h.open("admin.html", { as: "admin", ...real });
  await page.waitForSelector("#appr:not([hidden])");
  check((await page.$$("#appr .ap-row")).length === 2, "2 counts waiting in Daily entry", await page.$eval("#appr h2", (x) => x.textContent));
  await wait(400);
  check((await page.$eval("#pend-n", (b) => b.textContent)) === "2" && !(await page.$eval("#bell-n", (b) => b.hidden)), "badges: 2 pending, bell has unread");
  const pend = await page.$$eval("#eg input.pend", (i) => i.map((x) => x.placeholder));
  check(pend.includes("1,750") && pend.includes("300"), "the sheet shows the sent counts as hints in the right boxes", pend);
  await shot(page, "admin-approvals");
  const rows = await page.$$("#appr .ap-row");
  const byText = async (t) => { for (const r of await page.$$("#appr .ap-row")) if ((await r.evaluate((x) => x.innerText)).includes(t)) return r; };
  let r1 = await byText("Blank");
  await r1.$eval(".ap-q", (i) => (i.value = "1800")); await (await r1.$(".ap-note")).type("recounted");
  await (await r1.$(".ap-ok")).click(); await wait(900);
  check(/Approved as 1,800/.test(await page.$eval("#toast", (t) => t.textContent)), "approved with a change", await page.$eval("#toast", (t) => t.textContent));
  const e1 = (await h.q("select qty from entries where employee = 'Chamara' and job = $1 and date = $2", [rt1, today]))[0];
  check(Number(e1?.qty) === 1800, "the approved 1,800 is on the screens now");
  const r2 = await byText("1 color");
  await (await r2.$(".ap-note")).type("not your machine");
  await (await r2.$(".ap-no")).click(); await wait(900);
  check((await h.q("select status, note from submissions where job = $1", [rt2]))[0].note === "not your machine", "rejected with a reason");
  check(await page.$eval("#appr h2", (x) => x.textContent) === "Nothing waiting for approval", "nothing left waiting");
  // bell
  await page.click("#bell"); await page.waitForSelector(".bell-pop .nt");
  check((await page.$$(".bell-pop .nt")).length === 2, "bell lists the 2 submissions");
  check(errors.length === 0, "no errors in approvals", errors.join(" | "));
  await page.close();
}

// ── 5. Employee sees the results; approved counts are locked ──
{
  const { page, errors } = await h.open("me.html", { as: "chamara", w: 390, h: 844, mobile: true, ...real });
  await page.waitForSelector(".task");
  const t1 = await page.evaluate((id) => [...document.querySelectorAll(".task")].find((t) => !t.querySelector(`input[data-job="${id}"]`) && /Blank/.test(t.innerText))?.innerText.replace(/\s+/g, " "), rt1);
  check(t1 && /Changed by admin/.test(t1) && /1,800/.test(t1) && /you sent 1,750/.test(t1) && /recounted/.test(t1), "employee sees the changed, locked count", t1);
  check(!(await page.$(`input[data-job="${rt1}"]`)), "no box to change an approved count");
  const t2 = await page.evaluate(() => [...document.querySelectorAll(".task")].find((t) => /1 color/.test(t.innerText))?.innerText.replace(/\s+/g, " "));
  check(/Rejected/.test(t2) && /not your machine/.test(t2) && /Send again/.test(t2), "rejected: reason shown, can send again", t2);
  await shot(page, "me-today-results");
  await page.click('[data-t="notes"]'); await page.waitForSelector(".nt");
  const notes = await page.$$eval(".nt b", (b) => b.map((x) => x.textContent));
  check(notes.includes("Count changed by the admin") && notes.includes("Count rejected") && notes.includes("2 new tasks for you"), "notifications list", notes);
  await shot(page, "me-notifications");
  await page.click('[data-t="perf"]'); await page.waitForSelector(".pcard .dnav, #pane .dnav");
  const chips = await page.$$eval("#pane [data-key], #pane .seg3 button", (b) => b.map((x) => x.textContent.trim()));
  check(chips.includes("All Sheets") && chips.includes("Weekly") && chips.includes("Monthly"), "performance: date bar, Daily / Weekly / Monthly and an “All Sheets” chart", chips.slice(0, 6));
  await shot(page, "me-performance");
  const ow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  check(ow <= 1, "no sideways scroll on the phone", ow);
  check(errors.length === 0, "no errors", errors.join(" | "));
  await page.close();
}
// direct API attempts from the employee's login (what a modified app could try)
{
  const tryRpc = async (fn, body) => {
    const { page } = await h.open("index.html", { as: "chamara", ...real });
    const r = await page.evaluate(async (fn, body) => {
      const s = JSON.parse(localStorage.getItem("kpi_sb_session"));
      const res = await fetch(`${KPI_CONFIG.SUPABASE_URL}/rest/v1/rpc/${fn}`, { method: "POST", headers: { apikey: "x", Authorization: "Bearer " + s.access_token, "Content-Type": "application/json" }, body: JSON.stringify(body) });
      return [res.status, await res.text()];
    }, fn, body);
    await page.close(); return r;
  };
  const sub = (await h.q("select id from submissions where job = $1", [rt1]))[0].id;
  let [st, txt] = await tryRpc("review_submission", { p_id: sub, p_action: "approve" });
  check(st >= 400 && /not an admin/.test(txt), "an employee can't approve through the API", st);
  [st, txt] = await tryRpc("submit_count", { p_date: today, p_job: rt1, p_qty: 99999 });
  check(st >= 400 && /already approved/.test(txt), "…or overwrite an approved count", st);
  [st, txt] = await tryRpc("get_data", { days: 60 });
  check(st >= 400 && /can't open the team screens/.test(txt), "…or read the whole factory's data", st);
}

// ── 6. The profile chart shows every day they worked in a department, not just one task ──
{
  const days = (await h.q(`select d::date::text d from generate_series(current_date - 6, current_date - 1, interval '1 day') d where extract(dow from d) <> 0 order by d desc limit 3`)).map((r) => r.d);
  const sheetsJobs = (await h.q("select id from jobs where department = 'Sheets' and unit = 'sheets' order by sort limit 3")).map((r) => r.id);
  for (let i = 0; i < 3; i++) await h.q("insert into entries (date, employee, job, qty) values ($1, 'Nuwan', $2, $3)", [days[i], sheetsJobs[i], 8000 + i * 1000]);
  const { page, errors } = await h.open("tv-grid.html", { as: "tv", w: 1920, h: 1080, ...real });
  await page.waitForSelector(".tile");
  await page.click('[data-name="Nuwan"]'); await wait(500);
  const vals = await page.$$eval(".cols7 .c7-v span", (s) => s.map((x) => x.textContent.trim()));
  const shown = vals.filter((v) => v !== "–").length;
  check(shown >= 3, "daily chart: a bar for each day worked, though each day was a different Sheets task", vals);
  await page.click('[data-period="weekly"]'); await wait(300);
  const wk = await page.$$eval(".cols7 .c7-v span", (s) => s.map((x) => x.textContent.trim()).filter((v) => v !== "–").length);
  check(wk >= 1, "weekly shows them too");
  await shot(page, "tv-profile-allsheets");
  check(errors.length === 0, "no errors", errors.join(" | "));
  await page.close();
}

await h.close();
console.log(results.every(Boolean) ? "\nALL PASSED" : `\n${results.filter((x) => !x).length} FAILED`);

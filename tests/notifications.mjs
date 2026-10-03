// TEST user end to end: created by the admin, tasks + login, sends counts, admin decides, colour-coded notifications, then removed.
import { setup } from "./harness.mjs";
import fs from "fs";
const h = await setup();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (ok, label, extra = "") => { results.push(!!ok); console.log(ok ? "ok  " : "FAIL", label, typeof extra === "string" ? extra : JSON.stringify(extra)); };
process.on("unhandledRejection", (e) => { console.log("CRASH:", e.message); process.exit(1); });
fs.mkdirSync("nshots", { recursive: true });
const jobId = async (machine, name) => (await h.q("select id from jobs where machine = $1 and name = $2", [machine, name]))[0].id;
const J = [await jobId("RT1", "Blank"), await jobId("RT2", "1 color"), await jobId("Collator 1", "Blank")];
const real = { freeze: false };
const cards = (page, root) => page.$$eval(`${root} .nt`, (els) => els.map((e) => ({ tone: [...e.classList].find((c) => c.startsWith("tone-")), tag: e.querySelector(".nt-tag")?.textContent, title: e.querySelector("b")?.textContent, band: getComputedStyle(e).borderLeftColor, kind: e.dataset.kind, date: e.dataset.date })));

// 1. admin adds TEST User, saves, gives 3 tasks and a login
const A = await h.open("admin.html", { as: "admin", w: 1600, h: 931, ...real });
let P = A.page;
await P.waitForSelector(".tabs"); await P.click('.tabs [data-t="employees"]'); await P.waitForSelector("#tb");
await P.click("#add"); await P.keyboard.type("TEST User");
await P.click("#save"); await wait(900);
const row = 'tr[data-orig="TEST User"]';
check(await P.$(row), "TEST User saved");
await P.click(`${row} .set-login`); await P.waitForSelector("#d-un");
const un = await P.$eval("#d-un", (i) => i.value);
await P.$eval("#d-pw", (i) => (i.value = "test@123"));
await P.click("#d-ok"); await P.waitForSelector(".creds"); await P.click("#d-close"); await wait(500);
await P.click(`${row} .tasks-btn`); await P.waitForSelector("#tk");
await P.evaluate((ids) => ids.forEach((id) => (document.querySelector(`.tk input[value="${id}"]`).checked = true)), J);
await P.click("#t-ok"); await wait(700);
check(un === "test.user" && /3 tasks/.test(await P.$eval(`${row} .tk-cell`, (c) => c.textContent)), "login test.user + 3 tasks", un);

// 2. TEST signs in: "3 new tasks" card is blue / New task
const E = await h.open("index.html", { as: null, w: 390, h: 844, mobile: true, isolated: true, ...real });
let M = E.page;
await M.waitForSelector("#signin:not([hidden])");
await M.type("#un", "test.user"); await M.type("#pw", "test@123");
await Promise.all([M.waitForNavigation({ waitUntil: "networkidle0" }), M.click("#go")]);
check(M.url().endsWith("me.html"), "TEST user lands on their page", M.url());
await M.waitForSelector(".task");
check((await M.$$(".task")).length === 3, "sees their 3 tasks");
// 3. sends 3 counts
for (const [j, q] of [[J[0], "12"], [J[1], "34"], [J[2], "54"]]) { await M.type(`input[data-job="${j}"]`, q); await M.click(`.send[data-job="${j}"]`); await wait(600); }
check((await h.q("select count(*)::int n from submissions where employee = 'TEST User' and status = 'pending'"))[0].n === 3, "3 counts waiting");

// 4. admin: bell shows violet "To approve"; tapping opens the approvals
await P.bringToFront(); await P.reload({ waitUntil: "networkidle0" }); await P.waitForSelector("#bell"); await P.screenshot({ path: "nshots/0-admin.png" });
await P.click("#bell");await P.waitForSelector("#bell-pop .nt");
const bell = await cards(P, "#bell-pop");
check(bell.filter((c) => c.tone === "tone-violet" && c.tag === "To approve").length === 3, "admin bell: 3 violet “To approve” cards", bell.map((c) => c.tag));
await P.screenshot({ path: "nshots/1-admin-bell.png" });
await P.click("#bell-pop .nt"); await wait(600);
check(await P.$eval("#bell-pop", (p) => p.hidden) && await P.$("#appr .ap-row"), "tapping it opens the approvals");
const R = async (re) => { for (const el of await P.$$("#appr .ap-row")) if (re.test(await el.evaluate((x) => x.textContent))) return el; };
let r = await R(/Collator 1/); await (await r.$(".ap-ok")).click(); await wait(800);
r = await R(/RT1/); await r.$eval(".ap-q", (i) => (i.value = "322")); await (await r.$(".ap-ok")).click(); await wait(800);
r = await R(/RT2/); await (await r.$(".ap-note")).type("wrong machine"); await (await r.$(".ap-no")).click(); await wait(800);
const st = (await h.q("select status from submissions where employee = 'TEST User' order by job")).map((x) => x.status);
check(st.sort().join() === "approved,edited,rejected", "approved / changed / rejected", st);

// 5. TEST: green / amber / red cards
await M.bringToFront(); await M.reload({ waitUntil: "networkidle0" }); await M.click('[data-t="notes"]'); await M.waitForSelector("#pane .nt");
const mine = await cards(M, "#pane");
console.log(mine.map((c) => `${c.tag} ${c.tone} ${c.band} – ${c.title}`).join("\n"));
const has = (tag, tone) => mine.some((c) => c.tag === tag && c.tone === tone);
check(has("Approved", "tone-good") && has("Changed", "tone-warning") && has("Rejected", "tone-critical") && has("New task", "tone-accent"), "employee cards: green Approved, amber Changed, red Rejected, blue New task");
check(new Set(mine.map((c) => c.band)).size === 4, "four different band colours");
await M.screenshot({ path: "nshots/2-employee-dark.png", fullPage: true });
await M.evaluate(() => KPITheme.toggle()); await wait(300);
await M.screenshot({ path: "nshots/3-employee-light.png", fullPage: true });
await M.evaluate(() => KPITheme.toggle());
// tapping a decision opens My tasks on that day
await M.click("#pane .nt.tone-warning"); await wait(600);
check(await M.$eval('.tabs [data-t="today"]', (b) => b.classList.contains("on")) && /322/.test(await M.$eval("#pane", (p) => p.textContent)), "tapping “Changed” opens My tasks showing 322");
check(A.errors.length + E.errors.length === 0, "no page errors", [...A.errors, ...E.errors].join(" | "));
await M.close();

// 6. admin removes TEST User (and its login)
await P.bringToFront();
await P.click('.tabs [data-t="employees"]'); await P.waitForSelector(row);
await P.click(`${row} .del-emp`); await wait(300);
await P.click("#save"); await wait(1200);
check(!(await h.q("select 1 from employees where name = 'TEST User'")).length && !h.accounts.has("test.user@tiljay.local"), "TEST User and their login removed");
await h.close();
console.log(results.every(Boolean) ? "\nALL PASSED" : `\n${results.filter((x) => !x).length} FAILED`);
process.exit(0);

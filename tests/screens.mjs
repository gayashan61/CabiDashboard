import { setup } from "./harness.mjs";
import fs from "fs";
const h = await setup();
const db = h.db, calls = h.calls, excel = h.excel;
const results = [];
const check = (ok, label, extra = "") => { results.push(ok); console.log(ok ? "ok  " : "FAIL", label, extra); };
// the 22-9 sheet is pasted in by the test below
await db.exec("delete from entries where date = '2026-09-22'");
const jobs = (await db.query("select id, department, machine, name, unit from jobs order by sort")).rows;
const lc = (s) => String(s || "").toLowerCase();
const sc = (j, c) => (lc(j.machine) === lc(c.b)) * 4 + (lc(j.unit) === lc(c.b)) * 2 + (!c.b && !j.machine);
const findJob = (c) => jobs.filter((j) => lc(j.name) === lc(c.job) && lc(j.department) === lc(c.dept)).sort((x, y) => sc(y, c) - sc(x, c))[0];
const expected22 = excel.days["2026-09-22"].map((c) => ({ employee: c.name, job: findJob(c).id, qty: c.qty }));
const open = (path, opts = {}) => h.open(path, { as: "admin", ...opts });
const shot = (page, name) => page.screenshot({ path: `shot-${name}.png` });

// ── 1. Daily entry: paste the client's 22-9 sheet ──
{
  const { page, errors } = await open("admin.html", { admin: true });
  await page.waitForSelector("#eg", { timeout: 8000 }).catch(async () => { console.log("PAGE:", (await page.evaluate(() => document.body.innerText)).slice(0, 400), errors); await shot(page, "debug"); process.exit(1); });
  const heads = await page.$$eval("#eg thead th.c-p", (t) => t.map((x) => x.textContent));
  const groups = await page.$$eval("#eg tr.g", (t) => t.map((x) => x.textContent.trim()));
  check(heads.length === 20 && groups.join(",") === "Sheets,Sets,Packing,Rolls,Clean,Stores", "grid shows 20 people and the 6 departments", `${heads.length} / ${groups}`);
  // go to 22 Sep
  await page.$eval("#day", (i) => { i.value = "2026-09-22"; i.dispatchEvent(new Event("change")); });
  await page.waitForFunction(() => document.querySelector(".datebig").textContent.includes("22"));
  await page.focus("#eg tbody input");
  await page.evaluate((txt) => {
    const dt = new DataTransfer(); dt.setData("text/plain", txt);
    document.activeElement.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  }, excel.tsv["2026-09-22"]);
  const toastTxt = await page.$eval("#toast", (t) => t.textContent);
  check(/11 counts/.test(toastTxt) && !/Skipped/.test(toastTxt), "pasting the whole Excel sheet fills 11 counts", toastTxt);
  check((await page.$eval("#chg", (x) => x.textContent)) === "11 unsaved change(s)", "save bar shows 11 changes");
  const rt2 = await page.evaluate(() => { const tr = [...document.querySelectorAll("#eg tbody tr[data-job]")].find((r) => r.querySelector(".c-job").textContent.startsWith("RT2")); return tr.querySelector(".c-tot").textContent; });
  check(rt2 === "350,100 sheets", "row total for RT2 1 color", rt2);
  await shot(page, "entry-pasted");
  calls.length = 0;
  const cover = await page.evaluate(() => { const b = document.querySelector("#save"); b.scrollIntoView({ block: "center" }); const r = b.getBoundingClientRect(); const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return { r: [r.x, r.y, r.width, r.height, innerHeight], top: el?.outerHTML.slice(0, 120) }; });
  console.log("save button:", JSON.stringify(cover));
  await page.click("#save");
  await page.waitForFunction(() => /Saved 11/.test(document.querySelector("#toast").textContent), { timeout: 5000 }).catch(async () => {
    console.log("TOAST:", await page.$eval("#toast", (t) => t.textContent), "/ save:", await page.$eval("#save", (b) => b.disabled + " " + b.textContent), calls.map((c) => c.fn));
  });
  const sent = calls.find((c) => c.fn === "save_entries").args.p_rows;
  const norm = (a) => a.map((r) => `${r.employee}|${r.job}|${Number(r.qty)}`).sort().join(";");
  check(norm(sent) === norm(expected22), "saved rows match the Excel sheet exactly");
  const inDb = (await db.query("select employee, job, qty from entries where date = '2026-09-22'")).rows;
  check(norm(inDb) === norm(expected22), "database now holds the 22-9 sheet");

  // keyboard: type a sum, Enter moves down, Escape reverts
  const first = await page.$("#eg tbody tr[data-job] input[data-c='0']");
  await first.click({ clickCount: 3 });
  await page.keyboard.type("1500+250");
  await page.keyboard.press("Enter");
  const moved = await page.evaluate(() => { const a = document.activeElement; return a.dataset.c + "|" + [...document.querySelectorAll("#eg tbody tr[data-job]")].indexOf(a.closest("tr")); });
  check(moved === "0|1", "Enter moves one row down", moved);
  check((await page.$eval("#eg tbody tr[data-job] .c-tot", (x) => x.textContent)) === "1,750 sheets", "sum typed like Excel (1500+250) counts in the total");
  await page.keyboard.press("ArrowRight"); await page.keyboard.press("ArrowUp");
  const at = await page.evaluate(() => document.activeElement.dataset.c);
  check(at === "1", "arrow keys move sideways and up", at);
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Escape");
  check((await page.$eval("#eg tbody tr[data-job] input[data-c='0']", (x) => x.value)) === "113500", "Escape puts back the saved value");
  // Excel export of 22-9 (on the Rolls tab, to prove it still exports every department)
  await page.click('.dtabs [data-d="Rolls"]');
  const dl = process.cwd() + "\\dl";
  fs.rmSync(dl, { recursive: true, force: true }); fs.mkdirSync(dl);
  const cdp = await page.createCDPSession();
  await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: dl });
  await page.click("#export");
  await page.waitForFunction(() => /Downloaded|failed/.test(document.querySelector("#toast").textContent), { timeout: 20000 });
  console.log("     toast:", await page.$eval("#toast", (t) => t.textContent));
  for (let i = 0; i < 40 && !fs.existsSync(dl + "\\Production 2026-09-22.xlsx"); i++) await new Promise((r) => setTimeout(r, 250));
  check(fs.existsSync(dl + "\\Production 2026-09-22.xlsx"), "Export Excel downloads Production 2026-09-22.xlsx");
  await page.click('.dtabs [data-d=""]');
  // block paste from a cell
  const cell = await page.$("#eg tbody tr[data-job]:nth-of-type(4) input[data-c='2']");
  await cell.focus();
  await page.evaluate(() => { const dt = new DataTransfer(); dt.setData("text/plain", "5\t6\r\n7\tx\r\n"); document.activeElement.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true })); });
  const bad = await page.$$eval("#eg input.bad", (x) => x.length);
  check(bad === 1 && (await page.$eval("#save", (b) => b.disabled)), "block paste fills 4 boxes; the text one is flagged and blocks saving");
  // department filter keeps edits
  const badges = await page.$$eval(".dtabs button", (b) => b.map((x) => x.textContent.trim()).join(" / "));
  check(badges.startsWith("All departments14 / Sheets7 / Sets1 / Packing2 / Rolls4 / Clean / Stores"), "department tabs show how many boxes are filled (live while typing)", badges);
  await page.click('.dtabs [data-d="Rolls"]');
  const cols = await page.$$eval("#eg thead th.c-p", (t) => t.length);
  const rows = await page.$$eval("#eg tr.g", (t) => t.map((x) => x.textContent.trim()).join(","));
  check(rows === "Rolls" && (await page.$eval('.dtabs [data-d="Rolls"]', (b) => b.classList.contains("on"))), "Rolls tab shows only Rolls tasks", rows);
  await shot(page, "entry-tab-rolls");
  await page.click('.dtabs [data-d=""]');
  check((await page.$eval("#chg", (x) => x.textContent)).includes("invalid"), "switching the department filter keeps typed values", `Rolls columns: ${cols}`);
  await shot(page, "entry-edit");
  // phone width
  await page.setViewport({ width: 390, height: 844 });
  await shot(page, "entry-phone");
  const hscroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check(!hscroll, "no sideways page scroll on a phone (the sheet scrolls inside its box)");
  check(errors.length === 0, "no errors on the admin page", errors.join(" | "));
  await page.close();
}

// ── 2. Jobs tab ──
{
  const { page, errors } = await open("admin.html", { admin: true });
  await page.waitForSelector(".tabs");
  await page.evaluate(() => [...document.querySelectorAll(".tabs button")].find((b) => b.dataset.t === "jobs").click());
  await page.waitForSelector(".jobs-card");
  check((await page.$$eval(".job-table tbody tr", (r) => r.length)) === 33, "Jobs tab lists the 33 jobs from the sheet");
  const visible = () => page.$$eval(".jobs-card", (c) => c.filter((x) => !x.hidden).map((x) => x.dataset.dept).join());
  const tabs = await page.$$eval("#jtabs button", (b) => b.map((x) => x.textContent.trim()).join(" / "));
  check((await visible()) === "Sheets" && tabs === "Sheets10 / Sets5 / Packing9 / Rolls5 / Clean1 / Stores3", "Tasks tab: department tabs with task counts, one department shown", tabs);
  await page.click('#jtabs [data-d="Packing"]');
  check((await visible()) === "Packing", "clicking a tab shows that department's tasks");
  await shot(page, "tasks-tabs");
  await shot(page, "jobs");
  await page.evaluate(() => {
    const card = [...document.querySelectorAll(".jobs-card")].find((c) => c.dataset.dept === "Clean");
    card.querySelector(".add").click();
    const tr = card.querySelector("tbody tr:last-child");
    tr.querySelector(".nm").value = "Mops"; tr.querySelector(".nm").dispatchEvent(new Event("input", { bubbles: true }));
    const st = [...document.querySelectorAll(".jobs-card")].find((c) => c.dataset.dept === "Stores");
    st.querySelector("tbody tr .del").click(); // Reels, no counts
  });
  await page.click("#save");
  await page.waitForFunction(() => /Tasks saved/.test(document.querySelector("#toast").textContent));
  const j = (await db.query("select name, unit, active from jobs where department in ('Clean','Stores') order by sort, id")).rows.map((r) => `${r.name}:${r.unit}:${r.active}`).join(" ");
  check(j.includes("Mops:bags:true") && j.includes("Reels:nos:false"), "adding and removing jobs saves", j);
  check(errors.length === 0, "no errors on the Jobs tab", errors.join(" | "));
  await page.close();
}

// ── 3. TV screens on 21-9 ──
// 23 Sep: Saman (main department Sheets) only did TH rolls in Rolls
{
  const { page, errors } = await open("tv-grid.html?date=2026-09-23", { w: 1920, h: 1080 });
  await new Promise((r) => setTimeout(r, 600));
  const m = await page.$eval('[data-name="Saman"]', (t) => t.innerText.replace(/\s+/g, " "));
  check(/–\s?No Sheets count/.test(m) && /TH 3,000 rolls/.test(m) && !/Above avg|Near avg|Below avg/.test(m), "no work in the main department: “–  No Sheets count”, other counts listed", m);
  await page.click('[data-name="Saman"]'); await new Promise((r) => setTimeout(r, 400));
  const head = await page.$eval(".ps-head", (h) => h.innerText.replace(/\s+/g, " "));
  check(/–\s?No Sheets count/.test(head) && /other departments/.test(head), "profile header shows the same", head.slice(0, 120));
  await page.screenshot({ path: "shot-away.png" });
  check(errors.length === 0, "no errors", errors.join(" | "));
  await page.close();
}
for (const [name, path] of [["grid", "tv-grid.html?date=2026-09-21"], ["departments", "tv-departments.html?date=2026-09-21"], ["slides", "tv-slides.html?date=2026-09-21"]]) {
  const { page, errors } = await open(path, { w: 1920, h: 1080 });
  await new Promise((r) => setTimeout(r, 800));
  await shot(page, "tv-" + name);
  if (name === "grid") {
    const dulani = await page.$eval('[data-name="Dulani"]', (t) => t.innerText.replace(/\s+/g, " "));
    check(/250\s?sheets/.test(dulani) && /Printed.*Sample.*\+ 2 more tasks/.test(dulani), "Dulani (main dept Packing): big number from Packing, Packing tasks listed first", dulani);
    await page.click('[data-name="Sachini"]');
    await new Promise((r) => setTimeout(r, 400));
    await shot(page, "tv-profile");
  }
  if (name === "departments") {
    const pack = await page.evaluate(() => [...document.querySelectorAll(".col")].find((c) => c.innerText.startsWith("Packing"))?.innerText.replace(/\s+/g, " "));
    check(/1,?050|1\.1k/.test(pack) && /750 sheets/.test(pack), "Packing column: boxes total + other units", pack?.slice(0, 160));
  }
  check(errors.length === 0, `no errors on tv-${name}`, errors.join(" | "));
  await page.close();
}
await h.close();
console.log(results.every(Boolean) ? "\nALL PASSED" : `\n${results.filter((x) => !x).length} FAILED`);

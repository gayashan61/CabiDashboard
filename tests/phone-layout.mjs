// Phone behaviour checks (390×844, touch)
import { setup } from "./harness.mjs";
import fs from "fs";
const h = await setup();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (ok, label, extra = "") => { results.push(ok); console.log(ok ? "ok  " : "FAIL", label, extra); };
const phone = { w: 390, h: 844, mobile: true };
const swipe = async (page, sel, dx) => {
  await page.evaluate((sel, dx) => {
    const el = document.querySelector(sel), r = el.getBoundingClientRect();
    const t = (x) => new Touch({ identifier: 1, target: el, clientX: x, clientY: r.top + 100 });
    el.dispatchEvent(new TouchEvent("touchstart", { touches: [t(200)], changedTouches: [t(200)], bubbles: true }));
    el.dispatchEvent(new TouchEvent("touchend", { touches: [], changedTouches: [t(200 + dx)], bubbles: true }));
  }, sel, dx);
  await wait(300);
};

// ── Daily entry as cards ──
{
  const { page, errors } = await h.open("admin.html", { admin: true, ...phone });
  await page.waitForSelector("#ec");
  check(!(await page.$("#eg")), "phone shows task cards, not the wide sheet");
  await page.click('.dtabs [data-d="Clean"]');
  const card = '#ec .ec-card';
  check(await page.$eval(card, (c) => c.classList.contains("open")), "a department with one task opens it straight away");
  await page.click('.dtabs [data-d="Sets"]');
  const closed = await page.$$eval("#ec .ec-card", (cs) => cs.filter((c) => !c.classList.contains("open")).length);
  await page.click("#ec .ec-card .ec-h");
  check(await page.$eval("#ec .ec-card", (c) => c.classList.contains("open") && !c.querySelector(".ec-b").hidden), "tapping a task opens its card", `${closed} closed before`);
  const firstCard = await page.$("#ec .ec-card");
  const mine = await firstCard.$$eval(".ec-b > .ec-r", (r) => r.map((x) => x.querySelector(".ec-nm").childNodes[0].textContent));
  check(mine.join(",") === "Kasun,Chamara,Ruwan,Tharushi,Dinesh,Chathura", "its own department's people come first", mine.join(","));
  await firstCard.$eval(".ec-more", (b) => b.click());
  check(await firstCard.$eval(".ec-others", (o) => !o.hidden && o.querySelectorAll("input").length === 14), "“+ 14 people from other departments” shows the rest");
  // type, Enter moves on, total + unsaved count update
  const ins = await firstCard.$$(".ec-b input");
  await ins[0].focus(); await page.keyboard.type("1500+250"); await page.keyboard.press("Enter");
  check(await page.evaluate(() => document.activeElement.dataset.emp) === "Chamara", "Enter / Next moves to the next person");
  await page.keyboard.type("abc");
  check(await firstCard.$eval(".c-tot", (t) => t.textContent) === "1,750 sets" && await page.$eval("#chg", (x) => x.textContent).then((t) => /invalid/.test(t)), "card total adds sums; text is flagged invalid");
  await page.keyboard.press("Escape");
  check(await page.$eval("#chg", (x) => x.textContent) === "1 unsaved change(s)", "Esc puts back the saved value");
  // switching tabs keeps unsaved values
  await page.click('.dtabs [data-d="Rolls"]'); await page.click('.dtabs [data-d="Sets"]');
  check(await page.$eval("#ec .ec-card input", (i) => i.value) === "1500+250", "unsaved values survive switching department tabs");
  // save on phone
  h.calls.length = 0;
  await page.click("#save");
  await page.waitForFunction(() => /Saved 1/.test(document.querySelector("#toast").textContent), { timeout: 5000 });
  const sent = h.calls.find((c) => c.fn === "save_entries").args.p_rows;
  check(sent.length === 1 && sent[0].employee === "Kasun" && sent[0].qty === 1750, "Save sends the right count", JSON.stringify(sent));
  // day change warns about unsaved changes
  const ins2 = await page.$$("#ec .ec-card .ec-b input");
  await ins2[1].focus(); await page.keyboard.type("5");
  let dialog = null; page.once("dialog", async (d) => { dialog = d.message(); await d.dismiss(); });
  await page.click("#prev"); await wait(200);
  check(/unsaved/i.test(dialog || "") && (await page.$eval("#chg", (x) => x.textContent)).includes("1 unsaved"), "changing the day warns and keeps the values", dialog);
  // export from the ⋯ menu
  const dl = process.cwd() + "\\dl-m"; fs.rmSync(dl, { recursive: true, force: true }); fs.mkdirSync(dl);
  const cdp = await page.createCDPSession();
  await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: dl });
  check(await page.$eval("#export", (b) => getComputedStyle(b).display === "none"), "the Export button moves into the ⋯ menu on phones");
  await page.click(".more-menu > summary"); await page.click("#export-m");
  await page.waitForFunction(() => /Downloaded|failed/.test(document.querySelector("#toast").textContent), { timeout: 20000 });
  for (let i = 0; i < 40 && !fs.readdirSync(dl).some((f) => f.endsWith(".xlsx")); i++) await wait(250);
  check(fs.readdirSync(dl).some((f) => f.endsWith(".xlsx")), "Export Excel from the ⋯ menu downloads the file", fs.readdirSync(dl).join());
  // rotating to desktop width switches to the grid, values kept
  await page.setViewport({ width: 1280, height: 800, isMobile: true, hasTouch: true }); await wait(300);
  check(!!(await page.$("#eg")) && (await page.$eval("#chg", (x) => x.textContent)).includes("1 unsaved"), "wider window switches to the sheet and keeps unsaved values");
  const tgt = await page.evaluate(() => [...document.querySelectorAll(".tabs button, .dtabs button, #ec .ec-h")].map((b) => b.getBoundingClientRect().height));
  check(errors.length === 0, "no errors in admin on the phone", errors.join(" | "));
  await page.close();
}
// touch target sizes on the phone
{
  const { page } = await h.open("admin.html", { admin: true, ...phone });
  await page.waitForSelector("#ec");
  const small = await page.evaluate(() => [...document.querySelectorAll("button, summary, a, input:not([type=checkbox]), select")]
    .filter((b) => b.offsetParent && getComputedStyle(b).visibility !== "hidden")
    .map((b) => { const r = b.getBoundingClientRect(); return { t: (b.id || b.className || b.tagName) + ":" + (b.textContent || "").trim().slice(0, 14), h: Math.round(r.height), w: Math.round(r.width) }; })
    .filter((x) => x.h < 44 || x.w < 44));
  check(small.length === 0, "every button and box on Daily entry is at least 44×44", JSON.stringify(small.slice(0, 6)));
  const fs16 = await page.$$eval("input", (i) => i.filter((x) => x.offsetParent && parseFloat(getComputedStyle(x).fontSize) < 16).length);
  check(fs16 === 0, "inputs use at least 16px text (no zoom on iPhone)");
  await page.close();
}
// ── Team grid ──
{
  const { page, errors } = await h.open("tv-grid.html?date=2026-09-21", phone);
  const cols = await page.$eval("#grid", (g) => getComputedStyle(g).gridTemplateColumns.split(" ").length);
  check(cols === 1, "team grid: one column on a phone");
  await page.click('[data-name="Dulani"]');
  check(await page.$eval("#profile", (p) => !p.hidden) && (await page.$eval("#pf-side", (s) => getComputedStyle(s).visibility)) === "hidden", "tapping a tile opens the profile; team list is tucked away");
  await page.click("#pf-find"); await wait(350);
  check(await page.$eval("#pf-side", (s) => s.classList.contains("open") && getComputedStyle(s).visibility === "visible"), "Search team opens the bottom sheet");
  await page.type("#pf-q", "sach");
  check((await page.$$eval("#pf-list [data-name]", (l) => l.map((x) => x.dataset.name))).join() === "Sachini", "search filters the team");
  await page.click('#pf-list [data-name="Sachini"]'); await wait(350);
  check(!(await page.$eval("#pf-side", (s) => s.classList.contains("open"))) && (await page.$eval(".ps-name", (n) => n.textContent)) === "Sachini", "picking someone closes the sheet and shows them");
  await page.click("#pf-back-m");
  check(await page.$eval("#profile", (p) => p.hidden), "‹ All goes back to the list");
  check(await page.$eval(".seg", (s) => getComputedStyle(s).position === "fixed" && s.getBoundingClientRect().bottom === innerHeight), "the view switcher is a bottom navigation bar");
  check(errors.length === 0, "no errors on the team grid", errors.join(" | "));
  await page.close();
}
// ── Departments ──
{
  const { page, errors } = await h.open("tv-departments.html?date=2026-09-21", phone);
  const shown = () => page.$$eval(".col", (c) => c.filter((x) => getComputedStyle(x).display !== "none").map((x) => x.querySelector(".col-name").textContent.trim()));
  check((await shown()).join() === "Sheets", "one department at a time", (await shown()).join());
  await swipe(page, "#cols", -120);
  check((await shown()).join() === "Sets" && (await page.$eval("#mtabs .on", (b) => b.textContent.trim())) === "Sets", "swiping left shows the next department");
  await page.click('#mtabs [data-d="Packing"]');
  check((await shown()).join() === "Packing", "tabs pick a department");
  await swipe(page, "#cols", 120);
  check((await shown()).join() === "Sets", "swiping right goes back");
  check(errors.length === 0, "no errors on departments", errors.join(" | "));
  await page.close();
}
// ── Slideshow ──
{
  const { page, errors } = await h.open("tv-slides.html?date=2026-09-21", phone);
  check((await page.$eval("#slbl", (l) => l.textContent)).includes("Paused"), "slideshow does not auto-advance on a phone");
  const kc = await page.$eval(".kpis", (k) => getComputedStyle(k).gridTemplateColumns.split(" ").length);
  check(kc === 2, "department cards two per row");
  await swipe(page, "#stage", -120);
  check((await page.$eval("#slbl", (l) => l.textContent)).startsWith("2 /"), "swipe moves to the next slide");
  await swipe(page, "#stage", 120);
  check((await page.$eval("#slbl", (l) => l.textContent)).startsWith("1 /"), "swipe back");
  check(errors.length === 0, "no errors on the slideshow", errors.join(" | "));
  await page.close();
  const tv = await h.open("tv-slides.html?date=2026-09-21", { w: 1920, h: 1080 });
  check(!(await tv.page.$eval("#slbl", (l) => l.textContent)).includes("Paused"), "on the TV it still plays by itself");
  await tv.page.close();
}
// ── kiosk + theme on a phone ──
{
  const { page } = await h.open("tv-grid.html?date=2026-09-21&kiosk=1&theme=dark", phone);
  check(await page.$eval(".seg", (s) => getComputedStyle(s).display === "none") && await page.evaluate(() => document.documentElement.dataset.theme) === "dark", "?kiosk=1 hides the navigation and ?theme=dark still works on a phone");
  await page.close();
}
await h.close();
console.log(results.every(Boolean) ? "\nALL PASSED" : `\n${results.filter((x) => !x).length} FAILED`);

import { setup } from "./harness.mjs";
import fs from "fs";
const h = await setup();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync("hshots", { recursive: true });
const leaks = (page) => page.evaluate(() => [...document.querySelectorAll("[hidden]")].filter((e) => getComputedStyle(e).display !== "none").map((e) => e.tagName + (e.id ? "#" + e.id : "") + "." + e.className));
let bad = 0;
const run = async (path, as, tabs = [], sel = "[data-t]") => {
  const { page, errors } = await h.open(path, { as, freeze: false });
  await wait(1500);
  const report = async (label) => { const l = await leaks(page); if (l.length || errors.length) bad++; console.log(l.length ? "LEAK" : "ok  ", label, l.join(", "), errors.length ? "ERR " + errors.join("|") : ""); };
  await report(`${path} as ${as}`);
  await page.screenshot({ path: `hshots/${path.replace(".html", "")}-${as}.png` });
  for (const t of tabs) { await page.click(`${sel}[data-t="${t}"]`).catch(() => {}); await wait(800); await report(`${path} as ${as} › ${t}`); }
  await page.close();
};
await run("index.html", null);
await run("index.html", "admin");
await run("index.html", "tv");
await run("admin.html", "admin", ["entry", "jobs", "departments", "employees"], ".tabs [data-t]");
await run("me.html", "chamara", ["tasks", "perf", "notes"]);
await run("tv-grid.html", "tv"); await run("tv-slides.html", "tv"); await run("tv-departments.html", "tv");
await h.close?.();
console.log(bad ? `\n${bad} problems` : "\nALL CLEAN");
process.exit(0);

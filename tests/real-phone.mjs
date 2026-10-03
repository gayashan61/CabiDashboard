// Drives the installed Android app (test build ➜ test server over USB) on the real phone.
import puppeteer from "puppeteer-core";
import { execSync } from "child_process";
import fs from "fs";
const ADB = `"${process.env.LOCALAPPDATA}/Android/Sdk/platform-tools/adb.exe"`;
const adb = (a) => execSync(`${ADB} ${a}`, { encoding: "buffer" });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync("pshots", { recursive: true });
const cap = (name) => { fs.writeFileSync(`pshots/${name}.png`, adb("exec-out screencap -p")); console.log("   📷", name); };
const results = [];
const check = (ok, label, extra = "") => { results.push(!!ok); console.log(ok ? "ok  " : "FAIL", label, extra); };

// fresh start of the app, then attach to its WebView
adb("reverse tcp:8090 tcp:8090");
adb("shell pm clear lk.tiljay.cfpro");                     // start signed out
adb("shell am start -n lk.tiljay.cfpro/.MainActivity");
await wait(5000);
const pid = adb("shell pidof lk.tiljay.cfpro").toString().trim();
adb(`forward tcp:9222 localabstract:webview_devtools_remote_${pid}`);
const browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9222", defaultViewport: null });
const page = (await browser.pages()).find((p) => p.url().includes("localhost:8090"));
check(page, "app opened the site", page?.url());
page.on("dialog", (d) => d.accept());
const nav = async (fn) => { await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0", timeout: 15000 }).catch(() => {}), fn()]); await wait(800); };
const signIn = async (u, p) => {
  await page.waitForSelector("#signin:not([hidden])", { timeout: 15000 });
  await page.$eval("#un", (i) => (i.value = "")); await page.$eval("#pw", (i) => (i.value = ""));
  await page.type("#un", u); await page.type("#pw", p);
  await nav(() => page.click("#go"));
};
const signOutTo = async () => { await page.evaluate(async () => { await KPI.logout(); location.replace("index.html"); }); await wait(2000); };

cap("01-signin");
const insets = await page.evaluate(() => getComputedStyle(document.querySelector(".signin-theme")).top);
check(parseFloat(insets) > 16, "the theme button sits below the status bar", insets);

// employee
await signIn("chamara", "chamara123");
await page.waitForSelector(".task", { timeout: 15000 });
check(page.url().endsWith("me.html"), "employee ➜ My page", page.url());
cap("02-employee-tasks");
const rt1 = await page.$eval(".task input[data-job]", (i) => i.dataset.job);
await page.focus(`input[data-job="${rt1}"]`);
cap("03-employee-keyboard");
await page.type(`input[data-job="${rt1}"]`, "1500+250");
await page.click(`.send[data-job="${rt1}"]`); await wait(1500);
check(/waiting/i.test(await page.$eval("#toast", (t) => t.textContent)), "count sent from the phone");
await page.evaluate(() => document.activeElement?.blur());
await wait(600);
cap("04-employee-sent");

// admin on the same phone
await signOutTo();
await signIn("admin@test", "admin123");
check(page.url().endsWith("index.html"), "admin ➜ screen chooser", page.url());
cap("05-admin-chooser");
await nav(() => page.click("#to-admin"));
await page.waitForSelector("#appr:not([hidden]) .ap-row", { timeout: 15000 });
cap("06-admin-approvals");
await page.$eval("#appr .ap-row .ap-q", (i) => (i.value = "1800"));
await page.type("#appr .ap-row .ap-note", "recounted");
await page.click("#appr .ap-row .ap-ok"); await wait(2000);
check(/Approved as 1,800/.test(await page.$eval("#toast", (t) => t.textContent)), "approved with a change on the phone");
cap("07-admin-approved");
await page.click('.tabs [data-t="employees"]'); await wait(1200);
cap("08-admin-employees");

// employee sees the result
await signOutTo();
await signIn("chamara", "chamara123");
await page.waitForSelector(".task", { timeout: 15000 });
const t = await page.$eval(".task", (x) => x.innerText.replace(/\s+/g, " "));
check(/Changed by admin/.test(t) && /1,800/.test(t), "employee sees the approved (changed) count", t);
cap("09-employee-result");
await page.click('[data-t="notes"]'); await wait(1500);
cap("10-employee-notifications");
await page.click('[data-t="perf"]'); await wait(1500);
cap("11-employee-performance");

// TV account
await signOutTo();
await signIn("tv1", "tv1234");
await nav(() => page.click('a[href="tv-grid.html"]'));
await page.waitForSelector(".tile", { timeout: 15000 });
cap("12-tv-grid");
await page.click('[data-name="Chamara"]'); await wait(1500);
cap("13-tv-profile");

await browser.disconnect();
console.log(results.every(Boolean) ? "\nALL PASSED" : `\n${results.filter((x) => !x).length} FAILED`);

// Read-only load test against the live site + database (signs in once as one employee, changes nothing).
// LOAD_USER=<employee username> LOAD_PASSWORD=<their password> node load.mjs
const SITE = "https://kpidashboard-one.vercel.app/", SB = "https://bbhtejcxjytxmnxfsjxx.supabase.co", KEY = "sb_publishable_xBmWeRYsCp1gP2ChF2_oXw_81jR2Pzy";
const VUS = 30, SECONDS = 45, POLL_MS = 2000;
const tok = (await (await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: KEY, "Content-Type": "application/json" }, body: JSON.stringify({ email: `${process.env.LOAD_USER}@tiljay.local`, password: process.env.LOAD_PASSWORD }) })).json()).access_token;
if (!tok) throw new Error("sign-in failed");
const stats = {};
const rec = (k, ms, ok) => { const s = (stats[k] ||= { t: [], err: 0 }); s.t.push(ms); if (!ok) s.err++; };
const timed = async (k, fn) => { const t = performance.now(); let ok = false; try { const r = await fn(); ok = r.ok; await r.arrayBuffer(); } catch (e) {} rec(k, performance.now() - t, ok); };
const rpc = (fn, body = {}) => timed(fn, () => fetch(`${SB}/rest/v1/rpc/${fn}`, { method: "POST", headers: { apikey: KEY, Authorization: "Bearer " + tok, "Content-Type": "application/json" }, body: JSON.stringify(body) }));
const page = (p) => timed("site:" + p, () => fetch(SITE + p + "?lt=" + Math.random()));
const openApp = () => Promise.all([page("me.html"), page("assets/core.js"), page("assets/style.css"), page("assets/config.js"), rpc("whoami").then(() => Promise.all([rpc("me", { days: 400 }), rpc("my_notifications", { p_limit: 50 })]))]);
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p / 100 * s.length))]; };
const report = (title) => {
  console.log(`\n${title}`);
  console.log("request".padEnd(22), "count".padStart(6), "errors".padStart(7), "median".padStart(8), "p95".padStart(8), "slowest".padStart(8));
  for (const [k, s] of Object.entries(stats)) console.log(k.padEnd(22), String(s.t.length).padStart(6), String(s.err).padStart(7), (pct(s.t, 50).toFixed(0) + "ms").padStart(8), (pct(s.t, 95).toFixed(0) + "ms").padStart(8), (Math.max(...s.t).toFixed(0) + "ms").padStart(8));
  const all = Object.values(stats); console.log(`total ${all.reduce((a, s) => a + s.t.length, 0)} requests, ${all.reduce((a, s) => a + s.err, 0)} errors`);
  for (const k in stats) delete stats[k];
};
// 1) 30 phones open the app, then check for news every 2 s for 45 s
const t0 = Date.now(), end = t0 + SECONDS * 1000;
await Promise.all(Array.from({ length: VUS }, async (_, i) => {
  await new Promise((r) => setTimeout(r, i * 100)); // arrive over 3 s
  await openApp();
  while (Date.now() < end) { const t = Date.now(); await rpc("inbox"); await new Promise((r) => setTimeout(r, Math.max(0, POLL_MS - (Date.now() - t)))); }
}));
report(`1) ${VUS} phones for ${SECONDS}s (each checks every ${POLL_MS / 1000}s — real app: every 60s)`);
// 2) everyone opens the app at the same moment
const tb = performance.now();
await Promise.all(Array.from({ length: VUS }, openApp));
report(`2) burst: ${VUS} phones open the app at the same moment (all done in ${((performance.now() - tb) / 1000).toFixed(1)}s)`);

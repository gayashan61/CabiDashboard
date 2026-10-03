// Phone test server: the site from the repo + a fake Supabase (in-memory copy, never the live database).
import { fileURLToPath } from "url";
// The phone reaches it over USB with:  adb reverse tcp:8090 tcp:8090   ➜  http://localhost:8090
// Test logins: admin@test / admin123 · chamara / chamara123 · tv1 / tv1234
import http from "http";
import fs from "fs";
import path from "path";
import { setup } from "./harness.mjs";
const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const PORT = 8090;
const h = await setup();
// Chamara has two tasks so the employee page has something to show
const ids = (await h.q("select id from jobs where machine in ('RT1', 'RT2') order by sort")).map((r) => r.id);
await h.q("select 1"); await h.db.exec(`insert into assignments (employee, job) values ${ids.map((j) => `('Chamara', ${j})`).join(",")} on conflict do nothing`);
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png", ".json": "application/json", ".svg": "image/svg+xml" };
http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "apikey, authorization, content-type", "access-control-allow-methods": "POST, GET, OPTIONS" };
  try {
    if (url.pathname.startsWith("/sb/")) {
      if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }
      let raw = ""; for await (const c of req) raw += c;
      const [status, body] = await h.handle(url.pathname.slice(3) + url.search, req.headers.authorization, raw ? JSON.parse(raw) : {});
      console.log(new Date().toISOString().slice(11, 19), req.method, url.pathname.slice(3), status);
      res.writeHead(status, { ...cors, "content-type": "application/json" });
      return res.end(body == null ? "" : JSON.stringify(body));
    }
    let file = path.join(ROOT, decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname));
    if (!file.startsWith(path.resolve(ROOT)) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end("not found"); }
    let body = fs.readFileSync(file);
    if (url.pathname === "/assets/config.js") {
      // talk to this fake Supabase instead of the real project
      body = body.toString().replace(/SUPABASE_URL:\s*"[^"]*"/, 'SUPABASE_URL: location.origin + "/sb"').replace(/ANDROID_PUSH:\s*true/, "ANDROID_PUSH: false");
    }
    res.writeHead(200, { "content-type": types[path.extname(file)] || "application/octet-stream", "cache-control": "no-store" });
    res.end(body);
  } catch (e) { res.writeHead(500); res.end(String(e)); }
}).listen(PORT, () => console.log(`test server on http://localhost:${PORT} (fake Supabase at /sb)`));

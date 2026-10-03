// Checks the Firebase service-account key: gets a Google token, then asks FCM to *validate* (not send) a message.
import fs from "fs"; import crypto from "crypto";
const sa = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const b64 = (x) => Buffer.from(typeof x === "string" ? x : x).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const unsigned = `${b64(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64(JSON.stringify({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }))}`;
const sig = crypto.sign("RSA-SHA256", Buffer.from(unsigned), sa.private_key).toString("base64url");
const t = await (await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${sig}` }) })).json();
console.log("Google token:", t.access_token ? "OK" : "FAILED " + JSON.stringify(t));
const token = process.argv[3] || "not-a-real-device-token";
const r = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, { method: "POST", headers: { Authorization: "Bearer " + t.access_token, "Content-Type": "application/json" },
  body: JSON.stringify({ validate_only: !process.argv[3], message: { token, notification: { title: process.argv[4] || "Test", body: process.argv[5] || "Tiljay CF Pro test" }, data: { kind: "test" }, android: { priority: "HIGH", notification: { channel_id: "updates", sound: "default" } } } }) });
const j = await r.json();
console.log("FCM:", r.status, j.error ? `${j.error.status}: ${j.error.message}` : j.name);

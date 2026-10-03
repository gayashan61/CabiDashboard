// Sends a notification to the person's phone(s) through Firebase Cloud Messaging.
// Called by a Database Webhook on INSERT into public.notifications (set it up in Supabase ➜ Database ➜ Webhooks,
// with the HTTP header  x-webhook-secret: <PUSH_WEBHOOK_SECRET>).
//
// Secrets (Supabase ➜ Edge Functions ➜ Secrets):
//   FIREBASE_SERVICE_ACCOUNT  the whole JSON of the Firebase service-account key
//   PUSH_WEBHOOK_SECRET       any long random text, the same as in the webhook header
// Deploy with "Verify JWT" turned OFF — the webhook proves itself with the secret header instead.
import { createClient } from "jsr:@supabase/supabase-js@2";

type ServiceAccount = { project_id: string; client_email: string; private_key: string };
const sa: ServiceAccount = JSON.parse(Deno.env.get("FIREBASE_SERVICE_ACCOUNT") ?? "{}");

const b64url = (data: ArrayBuffer | Uint8Array | string) => {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data);
  let s = "";
  for (const x of bytes) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

// Google OAuth token for FCM, signed with the service account's key; reused until it is about to expire.
let cached: { token: string; until: number } | null = null;
async function accessToken(): Promise<string> {
  if (cached && Date.now() < cached.until) return cached.token;
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({
    iss: sa.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
  }));
  const pem = sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${head}.${claim}`));
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${claim}.${b64url(sig)}` }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`Google token: ${j.error_description ?? j.error ?? res.status}`);
  cached = { token: j.access_token, until: Date.now() + (j.expires_in - 120) * 1000 };
  return cached.token;
}

Deno.serve(async (req) => {
  const secret = Deno.env.get("PUSH_WEBHOOK_SECRET");
  if (!secret || req.headers.get("x-webhook-secret") !== secret) return new Response("Forbidden", { status: 403 });
  try {
    const body = await req.json();
    const n = body.record;
    if (!n?.user_id) return new Response("no recipient", { status: 200 });
    if (!sa.project_id) throw new Error("FIREBASE_SERVICE_ACCOUNT is not set");

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: devices } = await sb.from("devices").select("token").eq("user_id", n.user_id);
    if (!devices?.length) return new Response("no devices", { status: 200 });

    // FCM data values must be strings
    const data: Record<string, string> = { kind: String(n.kind ?? ""), id: String(n.id) };
    for (const [k, v] of Object.entries(n.data ?? {})) data[k] = typeof v === "string" ? v : JSON.stringify(v);

    const token = await accessToken();
    let sent = 0;
    for (const d of devices) {
      const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: {
            token: d.token,
            notification: { title: n.title, body: n.body },
            data,
            android: { priority: "HIGH", notification: { channel_id: "updates", sound: "default" } },
          },
        }),
      });
      if (res.ok) { sent++; continue; }
      const err = await res.json().catch(() => ({}));
      const code = err?.error?.details?.find((x: { errorCode?: string }) => x.errorCode)?.errorCode ?? err?.error?.status;
      // The app was uninstalled or the token is old: forget it
      if (res.status === 404 || code === "UNREGISTERED" || code === "INVALID_ARGUMENT") {
        await sb.from("devices").delete().eq("token", d.token);
      }
    }
    return new Response(JSON.stringify({ sent }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(e instanceof Error ? e.message : String(e), { status: 500 });
  }
});

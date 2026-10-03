// Admin-only: create, change and delete sign-in accounts for employees and TV screens.
// Called from Admin ➜ Employees. Creating logins needs the service role key, which Supabase gives every
// Edge Function automatically; the caller must be signed in and listed in public.admins.
//
// POST { action: "save",   kind: "employee", employee, username, password? }
// POST { action: "save",   kind: "viewer",   username, password?, label?, current? }   (current = old username when renaming)
// POST { action: "delete", kind: "employee", employee }
// POST { action: "delete", kind: "viewer",   username }
import { createClient } from "jsr:@supabase/supabase-js@2";

// Usernames sign in as <username>@<DOMAIN>. These addresses are never emailed. Keep in sync with assets/core.js.
const DOMAIN = "tiljay.local";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply(405, { message: "Use POST" });
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Who is asking? Must be an admin.
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: who, error: whoErr } = await sb.auth.getUser(jwt);
    if (whoErr || !who?.user) return reply(401, { message: "Your sign-in has expired — please sign in again" });
    const { data: adm } = await sb.from("admins").select("user_id").eq("user_id", who.user.id).maybeSingle();
    if (!adm) return reply(403, { message: "Not allowed: this account is not an admin" });

    const b = await req.json();
    const kind = b.kind === "viewer" ? "viewer" : "employee";
    const username = String(b.username ?? "").trim().toLowerCase();
    const password = b.password ? String(b.password) : "";

    // The account this request is about (if it already exists)
    let userId: string | null = null;
    if (kind === "employee") {
      const { data: emp } = await sb.from("employees").select("name, user_id").eq("name", String(b.employee ?? "")).maybeSingle();
      if (!emp) return reply(404, { message: `No employee called “${b.employee}” — save the employee first` });
      userId = emp.user_id;
    } else {
      const current = String(b.current ?? username).trim().toLowerCase();
      const { data: v } = await sb.from("viewers").select("user_id").eq("username", current).maybeSingle();
      userId = v?.user_id ?? null;
    }

    if (b.action === "delete") {
      if (!userId) return reply(200, { ok: true });
      const { error } = await sb.auth.admin.deleteUser(userId);
      if (error) return reply(400, { message: error.message });
      if (kind === "employee") await sb.from("employees").update({ user_id: null, username: null }).eq("name", b.employee);
      return reply(200, { ok: true });
    }

    if (b.action !== "save") return reply(400, { message: "Unknown action" });
    if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
      return reply(400, { message: "Username: 3–32 letters, numbers, dots, dashes or underscores (no spaces)" });
    }
    if (password && password.length < 6) return reply(400, { message: "The password needs at least 6 characters" });
    const email = `${username}@${DOMAIN}`;

    if (!userId) {
      if (!password) return reply(400, { message: "Set a password for the new login" });
      const { data: made, error } = await sb.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { username, kind },
      });
      if (error) return reply(400, { message: /already|registered|exists/i.test(error.message) ? `The username “${username}” is already taken` : error.message });
      userId = made.user.id;
    } else {
      const change: Record<string, unknown> = { email, email_confirm: true, user_metadata: { username, kind } };
      if (password) change.password = password;
      const { error } = await sb.auth.admin.updateUserById(userId, change);
      if (error) return reply(400, { message: /already|registered|exists/i.test(error.message) ? `The username “${username}” is already taken` : error.message });
    }

    if (kind === "employee") {
      const { error } = await sb.from("employees").update({ user_id: userId, username }).eq("name", b.employee);
      if (error) return reply(400, { message: error.message });
    } else {
      const { error } = await sb.from("viewers").upsert({ user_id: userId, username, label: String(b.label ?? "") }, { onConflict: "user_id" });
      if (error) return reply(400, { message: error.message });
    }
    return reply(200, { ok: true, username });
  } catch (e) {
    return reply(500, { message: e instanceof Error ? e.message : String(e) });
  }
});

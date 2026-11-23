// Team admin for the Titi Gold admin page: list, invite and remove admins.
// Only signed-in admins can call it. Deployed as the Edge Function "invite-admin".
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "https://titiigold.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const SITE = "https://titiigold.com";
const url = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  // Who is calling? Their own session must belong to an admin.
  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    auth: { persistSession: false },
  });
  const { data: isAdmin } = await caller.rpc("is_admin");
  if (!isAdmin) return json({ error: "Only admins can manage the team." }, 403);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const body = await req.json().catch(() => ({}));
  const action = body.action;

  if (action === "list") {
    const { data, error } = await admin.from("admins").select("email").order("email");
    if (error) return json({ error: error.message }, 500);
    return json({ admins: data.map((r) => r.email) });
  }

  const email = String(body.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Please enter a valid email address." }, 400);

  if (action === "invite") {
    // Add to the admin list first, so the person is allowed in as soon as they set a password.
    const { error: addError } = await admin.from("admins").upsert({ email });
    if (addError) return json({ error: addError.message }, 500);

    const { error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: SITE + "/admin.html" });
    if (error) {
      const exists = /already|registered|exists/i.test(error.message);
      if (!exists) return json({ error: "The invite could not be sent. " + error.message }, 500);
      // They already have a sign-in: send a password reset instead.
      const { error: resetError } = await caller.auth.resetPasswordForEmail(email, { redirectTo: SITE + "/admin.html" });
      if (resetError) return json({ error: "The email could not be sent. " + resetError.message }, 500);
      return json({ ok: true, message: email + " already has a sign-in, so we sent a password reset email instead." });
    }
    return json({ ok: true, message: "Invite sent to " + email + "." });
  }

  if (action === "remove") {
    const { data: me } = await caller.auth.getUser();
    if (me.user?.email?.toLowerCase() === email) return json({ error: "You cannot remove yourself." }, 400);
    const { error } = await admin.from("admins").delete().eq("email", email);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, message: email + " can no longer sign in to the admin page." });
  }

  return json({ error: "Unknown action." }, 400);
});

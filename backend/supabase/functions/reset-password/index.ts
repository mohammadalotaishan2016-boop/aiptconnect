import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 200, headers: cors });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!token || !supabaseUrl || !serviceRoleKey) return json({ error: "Authentication required." }, 401);

  const db = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return json({ error: "Authentication required." }, 401);

  const userId = data.user.id;

  // Reset failure counters for this user
  const { error: resetError } = await db
    .from("profiles")
    .update({ failed_login_attempts: 0, locked_at: null })
    .eq("id", userId);
  if (resetError) return json({ error: "Unable to reset the account after password change." }, 500);

  // If the account was locked, set it back to active (password reset proves identity)
  await db
    .from("profiles")
    .update({ status: "active" })
    .eq("id", userId)
    .eq("status", "locked");

  return json({ success: true });
});

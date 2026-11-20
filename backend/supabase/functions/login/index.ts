import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const MAX_FAILED_ATTEMPTS = 5;

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 200, headers: cors });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 4096) return json({ error: "Request body is too large." }, 413);
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const passwordVerifier = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  try {
    const { email, password } = await request.json();
    const normalizedEmail = String(email ?? "").trim().toLowerCase();
    const suppliedPassword = typeof password === "string" ? password : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || normalizedEmail.length > 320 || suppliedPassword.length < 1 || suppliedPassword.length > 1024) return json({ code: "invalid_credentials", error: "The email address or password is incorrect.", attempts_remaining: MAX_FAILED_ATTEMPTS }, 401);
    const authLookup = await admin.rpc("find_auth_user_id_by_email", { p_email: normalizedEmail });
    const authUserId = typeof authLookup.data === "string" ? authLookup.data : null;
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip") ?? null;
    if (authLookup.error) throw authLookup.error;
    if (!authUserId) return json({ code: "invalid_credentials", error: "The email address or password is incorrect.", attempts_remaining: MAX_FAILED_ATTEMPTS }, 401);

    const { data: profile } = await admin.from("profiles").select("id,role,status,failed_login_attempts").eq("id", authUserId).single();
    const isAdministrator = profile?.role === "administrator";

    // Gate on unified status column (added in migration 202611190003)
    switch (profile?.status) {
      case "locked":
        if (!isAdministrator) return json({ code: "account_locked", error: "This account is locked after five failed attempts. Use Forgot Password to reset it or contact an administrator.", attempts_remaining: 0 }, 423);
        break; // administrators bypass the lock and proceed to password check
      case "pending":
        return json({ code: "account_pending", error: "Your account is still awaiting administrator approval." }, 403);
      case "suspended":
        return json({ code: "account_suspended", error: "Your account has been suspended. Please contact support." }, 403);
      case "deactivated":
        return json({ code: "account_deactivated", error: "This account is deactivated. Contact an administrator." }, 403);
      case "deleted":
        return json({ code: "account_unavailable", error: "This account cannot log in. Please contact support." }, 403);
      case "active":
        break; // proceed to password check
      default:
        return json({ code: "account_unavailable", error: "This account cannot log in. Please contact support." }, 403);
    }

    const result = await passwordVerifier.auth.signInWithPassword({ email: normalizedEmail, password: suppliedPassword });
    if (result.error) {
      const attempts = (profile?.failed_login_attempts ?? 0) + 1;
      const shouldLock = !isAdministrator && attempts >= MAX_FAILED_ATTEMPTS;
      const remaining = isAdministrator ? null : Math.max(0, MAX_FAILED_ATTEMPTS - attempts);
      await admin.from("profiles").update({
        failed_login_attempts: isAdministrator ? attempts : Math.min(attempts, MAX_FAILED_ATTEMPTS),
        locked_at: shouldLock ? new Date().toISOString() : null,
        status: shouldLock ? "locked" : profile?.status,
        last_login_ip: ip,
      }).eq("id", authUserId);
      return json({ code: shouldLock ? "account_locked" : "invalid_credentials", error: shouldLock ? "This account is locked after five failed attempts. Use Forgot Password to reset it or contact an administrator." : "The email address or password is incorrect.", attempts_remaining: remaining }, shouldLock ? 423 : 401);
    }

    await admin.from("profiles").update({ failed_login_attempts: 0, locked_at: null, last_login_at: new Date().toISOString(), last_login_ip: ip }).eq("id", authUserId);
    return json({ ok: true, email: normalizedEmail });
  } catch (cause) {
    console.error("Login request failed", cause instanceof Error ? cause.message : "Unknown error");
    return json({ error: "Unable to complete login verification." }, 500);
  }
});

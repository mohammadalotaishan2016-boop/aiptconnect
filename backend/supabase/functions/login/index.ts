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
    const body = await request.json();
    const { email, password, device_fingerprint } = body;
    const normalizedEmail = String(email ?? "").trim().toLowerCase();
    const suppliedPassword = typeof password === "string" ? password : "";
    const fingerprint = typeof device_fingerprint === "string" ? device_fingerprint.trim().slice(0, 500) : "";

    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) ||
      normalizedEmail.length > 320 ||
      suppliedPassword.length < 1 ||
      suppliedPassword.length > 1024
    ) {
      return json({ code: "invalid_credentials", error: "The email address or password is incorrect.", attempts_remaining: MAX_FAILED_ATTEMPTS }, 401);
    }

    const authLookup = await admin.rpc("find_auth_user_id_by_email", { p_email: normalizedEmail });
    const authUserId = typeof authLookup.data === "string" ? authLookup.data : null;
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip") ?? null;
    const userAgent = request.headers.get("user-agent") ?? null;

    if (authLookup.error) throw authLookup.error;
    if (!authUserId) {
      return json({ code: "invalid_credentials", error: "The email address or password is incorrect.", attempts_remaining: MAX_FAILED_ATTEMPTS }, 401);
    }

    const { data: profile } = await admin
      .from("profiles")
      .select("id,role,status,failed_login_attempts,max_devices")
      .eq("id", authUserId)
      .single();
    const isAdministrator = profile?.role === "administrator";

    switch (profile?.status) {
      case "locked":
        if (!isAdministrator) {
          return json({ code: "account_locked", error: "This account is locked after five failed attempts. Use Forgot Password to reset it or contact an administrator.", attempts_remaining: 0 }, 423);
        }
        break;
      case "pending":
        return json({ code: "account_pending", error: "Your account is still awaiting administrator approval." }, 403);
      case "suspended":
        return json({ code: "account_suspended", error: "Your account has been suspended. Please contact support." }, 403);
      case "deactivated":
        return json({ code: "account_deactivated", error: "This account is deactivated. Contact an administrator." }, 403);
      case "deleted":
        return json({ code: "account_unavailable", error: "This account cannot log in. Please contact support." }, 403);
      case "active":
        break;
      default:
        return json({ code: "account_unavailable", error: "This account cannot log in. Please contact support." }, 403);
    }

    // ── Verify password ────────────────────────────────────────────────────────
    const result = await passwordVerifier.auth.signInWithPassword({
      email: normalizedEmail,
      password: suppliedPassword,
    });

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
      return json({
        code: shouldLock ? "account_locked" : "invalid_credentials",
        error: shouldLock
          ? "This account is locked after five failed attempts. Use Forgot Password to reset it or contact an administrator."
          : "The email address or password is incorrect.",
        attempts_remaining: remaining,
      }, shouldLock ? 423 : 401);
    }

    // Password correct — reset failure counters
    await admin.from("profiles").update({
      failed_login_attempts: 0,
      locked_at: null,
      last_login_at: new Date().toISOString(),
      last_login_ip: ip,
    }).eq("id", authUserId);

    // ── Device limit check ─────────────────────────────────────────────────────
    const maxDevices: number = profile?.max_devices ?? 1;

    // Count active devices (excluding the current fingerprint if already registered)
    const { count: activeCount } = await admin
      .from("devices")
      .select("id", { count: "exact", head: true })
      .eq("user_id", authUserId)
      .eq("status", "active");

    const fingerprintExists = fingerprint
      ? (await admin.from("devices").select("id", { head: true }).eq("user_id", authUserId).eq("device_id", fingerprint).eq("status", "active")).count ?? 0
      : 0;

    const foreignActiveCount = (activeCount ?? 0) - Number(fingerprintExists > 0);

    if (foreignActiveCount < maxDevices || isAdministrator) {
      // Under limit — register / refresh this device
      if (fingerprint) {
        await admin.from("devices").upsert(
          {
            user_id: authUserId,
            device_id: fingerprint,
            user_agent: userAgent,
            ip,
            status: "active",
            last_seen_at: new Date().toISOString(),
          },
          { onConflict: "user_id,device_id", ignoreDuplicates: false },
        );
      }

      // Sign out the pending passwordVerifier session so it doesn't linger
      if (result.data.session) {
        await admin.auth.admin.signOut(result.data.session.access_token);
      }

      return json({ ok: true, email: normalizedEmail });
    }

    // ── Over limit — create a login_request ───────────────────────────────────
    // Reuse an existing pending request for the same fingerprint (idempotent)
    const existingRequest = fingerprint
      ? await admin
          .from("login_requests")
          .select("id")
          .eq("user_id", authUserId)
          .eq("device_fingerprint", fingerprint)
          .eq("status", "pending")
          .gte("expires_at", new Date().toISOString())
          .maybeSingle()
      : { data: null };

    if (existingRequest.data) {
      // Sign out the duplicate passwordVerifier session
      if (result.data.session) {
        await admin.auth.admin.signOut(result.data.session.access_token);
      }
      return json({ waiting: true, request_id: existingRequest.data.id });
    }

    // Store the session tokens so we can hand them to the new device on approval
    const { data: loginReq } = await admin.from("login_requests").insert({
      user_id: authUserId,
      device_fingerprint: fingerprint || "unknown",
      user_agent: userAgent,
      ip,
      status: "pending",
      session_access_token: result.data.session?.access_token ?? null,
      session_refresh_token: result.data.session?.refresh_token ?? null,
    }).select("id").single();

    if (!loginReq) throw new Error("Failed to create login request.");

    // Broadcast to the user's private Realtime channel so the existing device sees it
    try {
      const channel = admin.channel(`user-${authUserId}`);
      await channel.send({
        type: "broadcast",
        event: "login_request",
        payload: {
          request_id: loginReq.id,
          user_agent: userAgent,
          ip,
          created_at: new Date().toISOString(),
        },
      });
      await admin.removeChannel(channel);
    } catch {
      // Non-fatal — the existing device will still see it via polling
    }

    return json({ waiting: true, request_id: loginReq.id });
  } catch (cause) {
    console.error("Login request failed", cause instanceof Error ? cause.message : "Unknown error");
    return json({ error: "Unable to complete login verification." }, 500);
  }
});

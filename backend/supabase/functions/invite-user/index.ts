import { createClient } from "npm:@supabase/supabase-js@2";
import { SESv2Client, SendEmailCommand } from "https://esm.sh/@aws-sdk/client-sesv2@3.637.0?target=deno&bundle";
import { createCircuitBreaker } from "../_shared/circuit-breaker.ts";

const sesBreaker = createCircuitBreaker({ name: "ses-invite", failureThreshold: 3, cooldownMs: 60_000, timeoutMs: 15_000 });

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] ?? c),
  );
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Verify the caller is an active administrator; return the db client and userId. */
async function authenticate(
  request: Request,
  db: ReturnType<typeof createClient>,
): Promise<{ userId: string } | null> {
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data: { user }, error } = await db.auth.getUser(token);
  if (error || !user) return null;
  const { data: profile } = await db
    .from("profiles")
    .select("role, status")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "administrator" || profile.status !== "active") return null;
  return { userId: user.id };
}

async function sendInvitationEmail(opts: {
  email: string;
  role: string;
  token: string;
  clientName: string | null;
  maxDevices: number;
  expiresAt: string;
  invitationMessage: string | null;
}): Promise<void> {
  const region = Deno.env.get("AWS_SES_REGION") || Deno.env.get("AWS_REGION") || "eu-north-1";
  const accessKeyId = Deno.env.get("AWS_SES_ACCESS_KEY_ID") || Deno.env.get("AWS_ACCESS_KEY_ID");
  const secretAccessKey = Deno.env.get("AWS_SES_SECRET_ACCESS_KEY") || Deno.env.get("AWS_SECRET_ACCESS_KEY");
  const from = Deno.env.get("SES_FROM_EMAIL");
  if (!accessKeyId || !secretAccessKey || !from) {
    throw Error("Invitation email is not configured. Check SES credentials in Supabase secrets.");
  }
  const appUrl = Deno.env.get("APP_URL")?.replace(/\/$/, "");
  if (!appUrl) {
    throw Error("APP_URL is not configured. Cannot generate invitation link.");
  }
  const inviteUrl = `${appUrl}/invite?token=${encodeURIComponent(opts.token)}`;
  const expirationDate = new Date(opts.expiresAt).toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });

  const companyLine = opts.clientName
    ? `<p><strong>Company:</strong> ${escapeHtml(opts.clientName)}</p>`
    : "";
  const messageLine = opts.invitationMessage
    ? `<p><strong>Invitation Message:</strong></p><p>${escapeHtml(opts.invitationMessage)}</p>`
    : "";

  const ses = new SESv2Client({ region, credentials: { accessKeyId, secretAccessKey } });
  await sesBreaker.call(() => ses.send(
    new SendEmailCommand({
      FromEmailAddress: from,
      Destination: { ToAddresses: [opts.email] },
      Content: {
        Simple: {
          Subject: { Data: "AIP&T – Verify Your Company Invitation", Charset: "UTF-8" },
          Body: {
            Html: {
              Data: `
<h2>AIP&amp;T &ndash; Company Invitation</h2>
<p>Hello,</p>
<p>You have been invited to join the AIP&amp;T Management System.</p>
<p>Please review your invitation details below:</p>
${companyLine}
<p><strong>Email:</strong> ${escapeHtml(opts.email)}</p>
<p><strong>Maximum Allowed Devices:</strong> ${opts.maxDevices}</p>
${messageLine}
<h3>Verify Your Company Invitation</h3>
<p>To verify your invitation and register your account, please click the secure registration link below:</p>
<p><a href="${inviteUrl}" style="display:inline-block;padding:12px 24px;background:#17a2b8;color:#fff;text-decoration:none;border-radius:4px;font-weight:bold;">VERIFY COMPANY INVITATION &amp; REGISTER</a></p>
<p>Registration Link:<br/><a href="${inviteUrl}">${escapeHtml(inviteUrl)}</a></p>
<p>Please complete the registration process by verifying your invitation and setting your password.</p>
<p>Once your registration is successfully completed, your account will be activated and associated with your assigned company.</p>
<p><strong>Invitation Expiration:</strong> ${expirationDate}</p>
<p><strong>Important:</strong></p>
<ul>
  <li>This invitation can only be used once.</li>
  <li>The registration link will expire on the date indicated above.</li>
  <li>Your company assignment and maximum device limit are managed by AIP&amp;T Administration.</li>
  <li>If you did not expect this invitation, please contact the AIP&amp;T Administration Team.</li>
</ul>
<p>Best regards,<br/>AIP&amp;T Administration Team</p>
              `.trim(),
              Charset: "UTF-8",
            },
          },
        },
      },
    }),
  ));
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 200, headers: cors });

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // ── GET /invite-user?action=verify&token=... ──────────────────────────────
  if (request.method === "GET") {
    const url = new URL(request.url);
    if (url.searchParams.get("action") !== "verify") {
      return json({ error: "Unknown action." }, 400);
    }
    const rawToken = url.searchParams.get("token")?.trim() ?? "";
    if (rawToken.length < 32) {
      return json({ error: "This invitation link is invalid." }, 400);
    }
    const tokenHash = await sha256(rawToken);
    const { data: inv, error } = await db
      .from("user_invitations")
      .select("id, email, role, client_id, max_devices, expires_at, consumed_at, revoked_at, client:clients(company_name)")
      .eq("token_hash", tokenHash)
      .maybeSingle();
    if (error) return json({ error: "Unable to verify invitation." }, 500);
    if (!inv) return json({ code: "invalid", error: "This invitation link is invalid." }, 400);
    if (inv.revoked_at) return json({ code: "revoked", error: "This invitation has been revoked by an administrator." }, 410);
    if (inv.consumed_at) return json({ code: "consumed", error: "This invitation has already been used." }, 410);
    if (new Date(inv.expires_at) <= new Date()) return json({ code: "expired", error: "This invitation has expired. Ask the administrator to resend it." }, 410);

    const clientRow = Array.isArray(inv.client) ? inv.client[0] : inv.client;
    return json({
      valid: true,
      invitation_id: inv.id,
      email: inv.email,
      role: inv.role,
      client_name: clientRow?.company_name ?? null,
      max_devices: inv.max_devices,
    });
  }

  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return json({ error: "Invalid request body." }, 400);
  const action = String(body.action ?? "");

  // ── POST accept (public — no admin auth needed) ───────────────────────────
  if (action === "accept") {
    const rawToken = String(body.token ?? "").trim();
    const fullName = String(body.full_name ?? "").trim();
    const password = String(body.password ?? "");

    if (rawToken.length < 32) return json({ error: "Invalid invitation token." }, 400);
    if (!fullName || fullName.length < 2) return json({ error: "Full name must be at least 2 characters." }, 400);
    if (password.length < 8) return json({ error: "Password must be at least 8 characters." }, 400);

    const tokenHash = await sha256(rawToken);
    const { data: inv, error: invError } = await db
      .from("user_invitations")
      .select("id, email, role, client_id, max_devices, expires_at, consumed_at, revoked_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();
    if (invError) return json({ error: "Unable to verify invitation." }, 500);
    if (!inv) return json({ code: "invalid", error: "This invitation link is invalid." }, 400);
    if (inv.revoked_at) return json({ code: "revoked", error: "This invitation has been revoked." }, 410);
    if (inv.consumed_at) return json({ code: "consumed", error: "This invitation has already been used." }, 410);
    if (new Date(inv.expires_at) <= new Date()) return json({ code: "expired", error: "This invitation has expired." }, 410);

    // Check if account already exists for this email (idempotency guard)
    const { data: existingResult } = await db.rpc("find_auth_user_id_by_email", {
      p_email: inv.email,
    });
    if (existingResult) {
      return json({ code: "account_exists", error: "An account with this email already exists." }, 409);
    }

    // Create the auth user via admin API
    const { data: created, error: createError } = await db.auth.admin.createUser({
      email: inv.email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        invited: true,
        role: inv.role,
      },
    });
    if (createError || !created?.user) {
      return json({ error: createError?.message ?? "Unable to create account." }, 500);
    }
    const userId = created.user.id;

    // Insert profile row (the trigger may have already created one; upsert to be safe)
    const profileInsert: Record<string, unknown> = {
      id: userId,
      full_name: fullName,
      role: inv.role,
      status: "active",
      max_devices: inv.max_devices,
    };
    if (inv.role === "client" && inv.client_id) {
      profileInsert.client_id = inv.client_id;
    }
    const { error: profileError } = await db
      .from("profiles")
      .upsert(profileInsert, { onConflict: "id" });
    if (profileError) {
      // Clean up the created auth user to avoid orphaned accounts
      await db.auth.admin.deleteUser(userId).catch(() => undefined);
      return json({ error: "Account created but profile setup failed. Contact an administrator." }, 500);
    }

    // Mark invitation as consumed
    await db
      .from("user_invitations")
      .update({ consumed_at: new Date().toISOString(), claimed_by: userId })
      .eq("id", inv.id);

    return json({ success: true });
  }

  // All remaining actions require administrator auth
  const caller = await authenticate(request, db);
  if (!caller) return json({ error: "Administrator access is required." }, 403);

  // ── POST create ───────────────────────────────────────────────────────────
  if (action === "create") {
    const email = String(body.email ?? "").trim().toLowerCase();
    const role = String(body.role ?? "");
    const clientId: string | null = body.client_id ? String(body.client_id) : null;
    const maxDevices = Number(body.max_devices ?? 1);
    const invitationMessage: string | null = body.invitation_message ? String(body.invitation_message).trim() : null;

    if (!EMAIL_RE.test(email)) return json({ error: "A valid email address is required." }, 400);
    if (!["administrator", "client"].includes(role)) return json({ error: "Role must be 'administrator' or 'client'." }, 400);
    if (role === "client" && !clientId) return json({ error: "A client must be selected for the client role." }, 400);
    if (maxDevices < 1 || maxDevices > 10) return json({ error: "Max devices must be between 1 and 10." }, 400);

    // Check no active account for this email already exists
    const { data: existingUserId } = await db.rpc("find_auth_user_id_by_email", { p_email: email });
    if (existingUserId) {
      return json({ code: "account_exists", error: "An account with this email already exists." }, 409);
    }

    // The partial unique index on (lower(email)) where active enforces one-active-per-email.
    // Revoke any existing active invitation for this email first (makes resend idempotent).
    await db
      .from("user_invitations")
      .update({ revoked_at: new Date().toISOString() })
      .eq("email", email)
      .is("consumed_at", null)
      .is("revoked_at", null);

    const rawToken = randomToken();
    const tokenHash = await sha256(rawToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: invitation, error: insertError } = await db
      .from("user_invitations")
      .insert({
        email,
        role,
        client_id: clientId,
        max_devices: maxDevices,
        invitation_message: invitationMessage,
        token_hash: tokenHash,
        expires_at: expiresAt,
        invited_by: caller.userId,
        created_by: caller.userId,
      })
      .select("id")
      .single();
    if (insertError || !invitation) {
      return json({ error: insertError?.message ?? "Unable to create invitation." }, 500);
    }

    // Look up client name for email
    let clientName: string | null = null;
    if (clientId) {
      const { data: client } = await db
        .from("clients")
        .select("company_name")
        .eq("id", clientId)
        .single();
      clientName = client?.company_name ?? null;
    }

    let emailDelivered = true;
    try {
      await sendInvitationEmail({ email, role, token: rawToken, clientName, maxDevices, expiresAt, invitationMessage });
    } catch {
      emailDelivered = false;
    }

    // Audit log — never expose the token hash
    await db.from("audit_logs").insert({
      actor_id: caller.userId,
      entity_type: "user_invitation",
      entity_id: invitation.id,
      action: "create",
      before_data: null,
      after_data: { email, role, client_id: clientId, max_devices: maxDevices, expires_at: expiresAt, email_delivered: emailDelivered },
    }).catch(() => undefined);

    return json({ invitation_id: invitation.id, email_delivered: emailDelivered });
  }

  // ── POST resend ───────────────────────────────────────────────────────────
  if (action === "resend") {
    const invitationId = String(body.invitation_id ?? "");
    if (!invitationId) return json({ error: "invitation_id is required." }, 400);

    const { data: inv, error: fetchError } = await db
      .from("user_invitations")
      .select("id, email, role, client_id, max_devices, invitation_message, consumed_at, revoked_at, client:clients(company_name)")
      .eq("id", invitationId)
      .maybeSingle();
    if (fetchError || !inv) return json({ error: "Invitation not found." }, 404);
    if (inv.consumed_at) return json({ error: "This invitation has already been accepted." }, 409);

    // Revoke the old token
    await db
      .from("user_invitations")
      .update({ revoked_at: new Date().toISOString(), updated_by: caller.userId })
      .eq("id", invitationId);

    const rawToken = randomToken();
    const tokenHash = await sha256(rawToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const clientRow = Array.isArray(inv.client) ? inv.client[0] : inv.client;

    const { data: newInv, error: insertError } = await db
      .from("user_invitations")
      .insert({
        email: inv.email,
        role: inv.role,
        client_id: inv.client_id,
        max_devices: inv.max_devices,
        invitation_message: inv.invitation_message,
        token_hash: tokenHash,
        expires_at: expiresAt,
        invited_by: caller.userId,
        created_by: caller.userId,
      })
      .select("id")
      .single();
    if (insertError || !newInv) {
      return json({ error: insertError?.message ?? "Unable to resend invitation." }, 500);
    }

    let emailDelivered = true;
    try {
      await sendInvitationEmail({
        email: inv.email, role: inv.role, token: rawToken,
        clientName: clientRow?.company_name ?? null,
        maxDevices: inv.max_devices, expiresAt,
        invitationMessage: inv.invitation_message ?? null,
      });
    } catch {
      emailDelivered = false;
    }

    // Audit log
    await db.from("audit_logs").insert({
      actor_id: caller.userId,
      entity_type: "user_invitation",
      entity_id: newInv.id,
      action: "update",
      before_data: { previous_invitation_id: invitationId, email: inv.email, action: "resend_revoked_previous" },
      after_data: { email: inv.email, role: inv.role, new_invitation_id: newInv.id, expires_at: expiresAt, email_delivered: emailDelivered },
    }).catch(() => undefined);

    return json({ invitation_id: newInv.id, email_delivered: emailDelivered });
  }

  // ── POST revoke ───────────────────────────────────────────────────────────
  if (action === "revoke") {
    const invitationId = String(body.invitation_id ?? "");
    if (!invitationId) return json({ error: "invitation_id is required." }, 400);

    const { data: inv } = await db
      .from("user_invitations")
      .select("id, consumed_at, revoked_at")
      .eq("id", invitationId)
      .maybeSingle();
    if (!inv) return json({ error: "Invitation not found." }, 404);
    if (inv.consumed_at) return json({ error: "This invitation has already been accepted and cannot be revoked." }, 409);
    if (inv.revoked_at) return json({ revoked: true }); // idempotent

    await db
      .from("user_invitations")
      .update({ revoked_at: new Date().toISOString(), updated_by: caller.userId })
      .eq("id", invitationId);

    // Audit log
    await db.from("audit_logs").insert({
      actor_id: caller.userId,
      entity_type: "user_invitation",
      entity_id: invitationId,
      action: "update",
      before_data: { status: "pending" },
      after_data: { status: "revoked", revoked_at: new Date().toISOString() },
    }).catch(() => undefined);

    return json({ revoked: true });
  }

  // ── POST list (admin only — returns pending invitations) ──────────────────
  if (action === "list") {
    const { data: rows, error: listError } = await db
      .from("user_invitations")
      .select("id, email, role, client_id, max_devices, expires_at, consumed_at, revoked_at, created_at, invited_by, client:clients(company_name), inviter:profiles!user_invitations_invited_by_fkey(full_name)")
      .order("created_at", { ascending: false })
      .limit(200);
    if (listError) return json({ error: "Unable to load invitations." }, 500);

    const mapped = (rows ?? []).map((row) => {
      const clientRow = Array.isArray(row.client) ? row.client[0] : row.client;
      const inviterRow = Array.isArray(row.inviter) ? row.inviter[0] : row.inviter;
      const now = new Date();
      let status: string;
      if (row.consumed_at) status = "accepted";
      else if (row.revoked_at) status = "revoked";
      else if (new Date(row.expires_at) <= now) status = "expired";
      else status = "pending";
      return {
        id: row.id,
        email: row.email,
        role: row.role,
        client_id: row.client_id,
        client_name: clientRow?.company_name ?? null,
        max_devices: row.max_devices,
        expires_at: row.expires_at,
        consumed_at: row.consumed_at,
        revoked_at: row.revoked_at,
        created_at: row.created_at,
        invited_by_name: inviterRow?.full_name ?? null,
        status,
      };
    });
    return json(mapped);
  }

  return json({ error: "Unknown action." }, 400);
});

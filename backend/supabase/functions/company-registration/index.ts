import { createClient } from "npm:@supabase/supabase-js@2";
import { SESv2Client, SendEmailCommand } from "https://esm.sh/@aws-sdk/client-sesv2@3.637.0?target=deno&bundle";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
});
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] ?? character));
}

async function sendInvitation(clientName: string, email: string, companyName: string, invitationCode: string) {
  const region = Deno.env.get("AWS_SES_REGION") || Deno.env.get("AWS_REGION") || "eu-north-1";
  const accessKeyId = Deno.env.get("AWS_SES_ACCESS_KEY_ID") || Deno.env.get("AWS_ACCESS_KEY_ID");
  const secretAccessKey = Deno.env.get("AWS_SES_SECRET_ACCESS_KEY") || Deno.env.get("AWS_SECRET_ACCESS_KEY");
  const from = Deno.env.get("SES_FROM_EMAIL");
  if (!accessKeyId || !secretAccessKey || !from) throw Error("Company invitation email is not configured.");
  const ses = new SESv2Client({ region, credentials: { accessKeyId, secretAccessKey } });
  const safeCompanyName = escapeHtml(companyName);
  const safeClientName = escapeHtml(clientName);
  const appUrl = (Deno.env.get("APP_URL") || "http://localhost:3000").replace(/\/$/, "");
  const invitationUrl = `${appUrl}/join?token=${encodeURIComponent(invitationCode)}`;
  await ses.send(new SendEmailCommand({ FromEmailAddress: from, Destination: { ToAddresses: [email] }, Content: { Simple: {
    Subject: { Data: "You Are Invited to Join AIP&T", Charset: "UTF-8" },
    Body: { Html: { Data: `<h2>You are invited to join AIP&amp;T</h2><p>Dear ${safeClientName},</p><p>An administrator invited the registered client account for <strong>${safeCompanyName}</strong>.</p><p>Registered email: <strong>${escapeHtml(email)}</strong></p><p><a href='${invitationUrl}'>Join Application</a></p><p>Invitation code:</p><p><strong>${invitationCode}</strong></p><p>This invitation expires in 72 hours. Do not forward this email or share the code.</p>`, Charset: "UTF-8" } },
  } } }));
}
function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 200, headers: cors });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    const body = await request.json();
    const action = String(body.action ?? "");

    if (action === "verify_invitation") {
      const email = String(body.email ?? "").trim().toLowerCase();
      const code = String(body.invitation_code ?? "").trim();
      if ((email && !emailPattern.test(email)) || code.length < 32) return json({ error: "The invitation details are invalid or expired." }, 400);

      const tokenHash = await sha256(code);
      const { data: invitation, error } = await db.from("client_invitations")
        .select("id,client_id,email,expires_at,consumed_at,revoked_at,client:clients(id,assigned_id,company_name,email,status,deleted_at)")
        .eq("token_hash", tokenHash).maybeSingle();
      const client = Array.isArray(invitation?.client) ? invitation?.client[0] : invitation?.client;
      if (error || !invitation || !client || (email && invitation.email !== email) || invitation.consumed_at || invitation.revoked_at || new Date(invitation.expires_at) <= new Date() || client.deleted_at) {
        return json({ error: "The invitation details are invalid or expired." }, 400);
      }
      if (client.status !== "Active") return json({ error: "This company account is inactive. Ask the administrator to activate the company before registering." }, 409);
      if (String(client.email ?? "").trim().toLowerCase() !== invitation.email) return json({ error: "The client's registered email has changed. Ask the administrator for a new invitation." }, 409);
      const existingUser = await db.rpc("find_auth_user_id_by_email", { p_email: invitation.email });
      if (existingUser.error) throw existingUser.error;
      if (existingUser.data) return json({ code: "account_exists", error: "This client already has an account. The invitation cannot be used." }, 409);

      // The claim must remain valid through administrator review; it can never
      // outlive the original 72-hour invitation.
      const expiresAt = new Date(invitation.expires_at).toISOString();
      const { data: claim, error: claimError } = await db.from("client_registration_claims").upsert({
        invitation_id: invitation.id, client_id: invitation.client_id, email: invitation.email, expires_at: expiresAt, consumed_at: null,
      }, { onConflict: "invitation_id,email" }).select("id").single();
      if (claimError) throw claimError;
      return json({ verified: true, claim_id: claim.id, email: invitation.email, company: { id: client.id, assigned_id: client.assigned_id, company_name: client.company_name } });
    }

    const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    const { data: { user } } = token ? await db.auth.getUser(token) : { data: { user: null } };
    if (!user) return json({ error: "Authentication is required." }, 401);
    const { data: profile } = await db.from("profiles").select("role,client_id").eq("id", user.id).single();

    if (action === "list_clients" || action === "list_eligible_clients") {
      if (profile?.role !== "administrator") return json({ error: "Administrator access is required." }, 403);
      const clients = [];
      for (let offset = 0; ; offset += 500) {
        const { data: batch, error } = await db.from("clients")
          .select("id,assigned_id,company_name,email,status")
          .is("deleted_at", null).order("assigned_id").range(offset, offset + 499);
        if (error) throw error;
        clients.push(...(batch ?? []));
        if ((batch ?? []).length < 500) break;
      }
      const records = [];
      for (let offset = 0; offset < clients.length; offset += 25) {
        const batch = await Promise.all(clients.slice(offset, offset + 25).map(async (client) => {
          const email = String(client.email ?? "").trim().toLowerCase();
          const validEmail = emailPattern.test(email);
          const [authLookup, linkedProfile, activeInvitation] = await Promise.all([
            validEmail ? db.rpc("find_auth_user_id_by_email", { p_email: email }) : Promise.resolve({ data: null, error: null }),
            db.from("profiles").select("id").eq("client_id", client.id).limit(1).maybeSingle(),
            db.from("client_invitations").select("id,expires_at").eq("client_id", client.id)
              .is("consumed_at", null).is("revoked_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle(),
          ]);
          if (authLookup.error || linkedProfile.error || activeInvitation.error) throw authLookup.error ?? linkedProfile.error ?? activeInvitation.error;
          const invitationActive = Boolean(activeInvitation.data && new Date(activeInvitation.data.expires_at) > new Date());
          const invitation_status = authLookup.data || linkedProfile.data ? "account_exists"
            : invitationActive ? "invitation_exists"
            : client.status !== "Active" ? "inactive"
            : !validEmail ? "invalid_email"
            : "not_invited";
          return { ...client, email, invitation_status, eligible: invitation_status === "not_invited" };
        }));
        records.push(...batch);
      }
      return json({ data: records });
    }

    if (action === "create_invitation") {
      const clientId = String(body.client_id ?? "");
      const isAdministrator = profile?.role === "administrator";
      if (!isAdministrator) return json({ error: "Administrator access is required." }, 403);
      const { data: client } = await db.from("clients").select("company_name,email,status").eq("id", clientId).is("deleted_at", null).maybeSingle();
      if (!client) return json({ error: "Client not found." }, 404);
      if (client.status !== "Active") return json({ error: "Only active companies can receive user invitations." }, 409);
      const email = String(client.email ?? "").trim().toLowerCase();
      if (!emailPattern.test(email)) return json({ error: "This client does not have a valid registered email address." }, 409);
      const authLookup = await db.rpc("find_auth_user_id_by_email", { p_email: email });
      if (authLookup.error) throw authLookup.error;
      const linkedProfile = await db.from("profiles").select("id").eq("client_id", clientId).limit(1).maybeSingle();
      if (linkedProfile.error) throw linkedProfile.error;
      if (authLookup.data || linkedProfile.data) return json({ code: "account_exists", error: "This client already has an account. No invitation was sent." }, 409);
      const existingInvitation = await db.from("client_invitations").select("id,expires_at").eq("client_id", clientId).is("consumed_at", null).is("revoked_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (existingInvitation.error) throw existingInvitation.error;
      if (existingInvitation.data && new Date(existingInvitation.data.expires_at) > new Date()) {
        return json({ code: "invitation_exists", error: "This client already has an active invitation." }, 409);
      }
      if (existingInvitation.data) {
        const revoked = await db.from("client_invitations").update({ revoked_at: new Date().toISOString() }).eq("id", existingInvitation.data.id).is("revoked_at", null);
        if (revoked.error) throw revoked.error;
      }
      const invitationCode = randomToken();
      const { data: invitation, error } = await db.from("client_invitations").insert({
        client_id: clientId, email, token_hash: await sha256(invitationCode), membership_role: "company_admin",
        expires_at: new Date(Date.now() + 72 * 60 * 60_000).toISOString(), invited_by: user.id,
      }).select("id,expires_at").single();
      if (error) throw error;
      try { await sendInvitation(client.company_name, email, client.company_name, invitationCode); } catch (cause) { await db.from("client_invitations").delete().eq("id", invitation.id); throw cause; }
      const auditResult = await db.from("audit_logs").insert({ actor_id: user.id, entity_type: "client_invitation", entity_id: invitation.id, action: "create", before_data: null, after_data: { client_id: clientId, email, membership_role: "company_admin", expires_at: invitation.expires_at, delivered: true } });
      if (auditResult.error) throw auditResult.error;
      return json({ invitation_id: invitation.id, expires_at: invitation.expires_at, delivered: true }, 201);
    }

    return json({ error: "Unsupported action." }, 400);
  } catch (cause) {
    return json({ error: cause instanceof Error ? cause.message : "Request failed." }, 400);
  }
});




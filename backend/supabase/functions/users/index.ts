import { createClient } from "npm:@supabase/supabase-js@2";
import { GetObjectCommand, S3Client } from "npm:@aws-sdk/client-s3@3";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner@3";
import { SESv2Client, SendEmailCommand } from "npm:@aws-sdk/client-sesv2@3";
import { createCircuitBreaker } from "../_shared/circuit-breaker.ts";

const sesBreaker = createCircuitBreaker({ name: "ses-users", failureThreshold: 3, cooldownMs: 60_000, timeoutMs: 15_000 });

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "GET, PUT, DELETE, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

function getS3Client() {
  return new S3Client({ region: Deno.env.get("AWS_REGION") ?? "eu-north-1", credentials: { accessKeyId: Deno.env.get("AWS_ACCESS_KEY_ID") ?? "", secretAccessKey: Deno.env.get("AWS_SECRET_ACCESS_KEY") ?? "" } });
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] ?? character));
}

async function sendApprovalEmail(email: string, clientName: string, companyName: string) {
  const accessKeyId = Deno.env.get("AWS_SES_ACCESS_KEY_ID") || Deno.env.get("AWS_ACCESS_KEY_ID");
  const secretAccessKey = Deno.env.get("AWS_SES_SECRET_ACCESS_KEY") || Deno.env.get("AWS_SECRET_ACCESS_KEY");
  const from = Deno.env.get("SES_FROM_EMAIL");
  if (!accessKeyId || !secretAccessKey || !from) throw Error("Approval email is not configured.");
  const region = Deno.env.get("AWS_SES_REGION") || Deno.env.get("AWS_REGION") || "eu-north-1";
  const loginUrl = `${(Deno.env.get("APP_URL") || "http://localhost:3000").replace(/\/$/, "")}/login`;
  const ses = new SESv2Client({ region, credentials: { accessKeyId, secretAccessKey } });
  await sesBreaker.call(() => ses.send(new SendEmailCommand({ FromEmailAddress: from, Destination: { ToAddresses: [email] }, Content: { Simple: {
    Subject: { Data: "Your Client Account Has Been Approved", Charset: "UTF-8" },
    Body: { Html: { Data: `<p>Dear ${escapeHtml(clientName)},</p><p>Congratulations! Your account for <strong>${escapeHtml(companyName)}</strong> has been reviewed and approved.</p><p>Account Email: <strong>${escapeHtml(email)}</strong></p><p><a href='${loginUrl}'>Login to Your Account</a></p>`, Charset: "UTF-8" } },
  } } })));
}

async function authenticate(request: Request) {
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: { user } } = token ? await db.auth.getUser(token) : { data: { user: null } };
  if (!user) return { db, user: null, error: json({ error: "Authentication is required." }, 401) };
  const { data: profile } = await db.from("profiles").select("role,status").eq("id", user.id).single();
  if (profile?.role !== "administrator" || profile.status !== "active") return { db, user: null, error: json({ error: "Administrator access is required." }, 403) };
  return { db, user, error: null };
}

async function ensureClientForApprovedUser(db: ReturnType<typeof createClient>, userId: string, administratorId: string) {
  const { data: authResult, error: authError } = await db.auth.admin.getUserById(userId);
  const authUser = authResult.user;
  if (authError || !authUser?.email) throw authError ?? Error('The registered email address could not be read.');
  const metadata = authUser.user_metadata ?? {};
  const registrationType = String(metadata.registration_type ?? 'new_company');
  if (registrationType === 'existing_company') {
    const claimId = String(metadata.registration_claim_id ?? '');
    if (!claimId) throw Error('This existing-company registration has no verified invitation claim.');
    const { data: claim, error: claimError } = await db.from('client_registration_claims')
      .select('id,invitation_id,client_id,email,expires_at,consumed_at,claimed_by,invitation:client_invitations(id,membership_role,consumed_at,claimed_by,revoked_at,expires_at)')
      .eq('id', claimId).eq('email', authUser.email.toLowerCase()).maybeSingle();
    const invitation = Array.isArray(claim?.invitation) ? claim?.invitation[0] : claim?.invitation;
    if (claimError || !claim || !invitation || !claim.consumed_at || claim.claimed_by !== userId || !invitation.consumed_at || invitation.claimed_by !== userId || invitation.revoked_at) {
      throw Error('The company invitation is not linked to this registration. Ask the administrator to review the account details.');
    }
    const approved = await db.rpc('approve_existing_client_registration', { p_user_id: userId, p_administrator_id: administratorId, p_claim_id: claim.id, p_email: authUser.email.toLowerCase() });
    if (approved.error) throw approved.error;
    return approved.data as string;
  }
  const companyName = String(metadata.company_name ?? '').trim();
  const phone = String(metadata.phone ?? '').trim();
  const address = String(metadata.address ?? '').trim();
  const countryName = String(metadata.country ?? '').trim();
  if (!companyName || !phone || !address || !countryName) throw Error('The registration is missing company, phone, address, or country details.');
  const countryResult = await db.from('countries').select('id').ilike('name', countryName).is('deleted_at', null).maybeSingle();
  if (countryResult.error) throw countryResult.error;
  if (!countryResult.data) throw Error('The registered country is not configured on the Countries page.');
  const existingResult = await db.from('clients').select('id').ilike('email', authUser.email).is('deleted_at', null).maybeSingle();
  if (existingResult.error) throw existingResult.error;
  if (existingResult.data) throw Error('This company already exists. Register through a verified company invitation instead.');
  const created = await db.from('clients').insert({
    company_name: companyName,
    email: authUser.email.toLowerCase(),
    phone,
    client_type: 'Corporate',
    address,
    country_id: countryResult.data.id,
    notes: 'Created from an administrator-approved registration.',
    status: 'Active',
  }).select('id').single();
  if (created.error) throw created.error;
  const membership = await db.from('client_memberships').upsert({ client_id: created.data.id, user_id: userId, membership_role: 'company_admin', status: 'approved', approved_by: administratorId, approved_at: new Date().toISOString() }, { onConflict: 'client_id,user_id' });
  if (membership.error) throw membership.error;
  return created.data.id;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 200, headers: cors });
  const { db, user, error } = await authenticate(request);
  if (error) return error;
  try {
    if (request.method === "GET") {
      // Auth and REST each cap list sizes. Read every page before filtering or export.
      const authUsers: Array<{ id: string; email?: string; user_metadata?: Record<string, unknown>; created_at: string; last_sign_in_at?: string }> = [];
      for (let page = 1; ; page += 1) {
        const result = await db.auth.admin.listUsers({ page, perPage: 1000 });
        if (result.error) throw result.error;
        authUsers.push(...result.data.users);
        if (result.data.users.length < 1000) break;
      }
      const profiles = [];
      for (let offset = 0; ; offset += 1000) {
        const result = await db.from("profiles").select("id,full_name,company_name,logo_url,role,max_devices,approval_status,approved_at,approved_by,reviewed_at,reviewed_by,account_status,failed_login_attempts,locked_at,last_login_ip,last_login_at,created_at,client_id,client:clients(id,assigned_id,company_name)").order("id").range(offset, offset + 999);
        if (result.error) throw result.error;
        profiles.push(...result.data);
        if (result.data.length < 1000) break;
      }
      const profileMap = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
      const s3 = getS3Client();
      return json(await Promise.all(authUsers.map(async (user) => {
        const profile = profileMap.get(user.id);
        const logoKey = profile?.logo_url ?? null;
        const logoUrl = logoKey?.startsWith("logo_company/")
          ? await getSignedUrl(s3, new GetObjectCommand({ Bucket: Deno.env.get("AWS_S3_BUCKET") ?? "aiptuploaddocument", Key: logoKey }), { expiresIn: 300 }).catch(() => null)
          : null;
        return {
          id: user.id,
          deletion_supported: true,
          deletion_policy: 'non_admin_only',
          profile_import_supported: true,
          email: user.email ?? "",
          full_name: profile?.full_name || user.user_metadata?.full_name || "",
          company_name: (Array.isArray(profile?.client) ? profile.client[0]?.company_name : profile?.client?.company_name) ?? profile?.company_name ?? user.user_metadata?.company_name ?? "",
          client_id: profile?.client_id ?? null,
          client_assigned_id: (Array.isArray(profile?.client) ? profile.client[0]?.assigned_id : profile?.client?.assigned_id) ?? null,
          logo_url: logoUrl,
          ip: profile?.last_login_ip ?? "-",
          role: profile?.role ?? "client",
          max_devices: profile?.max_devices ?? 1,
          approval_status: profile?.approval_status ?? "pending",
          registration_date: profile?.created_at ?? user.created_at,
          approved_at: profile?.approved_at ?? null,
          account_status: profile?.account_status ?? "active",
          failed_login_attempts: profile?.failed_login_attempts ?? 0,
          locked: Boolean(profile?.locked_at),
          last_login_at: profile?.last_login_at ?? user.last_sign_in_at ?? null,
        };
      })));
    }

    const id = new URL(request.url).pathname.split("/").filter(Boolean).at(-1);

    if (request.method === "PUT" && id) {
      const body = await request.json();
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return json({ error: 'A valid user ID is required.' }, 400);
      if (body.action === 'import_profile') {
        const allowed = new Set(['action', 'confirm_email', 'full_name', 'company_name']);
        if (Object.keys(body).some((key) => !allowed.has(key))) return json({ error: 'Excel import can update only full name and profile company name.' }, 400);
        const result = await db.auth.admin.getUserById(id);
        if (result.error || !result.data.user) return json({ error: 'Existing user not found. Imports cannot create login accounts.' }, 404);
        if (typeof body.confirm_email !== 'string' || body.confirm_email.trim().toLowerCase() !== result.data.user.email?.toLowerCase()) return json({ error: 'The user ID and email must match the same existing account.' }, 409);
        const before = await db.from('profiles').select('id,full_name,company_name,client_id,client:clients(company_name)').eq('id', id).maybeSingle();
        if (before.error) throw before.error;
        if (!before.data) return json({ error: 'This account has no existing profile to update.' }, 409);
        const changes: Record<string, string> = {};
        for (const field of ['full_name', 'company_name']) {
          if (body[field] === undefined) continue;
          if (typeof body[field] !== 'string' || !body[field].trim() || body[field].trim().length > 200 || /[\u0000-\u001f]/.test(body[field])) return json({ error: field + ' must contain between 1 and 200 characters, without control characters.' }, 400);
          changes[field] = body[field].trim();
        }
        if (!Object.keys(changes).length) return json({ error: 'No editable profile details were supplied.' }, 400);
        if (before.data.client_id && changes.company_name !== undefined) {
          const company = Array.isArray(before.data.client) ? before.data.client[0]?.company_name : before.data.client?.company_name;
          if (changes.company_name !== company) return json({ error: 'Linked company names must be edited on the Clients page.' }, 409);
          delete changes.company_name;
        }
        if (!Object.keys(changes).length) return json({ updated: false, unchanged: true });
        const saved = await db.from('profiles').update(changes).eq('id', id).select('id,full_name,company_name').single();
        if (saved.error) throw saved.error;
        const audit = await db.from('audit_logs').insert({ actor_id: user.id, entity_type: 'user_account', entity_id: id, action: 'update', before_data: { full_name: before.data.full_name, company_name: before.data.company_name }, after_data: { ...changes, source: 'excel_import' } });
        return json({ updated: true, user: saved.data, warning: audit.error ? 'Profile saved, but the audit entry could not be saved.' : null });
      }
      if (id === user.id && (body.account_status === 'inactive' || ['pending', 'rejected', 'suspended'].includes(body.approval_status))) return json({ error: 'You cannot revoke your own administrator access.' }, 409);
      if (id === user.id && (body.role !== undefined || body.max_devices !== undefined)) return json({ error: 'You cannot change your own role or max devices.' }, 409);
      if (Object.keys(body).some((key) => !['approval_status', 'account_status', 'unlock', 'role', 'max_devices'].includes(key))) return json({ error: 'Unsupported account update.' }, 400);
      const updates: Record<string, unknown> = {};
      let approvedClientId: string | null = null;

      // role / max_devices — fetch before_data for audit
      let roleMaxBefore: Record<string, unknown> = {};
      if (body.role !== undefined || body.max_devices !== undefined) {
        const { data: before } = await db.from('profiles').select('role,max_devices').eq('id', id).maybeSingle();
        if (before) roleMaxBefore = { role: before.role, max_devices: before.max_devices };
      }
      if (body.role !== undefined) {
        const allowedRoles = ['administrator', 'client', 'sub_administrator'];
        if (!allowedRoles.includes(String(body.role))) return json({ error: 'Role must be administrator, client, or sub_administrator.' }, 400);
        updates.role = String(body.role);
      }
      if (body.max_devices !== undefined) {
        const md = Math.round(Number(body.max_devices));
        if (isNaN(md) || md < 1 || md > 10) return json({ error: 'Max devices must be an integer between 1 and 10.' }, 400);
        updates.max_devices = md;
      }

      if (body.approval_status === 'approved') {
        approvedClientId = await ensureClientForApprovedUser(db, id, user.id);
        updates.client_id = approvedClientId;
        updates.account_status = 'active';
        updates.status = 'active';
        updates.approved_at = new Date().toISOString();
        updates.approved_by = user.id;
      }
      if (["pending", "approved", "rejected", "suspended"].includes(body.approval_status)) {
        updates.approval_status = body.approval_status;
        updates.reviewed_at = new Date().toISOString();
        updates.reviewed_by = user.id;
        if (body.approval_status === "rejected") { updates.account_status = "inactive"; updates.status = "deactivated"; }
        if (body.approval_status === "suspended") { updates.account_status = "inactive"; updates.status = "suspended"; }
      }
      if (body.unlock === true) { updates.locked_at = null; updates.failed_login_attempts = 0; updates.status = 'active'; }
      if (body.account_status === "active" || body.account_status === "inactive") {
        updates.account_status = body.account_status;
        updates.status = body.account_status === "active" ? "active" : "deactivated";
      }
      if (!Object.keys(updates).length) return json({ error: 'No valid account changes were supplied.' }, 400);
      const { data, error: updateError } = await db.from("profiles").update(updates).eq("id", id).select("id,full_name,company_name,logo_url,role,max_devices,approval_status,approved_at,approved_by,reviewed_at,reviewed_by,account_status,failed_login_attempts,locked_at,last_login_ip,last_login_at,client_id").single();
      if (updateError) throw updateError;
      const auditBefore = Object.keys(roleMaxBefore).length ? roleMaxBefore : null;
      const auditAfter: Record<string, unknown> = { approval_status: data.approval_status, account_status: data.account_status, client_id: data.client_id };
      if (body.role !== undefined) auditAfter.role = data.role;
      if (body.max_devices !== undefined) auditAfter.max_devices = data.max_devices;
      const auditResult = await db.from("audit_logs").insert({ actor_id: user.id, entity_type: "user_account", entity_id: id, action: "update", before_data: auditBefore, after_data: auditAfter });
      if (auditResult.error) throw auditResult.error;
      let emailDelivered: boolean | null = null;
      if (body.approval_status === "approved" && approvedClientId) {
        const [{ data: authResult }, { data: client }] = await Promise.all([
          db.auth.admin.getUserById(id),
          db.from("clients").select("company_name").eq("id", approvedClientId).single(),
        ]);
        const targetEmail = authResult.user?.email;
        if (targetEmail && client) {
          try { await sendApprovalEmail(targetEmail, data.full_name || "Client", client.company_name); emailDelivered = true; }
          catch (cause) { console.error("Approval email failed", cause instanceof Error ? cause.message : "Unknown error"); emailDelivered = false; }
        }
      }
      return json({ ...data, email_delivered: emailDelivered });
    }

    if (request.method === "DELETE" && id) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return json({ error: 'A valid user ID is required.' }, 400);
      if (id === user.id) return json({ error: 'You cannot delete your own account.' }, 409);
      const body = await request.json().catch(() => ({}));
      const force = body.force === true;
      const { data: target, error: targetError } = await db.auth.admin.getUserById(id);
      if (targetError || !target.user) return json({ error: 'User not found.' }, 404);
      if (!target.user.email || body.confirm_email !== target.user.email) return json({ error: 'Enter the exact user email to confirm deletion.' }, 400);
      const { data: profile, error: profileError } = await db.from('profiles').select('id,client_id,role').eq('id', id).maybeSingle();
      if (profileError) throw profileError;
      if (!profile) return json({ error: 'The user role could not be verified. Deletion is blocked.' }, 409);
      if (profile.role === 'administrator') return json({ error: 'Administrator accounts cannot be deleted, including with Force Delete.' }, 403);
      const { count: membershipCount, error: membershipError } = await db.from('client_memberships').select('id', { count: 'exact', head: true }).eq('user_id', id);
      if (membershipError) throw membershipError;
      if (!force && (profile?.client_id || membershipCount)) return json({ error: 'This user is linked to a client. Use Force Delete to remove their account and memberships while retaining client records.' }, 409);
      // Delete through Auth first. Database cascades remove the profile and memberships
      // atomically; restrictive business-history references remain protected.
      const { error: authError } = await db.auth.admin.deleteUser(id);
      if (authError) return json({ error: 'The user could not be deleted. Historical records or owned files may require this account. Deactivate it to revoke access while preserving those records.' }, 409);
      const { error: auditError } = await db.from('audit_logs').insert({ actor_id: user.id, entity_type: 'user_account', entity_id: id, action: 'delete', before_data: { email: target.user.email, role: profile?.role, client_id: profile?.client_id }, after_data: { force, memberships_removed: membershipCount ?? 0 } });
      return json({ deleted: true, warning: auditError ? 'User deleted, but the audit entry could not be saved.' : null });
    }

    return json({ error: "Method not allowed." }, 405);
  } catch (cause) {
    return json({ error: cause instanceof Error ? cause.message : "Request failed." }, 400);
  }
});








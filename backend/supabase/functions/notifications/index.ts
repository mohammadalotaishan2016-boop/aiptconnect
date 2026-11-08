import { clientPermissionResponse, actionForRequest } from '../_shared/client-permissions.ts';
import { createClient } from "npm:@supabase/supabase-js@2";
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "https://esm.sh/@aws-sdk/client-s3@3.637.0?target=deno&bundle";
import { getSignedUrl } from "https://esm.sh/@aws-sdk/s3-request-presigner@3.637.0?target=deno&bundle";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const types: Record<string, string> = { pdf: "application/pdf", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", svg: "image/svg+xml" };
const allowed = new Set(Object.values(types));
const s3 = new S3Client({ region: Deno.env.get("AWS_REGION")!, credentials: { accessKeyId: Deno.env.get("AWS_ACCESS_KEY_ID")!, secretAccessKey: Deno.env.get("AWS_SECRET_ACCESS_KEY")! } });
const bucket = Deno.env.get("AWS_S3_BUCKET")!;
async function awsDocumentMetadata(key: string | null) {
  if (!key) return null;
  try {
    const object = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return {
      size_bytes: object.ContentLength ?? null,
      content_type: object.ContentType ?? null,
      last_modified: object.LastModified?.toISOString() ?? null,
      etag: object.ETag?.replace(/^"|"$/g, "") ?? null,
    };
  } catch {
    return null;
  }
}
function validate(body: unknown) { const value = body as Record<string, unknown>; const notification_date = typeof value.notification_date === "string" ? value.notification_date : ""; const description = typeof value.description === "string" ? value.description.trim() : ""; const country_ids = Array.isArray(value.country_ids) ? value.country_ids.filter((id): id is string => typeof id === "string") : []; if (!notification_date || Number.isNaN(Date.parse(notification_date))) throw Error("A valid date is required."); if (description.length < 3 || description.length > 500) throw Error("Description must be between 3 and 500 characters."); if (!country_ids.length) throw Error("Select at least one country."); return { notification_date, description, country_ids, document_key: typeof value.document_key === "string" ? value.document_key : null, document_name: typeof value.document_name === "string" ? value.document_name : null, document_size: typeof value.document_size === "number" ? value.document_size : null, document_type: typeof value.document_type === "string" ? value.document_type : null }; }

const databasePageSize = 1000;

async function listNotificationRows(db: ReturnType<typeof createClient>, select: string, clientIds: string[] | null) {
  const rows: Array<Record<string, any>> = [];
  if (clientIds !== null) {
    const batchSize = 500;
    for (let start = 0; start < clientIds.length; start += batchSize) {
      const ids = clientIds.slice(start, start + batchSize);
      const { data, error } = await db.from("notifications")
        .select(select)
        .is("deleted_at", null)
        .in("id", ids)
        .order("notification_date", { ascending: false })
        .order("id", { ascending: true });
      if (error) throw error;
      rows.push(...((data ?? []) as Array<Record<string, any>>));
    }
  } else {
    for (let offset = 0; ; offset += databasePageSize) {
      const { data, error } = await db.from("notifications")
        .select(select)
        .is("deleted_at", null)
        .order("notification_date", { ascending: false })
        .order("id", { ascending: true })
        .range(offset, offset + databasePageSize - 1);
      if (error) throw error;
      const page = (data ?? []) as Array<Record<string, any>>;
      rows.push(...page);
      if (page.length < databasePageSize) break;
    }
  }
  return rows.sort((first, second) => Date.parse(String(second.notification_date)) - Date.parse(String(first.notification_date)) || String(first.id).localeCompare(String(second.id)));
}

async function addAwsMetadata(rows: Array<Record<string, any>>) {
  const enriched: Array<Record<string, any>> = [];
  const batchSize = 40;
  for (let start = 0; start < rows.length; start += batchSize) {
    const batch = rows.slice(start, start + batchSize);
    enriched.push(...await Promise.all(batch.map(async item => ({ ...item, aws_metadata: await awsDocumentMetadata(item.document_key) }))));
  }
  return enriched;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 200, headers: cors });
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: { user } } = token ? await db.auth.getUser(token) : { data: { user: null } };
  if (!user) return json({ error: "Authentication is required." }, 401);
  const { data: profile } = await db.from("profiles").select("role,client_id,approval_status,account_status").eq("id", user.id).single();
  if (!profile || !["administrator", "client"].includes(profile.role)) return json({ error: "Notification access is not configured for this account." }, 403);
  if (profile.role === "client") {
    let clientId = profile.client_id;
    if (!clientId && user.email) {
      const { data: client } = await db.from("clients").select("id").ilike("email", user.email).is("deleted_at", null).maybeSingle();
      if (client) {
        clientId = client.id;
        await db.from("profiles").update({ client_id: client.id }).eq("id", user.id);
      }
    }
    if (!clientId) return json({ error: "This client account is not linked to a client record." }, 403);
    if (profile.approval_status !== "approved" || profile.account_status !== "active" || !user.email) return json({ error: "This client account is not approved and active." }, 403);
    const { data: linkedClient } = await db.from("clients").select("email").eq("id", clientId).is("deleted_at", null).maybeSingle();
    if (!linkedClient || linkedClient.email.trim().toLowerCase() !== user.email.trim().toLowerCase()) return json({ error: "The registered client email does not match this account." }, 403);
  }
  const parts = new URL(request.url).pathname.split("/").filter(Boolean), last = parts.at(-1), id = parts.length > 2 ? parts.at(-2) : null;
  const select = "id,notification_date,description,document_key,document_name,document_size,document_type,created_at,updated_at,countries:notification_countries(country:countries(id,name,abbreviation,flag_url,deleted_at))";
  try {
    const denied = await clientPermissionResponse(db, user.id, 'notifications', actionForRequest(request), cors); if (denied) return denied;
    // Server-side S3 upload avoids the browser-to-S3 CORS preflight entirely.
    if (request.method === "POST" && last === "upload") { const form = await request.formData(), file = form.get("file"); if (!(file instanceof File)) return json({ error: "Select a document to upload." }, 400); const extension = file.name.split(".").pop()?.toLowerCase() ?? "", type = allowed.has(file.type) ? file.type : types[extension]; if (!type || file.size < 1 || file.size > 10485760) return json({ error: "Upload one PDF, DOC, DOCX, XLS, XLSX, JPG, PNG, or SVG file up to 10MB." }, 400); const key = `notifications/${crypto.randomUUID()}/${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`; await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: new Uint8Array(await file.arrayBuffer()), ContentType: type })); return json({ key, document_name: file.name, document_size: file.size, document_type: type }, 201); }
    if (request.method === "GET" && last === "download-url" && id) { const { data } = await db.from("notifications").select("document_key").eq("id", id).is("deleted_at", null).maybeSingle(); if (!data?.document_key) return json({ error: "Document not found." }, 404); return json({ url: await getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: data.document_key }), { expiresIn: 300 }) }); }
    // Notification rows are a shared catalog. Clients can view; only administrators manage it.
    if (request.method === "GET") { const manage = new URL(request.url).searchParams.get("manage") === "true"; if (profile.role === "client" && manage) return json({ error: "Administrator access is required to manage notifications." }, 403); const records = await listNotificationRows(db, select, null); const activeCountryRecords = records.map(record => ({ ...record, countries: (record.countries ?? []).filter((entry: { country?: { deleted_at?: string | null } | null }) => entry.country != null && entry.country.deleted_at == null) })); return json(await addAwsMetadata(activeCountryRecords)); }
    if (request.method === "POST") { const { country_ids, ...record } = validate(await request.json()); const { data, error } = await db.from("notifications").insert(record).select().single(); if (error) throw error; await db.from("notification_countries").insert(country_ids.map((country_id) => ({ notification_id: data.id, country_id }))); await db.from("audit_logs").insert({ actor_id: user.id, entity_type: "notification", entity_id: data.id, action: "create", after_data: data }); const { data: created } = await db.from("notifications").select(select).eq("id", data.id).single(); return json(created, 201); }
    const notificationId = last === "notifications" ? null : last; if (!notificationId) return json({ error: "Notification id is required." }, 400); const { data: before } = await db.from("notifications").select("*").eq("id", notificationId).is("deleted_at", null).maybeSingle(); if (!before) return json({ error: "Notification not found." }, 404);
    if (request.method === "PUT") { const { country_ids, ...record } = validate(await request.json()); const { data, error } = await db.from("notifications").update(record).eq("id", notificationId).select().single(); if (error) throw error; await db.from("notification_countries").delete().eq("notification_id", notificationId); await db.from("notification_countries").insert(country_ids.map((country_id) => ({ notification_id: notificationId, country_id }))); if (before.document_key && record.document_key !== before.document_key) await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: before.document_key })); await db.from("audit_logs").insert({ actor_id: user.id, entity_type: "notification", entity_id: notificationId, action: "update", before_data: before, after_data: data }); const { data: updated } = await db.from("notifications").select(select).eq("id", notificationId).single(); return json(updated); }
    if (request.method === "DELETE") { await db.from("notifications").update({ deleted_at: new Date().toISOString() }).eq("id", notificationId); if (before.document_key) await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: before.document_key })); await db.from("audit_logs").insert({ actor_id: user.id, entity_type: "notification", entity_id: notificationId, action: "delete", before_data: before }); return new Response(null, { status: 204, headers: cors }); }
    return json({ error: "Method not allowed." }, 405);
  } catch (cause) {
    const error = cause as { name?: string; message?: string; $metadata?: { httpStatusCode?: number } };
    if (error.name === "NoSuchBucket" || /specified bucket does not exist/i.test(error.message ?? "")) {
      return json({ error: "The configured AWS S3 bucket could not be found. Verify AWS_S3_BUCKET and AWS_REGION in the Notifications function secrets." }, 502);
    }
    if (error.name === "AccessDenied" || error.$metadata?.httpStatusCode === 403 || /access denied/i.test(error.message ?? "")) {
      return json({ error: "AWS denied access to the notification document bucket. Grant the configured IAM user bucket setup access and s3:PutObject, s3:GetObject, and s3:DeleteObject for notifications/*." }, 502);
    }
    return json({ error: error.message ?? "Request failed." }, error.$metadata?.httpStatusCode && error.$metadata.httpStatusCode >= 500 ? 502 : 400);
  }
});

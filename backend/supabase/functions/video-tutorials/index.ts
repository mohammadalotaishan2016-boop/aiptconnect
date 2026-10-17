import { DeleteObjectCommand, GetObjectCommand, S3Client } from "https://esm.sh/@aws-sdk/client-s3@3.637.0?target=deno&bundle";
import { getSignedUrl } from "https://esm.sh/@aws-sdk/s3-request-presigner@3.637.0?target=deno&bundle";
import { createClient } from "npm:@supabase/supabase-js@2";

const bucket = "aiptuploaddocument";
const supabaseBucket = "aipt-video-tutorials";
const region = "eu-north-1";
const prefix = "aiptvideotutorial/";
const maxVideoSize = 1024 * 1024 * 1024;
const cards = new Map([
  ["quotations", "Quotations"],
  ["schedule-of-fees", "Schedule of Fees"],
  ["requirements", "Requirements"],
  ["statements", "Statements"],
  ["poa", "POA"],
  ["projects", "Project"],
  ["notifications", "Notification"],
  ["customer-service", "Customer Service"],
]);
const videoTypes: Record<string, string> = {
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  m4v: "video/x-m4v",
};
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
let storage: S3Client | undefined;

function getS3() {
  const accessKeyId = Deno.env.get("AWS_ACCESS_KEY_ID");
  const secretAccessKey = Deno.env.get("AWS_SECRET_ACCESS_KEY");
  if (!accessKeyId || !secretAccessKey) throw Error("AWS storage credentials are not configured.");
  return storage ??= new S3Client({
    region,
    credentials: { accessKeyId, secretAccessKey, ...(Deno.env.get("AWS_SESSION_TOKEN") ? { sessionToken: Deno.env.get("AWS_SESSION_TOKEN") } : {}) },
  });
}

function validCard(value: unknown): value is string {
  return typeof value === "string" && cards.has(value);
}

async function authorize(request: Request) {
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: { user }, error: authError } = token ? await db.auth.getUser(token) : { data: { user: null }, error: null };
  if (authError || !user) return { db, error: json({ error: "Authentication is required." }, 401) };
  const { data: profile, error } = await db.from("profiles").select("role,client_id,approval_status,account_status").eq("id", user.id).maybeSingle();
  if (error) throw error;
  const role = String(profile?.role ?? "").trim().toLowerCase();
  if (["admin", "administrator"].includes(role)) {
    if (profile?.account_status === "inactive" || (profile?.approval_status && profile.approval_status !== "approved")) {
      return { db, error: json({ error: "Administrator access is denied." }, 403) };
    }
    return { db, user, role: "admin", profile, error: null };
  }
  if (role !== "client" || profile?.approval_status !== "approved" || profile.account_status !== "active" || !profile.client_id || !user.email) {
    return { db, error: json({ error: "An approved, active client account is required." }, 403) };
  }
  const { data: client, error: clientError } = await db.from("clients").select("email").eq("id", profile.client_id).is("deleted_at", null).maybeSingle();
  if (clientError) throw clientError;
  if (!client || client.email.trim().toLowerCase() !== user.email.trim().toLowerCase()) {
    return { db, error: json({ error: "The registered client email does not match this account." }, 403) };
  }
  return { db, user, role: "client", profile, error: null };
}

function storageError(cause: unknown) {
  const error = cause as { name?: string; message?: string; $metadata?: { httpStatusCode?: number } };
  const code = (error as { code?: string }).code ?? "";
  if (error.name === "AccessDenied" || error.$metadata?.httpStatusCode === 403) {
    return json({ error: `AWS denied access. Grant s3:PutObject, s3:GetObject, and s3:DeleteObject on arn:aws:s3:::${bucket}/${prefix}*.` }, 502);
  }
  if (["NoSuchBucket", "PermanentRedirect", "AuthorizationHeaderMalformed"].includes(error.name ?? "")) {
    return json({ error: `Confirm bucket ${bucket} exists in ${region}.` }, 502);
  }
  if (["42P01", "PGRST205", "42703", "PGRST204"].includes(code)) {
    return json({ error: "The video tutorials database migration is not deployed." }, 503);
  }
  if (error.message?.toLowerCase().includes("bucket not found")) {
    return json({ error: `Supabase Storage bucket ${supabaseBucket} is not configured. Apply migration 202610170001_move_video_tutorials_to_supabase_storage.sql.` }, 503);
  }
  return json({ error: error.message || "Unable to complete the video tutorial request." }, 400);
}

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response(null, { status: 200, headers: cors });
  try {
    const auth = await authorize(request);
    if (auth.error) return auth.error;
    const url = new URL(request.url);

    if (request.method === "GET" && auth.role === "admin" && url.searchParams.get("manage") === "true") {
      const { data, error } = await auth.db.from("video_tutorials").select("card_key,title,s3_key,file_name,content_type,file_size,updated_at").order("card_key");
      if (error) throw error;
      return json({ data: data ?? [] });
    }

    if (request.method === "GET" && auth.role === "client" && url.searchParams.get("client") === "true") {
      const { data, error } = await auth.db.from("video_tutorials").select("card_key,title,s3_key,storage_provider,storage_path");
      if (error) throw error;
      const tutorials = await Promise.all((data ?? []).map(async item => {
        let signedUrl: string;
        if (item.storage_provider === "supabase" && item.storage_path) {
          const { data: signed, error: signError } = await auth.db.storage.from(supabaseBucket).createSignedUrl(item.storage_path, 3600);
          if (signError || !signed?.signedUrl) throw signError ?? Error("Could not create a video playback link.");
          signedUrl = signed.signedUrl;
        } else {
          signedUrl = await getSignedUrl(getS3(), new GetObjectCommand({ Bucket: bucket, Key: item.s3_key }), { expiresIn: 3600 });
        }
        return { card_key: item.card_key, title: item.title, url: signedUrl };
      }));
      return json({ data: tutorials });
    }

    if (request.method === "POST" && auth.role === "admin" && url.searchParams.get("action") === "upload") {
      const body = await request.json();
      if (!validCard(body.card_key)) return json({ error: "Select a valid dashboard card." }, 400);
      const fileName = typeof body.file_name === "string" ? body.file_name.trim() : "";
      const extension = fileName.split(".").at(-1)?.toLowerCase() ?? "";
      const contentType = videoTypes[extension];
      const fileSize = Number(body.file_size);
      if (!contentType || body.content_type !== contentType) return json({ error: "Upload an MP4, WebM, MOV, or M4V video." }, 400);
      if (!Number.isSafeInteger(fileSize) || fileSize < 1 || fileSize > maxVideoSize) return json({ error: "Video files must be 1 GB or smaller." }, 400);
      if (!fileName || fileName.length > 200 || /[/\\]/.test(fileName)) return json({ error: "Choose a valid video file name." }, 400);
      const path = `${crypto.randomUUID()}.${extension}`;
      const { data: signed, error } = await auth.db.storage.from(supabaseBucket).createSignedUploadUrl(path);
      if (error || !signed?.token) throw error ?? Error("Could not create a Supabase Storage upload link.");
      return json({ path, token: signed.token, content_type: contentType });
    }

    if (request.method === "POST" && auth.role === "admin" && url.searchParams.get("action") === "assign") {
      const body = await request.json();
      if (!validCard(body.card_key) || typeof body.path !== "string" || !/^[0-9a-f-]{36}\.(mp4|webm|mov|m4v)$/i.test(body.path)) {
        return json({ error: "Select a valid dashboard card and uploaded video." }, 400);
      }
      const title = typeof body.title === "string" ? body.title.trim() : "";
      const fileName = typeof body.file_name === "string" ? body.file_name.trim() : "";
      const extension = body.path.split(".").at(-1)?.toLowerCase() ?? "";
      const contentType = videoTypes[extension];
      if (!title || title.length > 200 || !fileName || fileName.length > 200 || !contentType) return json({ error: "Enter a title and select a valid video." }, 400);
      const { data: file, error: fileError } = await auth.db.storage.from(supabaseBucket).info(body.path);
      if (fileError) throw Error(`Could not verify the uploaded video in Supabase Storage: ${fileError.message}`);
      const fileSize = Number(file?.size);
      if (!Number.isSafeInteger(fileSize) || fileSize < 1) return json({ error: "Supabase Storage did not return a valid uploaded file size." }, 502);
      if (fileSize > maxVideoSize) return json({ error: "The uploaded video exceeds the 1 GB limit." }, 400);
      if (file.contentType !== contentType) return json({ error: `Supabase Storage reports ${file.contentType || "an unknown content type"}; the selected file requires ${contentType}.` }, 400);
      const { data: previous, error: previousError } = await auth.db.from("video_tutorials").select("s3_key,storage_provider,storage_path").eq("card_key", body.card_key).maybeSingle();
      if (previousError) throw previousError;
      const record = { card_key: body.card_key, title, s3_key: `${prefix}${body.path}`, storage_provider: "supabase", storage_path: body.path, file_name: fileName, content_type: contentType, file_size: fileSize, updated_at: new Date().toISOString() };
      const { data, error } = await auth.db.from("video_tutorials").upsert(record, { onConflict: "card_key" }).select("card_key,title,s3_key,file_name,content_type,file_size,updated_at").single();
      if (error) throw error;
      if (previous?.storage_provider === "supabase" && previous.storage_path && previous.storage_path !== body.path) {
        await auth.db.storage.from(supabaseBucket).remove([previous.storage_path]);
      } else if (previous?.storage_provider !== "supabase" && previous?.s3_key) {
        await getS3().send(new DeleteObjectCommand({ Bucket: bucket, Key: previous.s3_key }));
      }
      return json({ data });
    }

    if (request.method === "PATCH" && auth.role === "admin") {
      const body = await request.json();
      const title = typeof body.title === "string" ? body.title.trim() : "";
      if (!validCard(body.card_key) || !title || title.length > 200) return json({ error: "Enter a valid card and tutorial title." }, 400);
      const { data, error } = await auth.db.from("video_tutorials").update({ title, updated_at: new Date().toISOString() }).eq("card_key", body.card_key).select("card_key,title,s3_key,file_name,content_type,file_size,updated_at").maybeSingle();
      if (error) throw error;
      if (!data) return json({ error: "No tutorial is assigned to this card." }, 404);
      return json({ data });
    }

    if (request.method === "DELETE" && auth.role === "admin") {
      const cardKey = url.searchParams.get("card_key");
      if (!validCard(cardKey)) return json({ error: "Select a valid dashboard card." }, 400);
      const { data: previous, error: lookupError } = await auth.db.from("video_tutorials").select("s3_key,storage_provider,storage_path").eq("card_key", cardKey).maybeSingle();
      if (lookupError) throw lookupError;
      if (!previous) return json({ error: "No tutorial is assigned to this card." }, 404);
      const { error } = await auth.db.from("video_tutorials").delete().eq("card_key", cardKey);
      if (error) throw error;
      if (previous.storage_provider === "supabase" && previous.storage_path) {
        const { error: removeError } = await auth.db.storage.from(supabaseBucket).remove([previous.storage_path]);
        if (removeError) throw removeError;
      } else {
        await getS3().send(new DeleteObjectCommand({ Bucket: bucket, Key: previous.s3_key }));
      }
      return new Response(null, { status: 204, headers: cors });
    }

    return json({ error: "Method not allowed." }, 405);
  } catch (cause) {
    return storageError(cause);
  }
});

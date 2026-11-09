import { createClient } from "npm:@supabase/supabase-js@2";
import { clientPermissionResponse } from '../_shared/client-permissions.ts';

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
function validate(body: unknown) {
  const value = body as Record<string, unknown>;
  const title = typeof value.title === "string" ? value.title.trim() : "";
  const description = typeof value.description === "string" ? value.description.trim() : "";
  const service_id = typeof value.service_id === "string" ? value.service_id : "";
  const country_ids = Array.isArray(value.country_ids) ? [...new Set(value.country_ids.filter((id): id is string => typeof id === "string"))] : [];
  if (!title || title.length > 160) throw Error("Title is required and must be 160 characters or fewer.");
  if (!description || description.length > 5000) throw Error("Description is required and must be 5,000 characters or fewer.");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(service_id)) throw Error("Select an active service.");
  if (!country_ids.length) throw Error("Select at least one country.");
  return { title, description, service_id, country_ids };
}

async function validateService(db: ReturnType<typeof createClient>, serviceId: string) {
  const { data, error } = await db.from("services").select("id").eq("id", serviceId).is("deleted_at", null).maybeSingle();
  if (error) throw error;
  if (!data) throw Error("The selected service is no longer active. Choose another service.");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 200, headers: cors });
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: { user } } = token ? await db.auth.getUser(token) : { data: { user: null } };
  if (!user) return json({ error: "Authentication is required." }, 401);
  const { data: profile } = await db.from("profiles").select("role,client_id,approval_status,account_status").eq("id", user.id).maybeSingle();
  if (profile?.role === "administrator") {
    // Administrators retain News Feed management access.
  } else if (profile?.role === "client") {
    if (profile.approval_status !== "approved" || profile.account_status !== "active" || !profile.client_id || !user.email) return json({ error: "An approved, active, linked client account is required." }, 403);
    const { data: client, error: clientError } = await db.from("clients").select("email").eq("id", profile.client_id).is("deleted_at", null).maybeSingle();
    if (clientError) return json({ error: "Client account status could not be verified." }, 503);
    if (!client || client.email.trim().toLowerCase() !== user.email.trim().toLowerCase()) return json({ error: "The registered client email does not match this account." }, 403);
    const denied = await clientPermissionResponse(db, user.id, "notifications", "view", cors);
    if (denied) return denied;
  } else {
    return json({ error: "News Feed access is not configured for this account." }, 403);
  }
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  const id = parts.at(-1) === "news-feed" ? null : parts.at(-1);
  try {
    if (request.method === "GET") {
      const [{ data, error }, { data: countries, error: countriesError }] = await Promise.all([
        db.from("news_feed").select("id,title,description,service_id,created_at,updated_at,service:services(id,service,color),countries:news_feed_countries(country:countries(id,name,abbreviation,flag_url,deleted_at))").is("deleted_at", null).order("created_at", { ascending: false }),
        db.from("countries").select("id,name,abbreviation,flag_url").is("deleted_at", null).order("name"),
      ]);
      if (error) throw error;
      if (countriesError) throw countriesError;
      const items = (data ?? []).map(item => ({ ...item, countries: (item.countries ?? []).filter((entry: { country?: { deleted_at?: string | null } | null }) => entry.country && entry.country.deleted_at == null).map((entry: { country: Record<string, unknown> }) => ({ country: Object.fromEntries(Object.entries(entry.country).filter(([key]) => key !== "deleted_at")) })) }));
      return json({ items, countries: countries ?? [] });
    }
    if (profile?.role !== "administrator") return json({ error: "Administrator access is required to manage news feeds." }, 403);
    if (request.method === "POST") {
      const { country_ids, ...record } = validate(await request.json());
      await validateService(db, record.service_id);
      const { data, error } = await db.from("news_feed").insert(record).select("id").single();
      if (error) throw error;
      const { error: linkError } = await db.from("news_feed_countries").insert(country_ids.map(country_id => ({ news_feed_id: data.id, country_id })));
      if (linkError) { await db.from("news_feed").delete().eq("id", data.id); throw linkError; }
      await db.from("audit_logs").insert({ actor_id: user.id, entity_type: "news_feed", entity_id: data.id, action: "create", after_data: record });
      const { data: saved, error: readError } = await db.from("news_feed").select(select).eq("id", data.id).single();
      if (readError) throw readError;
      return json(saved, 201);
    }
    if (!id) return json({ error: "News feed item id is required." }, 400);
    const { data: before, error: beforeError } = await db.from("news_feed").select(select).eq("id", id).is("deleted_at", null).maybeSingle();
    if (beforeError) throw beforeError;
    if (!before) return json({ error: "News feed item not found." }, 404);
    if (request.method === "PUT") {
      const { country_ids, ...record } = validate(await request.json());
      await validateService(db, record.service_id);
      const { error } = await db.from("news_feed").update(record).eq("id", id);
      if (error) throw error;
      const { error: deleteError } = await db.from("news_feed_countries").delete().eq("news_feed_id", id);
      if (deleteError) throw deleteError;
      const { error: insertError } = await db.from("news_feed_countries").insert(country_ids.map(country_id => ({ news_feed_id: id, country_id })));
      if (insertError) throw insertError;
      await db.from("audit_logs").insert({ actor_id: user.id, entity_type: "news_feed", entity_id: id, action: "update", before_data: before, after_data: record });
      const { data: saved, error: readError } = await db.from("news_feed").select(select).eq("id", id).single();
      if (readError) throw readError;
      return json(saved);
    }
    if (request.method === "DELETE") {
      const { error } = await db.from("news_feed").update({ deleted_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
      await db.from("audit_logs").insert({ actor_id: user.id, entity_type: "news_feed", entity_id: id, action: "delete", before_data: before });
      return new Response(null, { status: 204, headers: cors });
    }
    return json({ error: "Method not allowed." }, 405);
  } catch (cause) {
    return json({ error: cause instanceof Error ? cause.message : "Request failed." }, 400);
  }
});

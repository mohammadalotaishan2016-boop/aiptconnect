
import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

async function sha256(data: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", data);
  return toHex(new Uint8Array(hash));
}

async function createSignature(
  privateKeyB64: string,
  timestamp: string,
  nonce: string,
): Promise<string> {
  // The secret must contain Base64-encoded PKCS#8 DER bytes.
  const binary = atob(privateKeyB64.trim());
  const keyBytes = Uint8Array.from(
    binary,
    (char) => char.charCodeAt(0),
  );

  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    keyBytes.buffer,
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
    false,
    ["sign"],
  );

  const bodyHash = await sha256(new Uint8Array());

  const canonicalString = [
    "GET",
    "/api/external/clients",
    timestamp,
    nonce,
    bodyHash,
  ].join("\n");

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    new TextEncoder().encode(canonicalString),
  );

  return toBase64(new Uint8Array(signature));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    // Verify that the caller is an authenticated Supabase user.
    const authHeader = req.headers.get("Authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse(
        { error: "Authentication required" },
        401,
      );
    }

    const token = authHeader.slice(7);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey =
      Deno.env.get("SUPABASE_ANON_KEY") ??
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY");

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Supabase authentication configuration is missing");
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data: userData, error: authError } =
      await supabase.auth.getUser(token);

    if (authError || !userData.user) {
      return jsonResponse(
        { error: "Invalid or expired user session" },
        401,
      );
    }

    // Read server-side secrets.
    const apiKey = Deno.env.get("AIPT_API_KEY");
    const apiUrl = Deno.env.get("AIPT_API_URL");
    const privateKeyB64 = Deno.env.get("AIPT_PRIVATE_KEY_B64");

    if (!apiKey || !apiUrl || !privateKeyB64) {
      throw new Error("AIPT API secrets are missing");
    }

    const endpoint = new URL(apiUrl);

    if (
      endpoint.pathname !== "/api/external/clients" ||
      endpoint.search
    ) {
      throw new Error("Unexpected AIPT API endpoint");
    }

    // Generate timestamp and unique nonce.
    const timestamp = Math.floor(Date.now() / 1000).toString();

    const nonceBytes = crypto.getRandomValues(new Uint8Array(16));
    const nonce = toHex(nonceBytes);

    // Sign the Laravel API request.
    const signature = await createSignature(
      privateKeyB64,
      timestamp,
      nonce,
    );

    const apiResponse = await fetch(endpoint.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-API-KEY": apiKey,
        "X-TIMESTAMP": timestamp,
        "X-NONCE": nonce,
        "X-SIGNATURE": signature,
      },
    });

    const responseText = await apiResponse.text();

    let responseData: unknown;

    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { message: responseText };
    }

    if (!apiResponse.ok) {
      console.error("Laravel API returned status:", apiResponse.status);

      return jsonResponse(
        {
          error: "Laravel API request failed",
          upstream_status: apiResponse.status,
          details: responseData,
        },
        502,
      );
    }

    return jsonResponse({
      success: true,
      message: "Successfully connected to AIPT Laravel API",
      data: responseData,
    });
  } catch (error) {
    console.error(
      "AIPT external clients error:",
      error instanceof Error ? error.message : "Unknown error",
    );

    return jsonResponse(
      {
        success: false,
        error: "Unable to retrieve AIPT client records",
      },
      500,
    );
  }
});

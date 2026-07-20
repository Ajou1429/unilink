// GET /google-auth/start    (Authorization: Bearer <supabase access token> 필요)
// GET /google-auth/callback (Google이 code, state로 리다이렉트)
//
// verify_jwt = false로 배포한다 (supabase/config.toml) — callback은 Google이
// 호출하므로 Supabase JWT를 붙일 수 없다. /start는 이 함수 내부에서 직접
// getUserFromAuthHeader로 사용자를 확인한다.

import {
  buildConsentUrl,
  exchangeCodeForTokens,
  getDriveAccountProfile,
} from "../_shared/google.ts";
import { encryptSecret } from "../_shared/crypto.ts";
import { getAdminClient, getUserFromAuthHeader } from "../_shared/supabaseAdmin.ts";
import { corsHeaders, handleOptions, jsonResponse } from "../_shared/cors.ts";

const FRONTEND_URL = Deno.env.get("FRONTEND_URL") ?? "/";
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

Deno.serve(async (req) => {
  const optionsResponse = handleOptions(req);
  if (optionsResponse) return optionsResponse;

  const url = new URL(req.url);
  const action = url.pathname.split("/").filter(Boolean).pop();

  try {
    if (action === "start") return await handleStart(req);
    if (action === "callback") return await handleCallback(url);
    return jsonResponse({ error: "unknown action" }, { status: 404 });
  } catch (error) {
    console.error("google-auth error", error);
    return jsonResponse({ error: String(error) }, { status: 500 });
  }
});

async function handleStart(req: Request): Promise<Response> {
  const user = await getUserFromAuthHeader(req);
  if (!user) {
    return jsonResponse({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const state = crypto.randomUUID();
  const admin = getAdminClient();

  await admin.from("oauth_states").delete().lt(
    "created_at",
    new Date(Date.now() - OAUTH_STATE_TTL_MS).toISOString(),
  );

  const { error } = await admin
    .from("oauth_states")
    .insert({ state, user_id: user.id });
  if (error) throw error;

  return jsonResponse({ url: buildConsentUrl(state) }, { headers: corsHeaders });
}

async function handleCallback(url: URL): Promise<Response> {
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");

  const redirectTo = (status: "connected" | "error", detail?: string) => {
    const target = new URL(FRONTEND_URL);
    target.searchParams.set("drive", status);
    if (detail) target.searchParams.set("reason", detail);
    return new Response(null, {
      status: 302,
      headers: { Location: target.toString(), ...corsHeaders },
    });
  };

  if (errorParam) return redirectTo("error", errorParam);
  if (!code || !state) return redirectTo("error", "missing_code_or_state");

  const admin = getAdminClient();
  const { data: stateRow, error: stateError } = await admin
    .from("oauth_states")
    .select("user_id, created_at")
    .eq("state", state)
    .maybeSingle();

  if (stateError || !stateRow) return redirectTo("error", "invalid_state");

  const isExpired =
    Date.now() - new Date(stateRow.created_at).getTime() > OAUTH_STATE_TTL_MS;
  await admin.from("oauth_states").delete().eq("state", state);
  if (isExpired) return redirectTo("error", "expired_state");

  const tokens = await exchangeCodeForTokens(code);
  if (!tokens.refresh_token) {
    // access_type=offline + prompt=consent를 안 붙이면 재연결 시 refresh_token이 안 옴
    return redirectTo("error", "no_refresh_token");
  }

  const { ciphertext, iv } = await encryptSecret(tokens.refresh_token);
  let accountEmail: string | null = null;
  let accountName: string | null = null;
  let accountPhotoUrl: string | null = null;

  try {
    const profile = await getDriveAccountProfile(tokens.access_token);
    accountEmail = profile.email;
    accountName = profile.name;
    accountPhotoUrl = profile.photoUrl;
  } catch (error) {
    console.error("google-auth profile lookup error", error);
  }

  const { error: upsertError } = await admin.from("drive_connections").upsert({
    user_id: stateRow.user_id,
    refresh_token_encrypted: ciphertext,
    refresh_token_iv: iv,
    account_email: accountEmail,
    account_name: accountName,
    account_photo_url: accountPhotoUrl,
  });
  if (upsertError) return redirectTo("error", "db_upsert_failed");

  return redirectTo("connected");
}

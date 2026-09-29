// callback only relays the authorization response. Only authenticated /complete
// may exchange the code, after checking the initiating browser's secret.
import { buildConsentUrl, exchangeCodeForTokens, getDriveAccountProfile } from "../_shared/google.ts";
import { encryptSecret } from "../_shared/crypto.ts";
import { getAdminClient, getUserFromAuthHeader } from "../_shared/supabaseAdmin.ts";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { readSmallJson, RequestError } from "../_shared/requestLimits.ts";
import { codeChallenge, validVerifier } from "../_shared/oauthProof.ts";

export async function handleGoogleAuth(req: Request): Promise<Response> {
  const options = handleOptions(req);
  if (options) return options;
  const url = new URL(req.url);
  const action = url.pathname.split("/").filter(Boolean).pop();
  try {
    if (action === "callback" && req.method === "GET") {
      const target = new URL(Deno.env.get("FRONTEND_URL")!);
      if (target.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(target.hostname)) {
        throw new Error("Invalid frontend URL");
      }
      // FRONTEND_URL is the app root, with an optional deployment basePath.
      target.pathname = target.pathname.replace(/\/$/, "").replace(/\/notes$/, "") + "/notes";
      target.search = "";
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      target.hash = new URLSearchParams(code && state && code.length < 4096 && state.length < 100
        ? { drive_code: code, drive_state: state }
        : { drive_error: "authorization_failed" }).toString();
      return new Response(null, { status: 302, headers: {
        Location: target.toString(), "Cache-Control": "no-store", "Referrer-Policy": "no-referrer",
      } });
    }
    if (req.method !== "POST") return jsonResponse({ error: "method not allowed" }, { status: 405 });
    const user = await getUserFromAuthHeader(req);
    if (!user) return jsonResponse({ error: "인증이 필요합니다." }, { status: 401 });
    const body = await readSmallJson(req);
    const admin = getAdminClient();
    if (action === "start") {
      const challenge = body.codeChallenge;
      if (typeof challenge !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(challenge)) {
        throw new RequestError("브라우저 검증값이 필요합니다.");
      }
      // At most one outstanding connection attempt per user.
      const { error: cleanupError } = await admin.from("oauth_states").delete().eq("user_id", user.id);
      if (cleanupError) throw cleanupError;
      const state = crypto.randomUUID();
      const { error } = await admin.from("oauth_states").insert({ state, user_id: user.id, code_challenge: challenge });
      if (error) throw error;
      return jsonResponse({ url: buildConsentUrl(state, challenge), state });
    }
    if (action !== "complete") return jsonResponse({ error: "unknown action" }, { status: 404 });
    const { code, state, verifier } = body;
    if (typeof code !== "string" || !code || code.length > 4096 ||
        typeof state !== "string" || !/^[0-9a-f-]{36}$/.test(state) || !validVerifier(verifier)) {
      throw new RequestError("유효한 연결 요청이 아닙니다.");
    }
    const challenge = await codeChallenge(verifier as string);
    // DELETE ... RETURNING is atomic: wrong users/proofs do not consume a state;
    // concurrent completions cannot both exchange codes.
    const { data: pending, error } = await admin.from("oauth_states").delete()
      .eq("state", state).eq("user_id", user.id).eq("code_challenge", challenge)
      .gte("created_at", new Date(Date.now() - 600_000).toISOString())
      .select("user_id").maybeSingle();
    if (error) throw error;
    if (!pending) throw new RequestError("연결 요청이 만료되었거나 시작한 계정/브라우저와 다릅니다.", 403);
    const tokens = await exchangeCodeForTokens(code, verifier as string);
    if (!tokens.refresh_token) throw new RequestError("Google Drive 연결 동의를 다시 진행해주세요.");
    const encrypted = await encryptSecret(tokens.refresh_token);
    const profile = await getDriveAccountProfile(tokens.access_token);
    const { error: saveError } = await admin.from("drive_connections").upsert({
      user_id: user.id, refresh_token_encrypted: encrypted.ciphertext, refresh_token_iv: encrypted.iv,
      account_email: profile.email, account_name: profile.name, account_photo_url: profile.photoUrl,
      // A reconnected Google account must never inherit another account's folders/cursors.
      folder_id: null, folder_ids: [], folder_names: [], page_token: null,
      channel_id: null, resource_id: null, channel_expiration: null,
      connection_status: "active", last_error_code: null, last_error_at: null,
    });
    if (saveError) throw saveError;
    return jsonResponse({ connected: true });
  } catch (error) {
    // Never return OAuth token responses or internal database errors to clients.
    const status = error instanceof RequestError ? error.status : 500;
    console.error("google-auth failed", { action, status });
    return jsonResponse({ error: error instanceof RequestError ? error.message : "Google 연결을 완료하지 못했습니다." }, { status });
  }
}

if (import.meta.main) Deno.serve(handleGoogleAuth);

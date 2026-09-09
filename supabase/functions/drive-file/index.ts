// POST /drive-file
// Authenticated user's Google Drive PDF를 브라우저 미리보기용으로 스트리밍한다.

import { corsHeaders, handleOptions, jsonResponse } from "../_shared/cors.ts";
import { decryptSecret } from "../_shared/crypto.ts";
import { driveFetch, refreshAccessToken } from "../_shared/google.ts";
import { getAdminClient, getUserFromAuthHeader } from "../_shared/supabaseAdmin.ts";

Deno.serve(async (req) => {
  const optionsResponse = handleOptions(req);
  if (optionsResponse) return optionsResponse;

  const user = await getUserFromAuthHeader(req);
  if (!user) return jsonResponse({ error: "인증이 필요합니다." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const fileId = typeof body?.fileId === "string" ? body.fileId.trim() : "";
  if (!fileId) return jsonResponse({ error: "Drive 파일 ID가 필요합니다." }, { status: 400 });

  const admin = getAdminClient();
  const { data: connection, error: connectionError } = await admin
    .from("drive_connections")
    .select("refresh_token_encrypted, refresh_token_iv")
    .eq("user_id", user.id)
    .maybeSingle();

  if (connectionError) throw connectionError;
  if (!connection) {
    return jsonResponse({ error: "Google Drive가 연결되어 있지 않습니다." }, { status: 404 });
  }

  const refreshToken = await decryptSecret(
    connection.refresh_token_encrypted,
    connection.refresh_token_iv,
  );
  const { access_token } = await refreshAccessToken(refreshToken);
  const driveResponse = await driveFetch(
    access_token,
    `/files/${encodeURIComponent(fileId)}?alt=media`,
  );

  return new Response(driveResponse.body, {
    headers: {
      ...corsHeaders,
      "Content-Type": driveResponse.headers.get("content-type") ?? "application/pdf",
      "Cache-Control": "private, no-store",
      "Content-Disposition": "inline",
    },
  });
});

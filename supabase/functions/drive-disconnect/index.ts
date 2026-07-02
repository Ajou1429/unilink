// POST /drive-disconnect
// 인증된 사용자 본인의 Drive 연결을 해제한다: push channel stop + Google token revoke
// + drive_connections row 삭제. 노트 자체는 삭제하지 않는다 (이미 만들어진 노트는 유지).

import { corsHeaders, handleOptions, jsonResponse } from "../_shared/cors.ts";
import { getAdminClient, getUserFromAuthHeader } from "../_shared/supabaseAdmin.ts";
import { decryptSecret } from "../_shared/crypto.ts";
import { refreshAccessToken, revokeToken, stopChannel } from "../_shared/google.ts";

Deno.serve(async (req) => {
  const optionsResponse = handleOptions(req);
  if (optionsResponse) return optionsResponse;

  const user = await getUserFromAuthHeader(req);
  if (!user) return jsonResponse({ error: "인증이 필요합니다." }, { status: 401 });

  const admin = getAdminClient();
  const { data: connection } = await admin
    .from("drive_connections")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (connection) {
    try {
      const refreshToken = await decryptSecret(
        connection.refresh_token_encrypted,
        connection.refresh_token_iv,
      );
      const { access_token } = await refreshAccessToken(refreshToken);
      if (connection.channel_id && connection.resource_id) {
        await stopChannel(access_token, connection.channel_id, connection.resource_id);
      }
      await revokeToken(refreshToken);
    } catch (err) {
      console.error("drive-disconnect revoke error", err);
      // revoke가 실패해도 로컬 연결 정보는 삭제한다.
    }
  }

  await admin.from("drive_connections").delete().eq("user_id", user.id);

  return jsonResponse({ ok: true }, { headers: corsHeaders });
});

// POST /drive-watch
// 인증된 사용자 본인의 Drive 연결에 대해 changes.watch push channel을 (재)등록한다.
// channel은 최대 7일 유효 — drive-renew-channels가 만료 전에 이 로직을 재사용해 갱신한다.

import { corsHeaders, handleOptions, jsonResponse } from "../_shared/cors.ts";
import { getAdminClient, getUserFromAuthHeader } from "../_shared/supabaseAdmin.ts";
import { registerWatchForConnection } from "../_shared/driveWatch.ts";

Deno.serve(async (req) => {
  const optionsResponse = handleOptions(req);
  if (optionsResponse) return optionsResponse;

  const user = await getUserFromAuthHeader(req);
  if (!user) return jsonResponse({ error: "인증이 필요합니다." }, { status: 401 });

  const admin = getAdminClient();
  const { data: connection, error } = await admin
    .from("drive_connections")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !connection) {
    return jsonResponse(
      { error: "Google Drive가 연결되어 있지 않습니다." },
      { status: 400 },
    );
  }

  try {
    const result = await registerWatchForConnection(admin, connection);
    return jsonResponse(result, { headers: corsHeaders });
  } catch (err) {
    console.error("drive-watch error", err);
    return jsonResponse({ error: String(err) }, { status: 500 });
  }
});

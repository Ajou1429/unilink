// POST /drive-renew-channels
// pg_cron -> pg_net이 매일 호출한다 (supabase/migrations/0002_drive_renew_cron.sql).
// 만료 24시간 이내인 모든 drive_connections의 push channel을 재등록한다.
// 개별 사용자 갱신이 실패해도 나머지는 계속 처리한다.

import { jsonResponse } from "../_shared/cors.ts";
import { getAdminClient } from "../_shared/supabaseAdmin.ts";
import { registerWatchForConnection } from "../_shared/driveWatch.ts";

Deno.serve(async (req) => {
  const cronSecret = req.headers.get("X-Cron-Secret");
  const expected = Deno.env.get("CRON_SECRET");
  if (!expected || cronSecret !== expected) {
    return jsonResponse({ error: "unauthorized" }, { status: 401 });
  }

  const admin = getAdminClient();
  const threshold = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const { data: connections, error } = await admin
    .from("drive_connections")
    .select("*")
    .not("channel_id", "is", null)
    .or(`channel_expiration.lt.${threshold},channel_expiration.is.null`);

  if (error) {
    return jsonResponse({ error: error.message }, { status: 500 });
  }

  const results = await Promise.allSettled(
    (connections ?? []).map((connection) =>
      registerWatchForConnection(admin, connection),
    ),
  );

  const renewed = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.length - renewed;

  return jsonResponse({ total: results.length, renewed, failed });
});

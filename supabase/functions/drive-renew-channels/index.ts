// POST /drive-renew-channels
// pg_cron -> pg_net이 매일 호출한다 (supabase/migrations/0002_drive_renew_cron.sql).
// 만료 24시간 이내인 모든 drive_connections의 push channel을 재등록한다.
// 개별 사용자 갱신이 실패해도 나머지는 계속 처리한다.

import { jsonResponse } from "../_shared/cors.ts";
import { getAdminClient } from "../_shared/supabaseAdmin.ts";
import {
  DriveWatchRenewalError,
  registerWatchForConnection,
} from "../_shared/driveWatch.ts";

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

  const results = await Promise.all(
    (connections ?? []).map(async (connection) => {
      try {
        await registerWatchForConnection(admin, connection);
        return { ok: true as const };
      } catch (error) {
        const stage = error instanceof DriveWatchRenewalError
          ? error.stage
          : "unknown";
        const code = error instanceof DriveWatchRenewalError
          ? error.code
          : null;
        const message = error instanceof Error
          ? error.message.slice(0, 300)
          : String(error).slice(0, 300);
        const userRef = connection.user_id.slice(-8);
        if (code === "invalid_grant") {
          const { error: statusError } = await admin
            .from("drive_connections")
            .update({
              connection_status: "reconnect_required",
              last_error_code: code,
              last_error_at: new Date().toISOString(),
              channel_id: null,
              resource_id: null,
              channel_expiration: null,
            })
            .eq("user_id", connection.user_id);
          if (statusError) {
            console.error("failed to save Drive connection health", {
              userRef,
              message: statusError.message,
            });
          }
        }
        console.error("drive channel renewal failed", { userRef, stage, code, message });
        return { ok: false as const, userRef, stage, code, message };
      }
    }),
  );

  const renewed = results.filter((result) => result.ok).length;
  const failures = results.filter((result) => !result.ok);

  return jsonResponse({
    total: results.length,
    renewed,
    failed: failures.length,
    failures,
  });
});

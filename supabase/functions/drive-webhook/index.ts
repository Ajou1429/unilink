// POST /drive-webhook
// Google Drive push notification 수신. verify_jwt = false (Google은 Supabase JWT를
// 보내지 않는다) — 대신 X-Goog-Channel-Token 헤더로 스푸핑을 막는다.
// 무거운 처리 전에 최대한 빨리 200을 반환해야 하므로 changes.list 결과가 많아도
// 이 함수 안에서 순차 처리 후 곧바로 응답한다 (규모가 커지면 큐로 분리 필요).

import { jsonResponse } from "../_shared/cors.ts";
import { getAdminClient } from "../_shared/supabaseAdmin.ts";
import { decryptSecret } from "../_shared/crypto.ts";
import {
  buildMetadataSummary,
  listChanges,
  listDriveFolderIdsInTree,
  refreshAccessToken,
} from "../_shared/google.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "method not allowed" }, { status: 405 });
  }

  const token = req.headers.get("X-Goog-Channel-Token");
  const expectedToken = Deno.env.get("GOOGLE_DRIVE_WEBHOOK_TOKEN");
  if (!expectedToken || token !== expectedToken) {
    return jsonResponse({ error: "invalid channel token" }, { status: 403 });
  }

  const channelId = req.headers.get("X-Goog-Channel-ID");
  const resourceState = req.headers.get("X-Goog-Resource-State");
  if (!channelId) {
    return jsonResponse({ error: "missing channel id" }, { status: 400 });
  }

  // Drive가 채널 등록 확인을 위해 보내는 최초 sync 알림은 처리할 변경분이 없다.
  if (resourceState === "sync") {
    return jsonResponse({ ok: true });
  }

  const admin = getAdminClient();
  const { data: connection, error } = await admin
    .from("drive_connections")
    .select("*")
    .eq("channel_id", channelId)
    .maybeSingle();

  if (error || !connection) {
    // 이미 해지되었거나 갱신되어 사라진 채널 — 조용히 200 처리 (Google 재시도 방지)
    return jsonResponse({ ok: true, note: "unknown channel" });
  }

  try {
    await processChanges(admin, connection);
  } catch (err) {
    console.error("drive-webhook processing error", err);
    // 그래도 200을 반환한다 — Google은 실패 시 짧은 간격으로 재시도해 폭주를 유발한다.
    // 실제 실패는 로그로 확인하고, 안전망인 수동 "Drive 변경 반영"(drive-sync)으로 복구한다.
  }

  return jsonResponse({ ok: true });
});

async function processChanges(
  admin: ReturnType<typeof getAdminClient>,
  connection: {
    user_id: string;
    refresh_token_encrypted: string;
    refresh_token_iv: string;
    folder_id: string | null;
    page_token: string | null;
  },
) {
  if (!connection.folder_id || !connection.page_token) return;

  const refreshToken = await decryptSecret(
    connection.refresh_token_encrypted,
    connection.refresh_token_iv,
  );
  const { access_token } = await refreshAccessToken(refreshToken);

  const { files, newStartPageToken } = await listChanges(
    access_token,
    connection.page_token,
  );

  const folderIds = await listDriveFolderIdsInTree(access_token, connection.folder_id);
  const pdfFiles = files.filter(
    (file) =>
      !file.trashed &&
      file.mimeType === "application/pdf" &&
      file.parents?.some((parentId) => folderIds.has(parentId)),
  );

  const { data: existingNotes } = await admin
    .from("notes")
    .select("drive_file_id, version")
    .eq("user_id", connection.user_id)
    .not("drive_file_id", "is", null);
  const existingById = new Map(
    (existingNotes ?? []).map((n) => [n.drive_file_id as string, n.version as number]),
  );

  for (const file of pdfFiles) {
    const existingVersion = existingById.get(file.id);
    const isNew = existingVersion === undefined;
    const contentSummary = buildMetadataSummary(file, isNew);

    if (isNew) {
      await admin.from("notes").insert({
        user_id: connection.user_id,
        title: file.name.replace(/\.[^.]+$/, ""),
        course_name: "미분류",
        linked_type: "unassigned",
        source: "GoodNotes",
        sync_status: "synced",
        content: contentSummary,
        file_name: file.name,
        file_size: file.size ? Number(file.size) : null,
        drive_file_id: file.id,
        drive_modified_time: file.modifiedTime,
        version: 1,
        tags: ["GoodNotes"],
      });
    } else {
      await admin
        .from("notes")
        .update({
          title: file.name.replace(/\.[^.]+$/, ""),
          source: "GoodNotes",
          sync_status: "synced",
          content: contentSummary,
          file_name: file.name,
          file_size: file.size ? Number(file.size) : null,
          drive_modified_time: file.modifiedTime,
          version: existingVersion + 1,
        })
        .eq("user_id", connection.user_id)
        .eq("drive_file_id", file.id);
    }
  }

  await admin
    .from("drive_connections")
    .update({ page_token: newStartPageToken })
    .eq("user_id", connection.user_id);
}

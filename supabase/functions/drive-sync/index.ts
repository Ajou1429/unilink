// POST /drive-sync
// body: { folderId?: string }
// 인증된 사용자 본인의 Drive 연결을 사용해 지정 폴더의 PDF를 수동으로 pull한다.
// (roadmap Phase 4 — webhook 전에 검증하기 쉬운 폴백 경로)

import { corsHeaders, handleOptions, jsonResponse } from "../_shared/cors.ts";
import { getAdminClient, getUserFromAuthHeader } from "../_shared/supabaseAdmin.ts";
import { decryptSecret } from "../_shared/crypto.ts";
import {
  buildMetadataSummary,
  listPdfFilesInFolder,
  refreshAccessToken,
} from "../_shared/google.ts";

function extractFolderId(input: string): string {
  const match = input.match(/[-\w]{25,}/);
  return match ? match[0] : input.trim();
}

Deno.serve(async (req) => {
  const optionsResponse = handleOptions(req);
  if (optionsResponse) return optionsResponse;

  const user = await getUserFromAuthHeader(req);
  if (!user) return jsonResponse({ error: "인증이 필요합니다." }, { status: 401 });

  const admin = getAdminClient();
  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const requestedFolderId: string | undefined = body?.folderId;

  const { data: connection, error: connError } = await admin
    .from("drive_connections")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (connError || !connection) {
    return jsonResponse(
      { error: "Google Drive가 연결되어 있지 않습니다." },
      { status: 400 },
    );
  }

  let folderId = connection.folder_id as string | null;
  if (requestedFolderId) {
    folderId = extractFolderId(requestedFolderId);
    await admin
      .from("drive_connections")
      .update({ folder_id: folderId })
      .eq("user_id", user.id);
  }

  if (!folderId) {
    return jsonResponse(
      { error: "GoodNotes 백업 폴더를 먼저 지정해주세요." },
      { status: 400 },
    );
  }

  const refreshToken = await decryptSecret(
    connection.refresh_token_encrypted,
    connection.refresh_token_iv,
  );
  const { access_token } = await refreshAccessToken(refreshToken);

  const files = await listPdfFilesInFolder(access_token, folderId);

  const { data: existingNotes } = await admin
    .from("notes")
    .select("drive_file_id")
    .eq("user_id", user.id)
    .not("drive_file_id", "is", null);
  const existingIds = new Set(
    (existingNotes ?? []).map((n) => n.drive_file_id as string),
  );

  const now = new Date().toISOString();
  let upserted = 0;

  for (const file of files) {
    const isNew = !existingIds.has(file.id);
    const contentSummary = buildMetadataSummary(file, isNew);

    if (isNew) {
      const { error } = await admin.from("notes").insert({
        user_id: user.id,
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
      if (!error) upserted += 1;
    } else {
      const { data: existing } = await admin
        .from("notes")
        .select("version")
        .eq("user_id", user.id)
        .eq("drive_file_id", file.id)
        .maybeSingle();

      const { error } = await admin
        .from("notes")
        .update({
          title: file.name.replace(/\.[^.]+$/, ""),
          source: "GoodNotes",
          sync_status: "synced",
          content: contentSummary,
          file_name: file.name,
          file_size: file.size ? Number(file.size) : null,
          drive_modified_time: file.modifiedTime,
          version: (existing?.version ?? 1) + 1,
          updated_at: now,
        })
        .eq("user_id", user.id)
        .eq("drive_file_id", file.id);
      if (!error) upserted += 1;
    }
  }

  return jsonResponse(
    { syncedAt: now, filesFound: files.length, upserted },
    { headers: corsHeaders },
  );
});

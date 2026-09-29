import { parseFolderIds } from "../_shared/driveInputs.ts";
import { readSmallJson, RequestError } from "../_shared/requestLimits.ts";
// POST /drive-sync
// body: { folderId?: string, folderIds?: string[], folderNames?: string[] }
// 인증된 사용자 본인의 Drive 연결을 사용해 지정 폴더의 PDF를 수동으로 pull한다.
// (roadmap Phase 4 — webhook 전에 검증하기 쉬운 폴백 경로)

import { corsHeaders, handleOptions, jsonResponse } from "../_shared/cors.ts";
import { getAdminClient, getUserFromAuthHeader } from "../_shared/supabaseAdmin.ts";
import { decryptSecret } from "../_shared/crypto.ts";
import {
  listPdfFilesInFolderTree,
  refreshAccessToken,
} from "../_shared/google.ts";
import { saveDriveNote } from "../_shared/driveNotes.ts";

Deno.serve(async (req) => {
  const optionsResponse = handleOptions(req);
  if (optionsResponse) return optionsResponse;

  if (req.method !== "POST") return jsonResponse({ error: "method not allowed" }, { status: 405 });
  try {
  const user = await getUserFromAuthHeader(req);
  if (!user) return jsonResponse({ error: "인증이 필요합니다." }, { status: 401 });

  const admin = getAdminClient();
  const body = await readSmallJson(req);
  const requestedFolderIds = parseFolderIds(
    Array.isArray(body?.folderIds) ? body.folderIds : body?.folderId ? [body.folderId] : [],
  );
  const requestedFolderNames = Array.isArray(body?.folderNames)
    ? body.folderNames.filter((value: unknown): value is string => typeof value === "string")
    : [];

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

  let folderIds = parseFolderIds(
    Array.isArray(connection.folder_ids) && connection.folder_ids.length > 0
      ? connection.folder_ids
      : connection.folder_id
        ? [connection.folder_id]
        : [],
  );
  let folderNames = Array.isArray(connection.folder_names) ? connection.folder_names : [];
  if (requestedFolderIds.length > 0) {
    folderIds = requestedFolderIds;
    folderNames = requestedFolderNames;
    const { error: folderError } = await admin
      .from("drive_connections")
      .update({
        folder_id: folderIds[0] ?? null,
        folder_ids: folderIds,
        folder_names: folderNames,
      })
      .eq("user_id", user.id);
    if (folderError) throw new Error("Cannot save selected Drive folders");
  }

  if (folderIds.length === 0) {
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

  const filesById = new Map<string, Awaited<ReturnType<typeof listPdfFilesInFolderTree>>[number]>();
  for (const folderId of folderIds) {
    const folderFiles = await listPdfFilesInFolderTree(access_token, folderId);
    for (const file of folderFiles) filesById.set(file.id, file);
  }
  const files = [...filesById.values()].sort((a, b) =>
    (b.modifiedTime ?? "").localeCompare(a.modifiedTime ?? ""),
  );

  const now = new Date().toISOString();
  let upserted = 0;

  for (const file of files) {
    if (await saveDriveNote(admin, user.id, file)) upserted += 1;
  }

  return jsonResponse(
    { syncedAt: now, filesFound: files.length, upserted },
    { headers: corsHeaders },
  );
  } catch (error) {
    const status = error instanceof RequestError ? error.status : 502;
    console.error("drive-sync failed", { status });
    return jsonResponse({ error: error instanceof RequestError ? error.message : "Drive 요청을 처리하지 못했습니다." }, { status });
  }
});

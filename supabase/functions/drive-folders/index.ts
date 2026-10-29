import { validateDriveId } from "../_shared/driveInputs.ts";
import { readSmallJson, RequestError } from "../_shared/requestLimits.ts";
// POST /drive-folders
// Lists Google Drive folders for the authenticated user's connected account.

import { corsHeaders, handleOptions, jsonResponse } from "../_shared/cors.ts";
import { decryptSecret } from "../_shared/crypto.ts";
import { GoogleTokenError, listDriveFolders, listPdfFilesInFolder, refreshAccessToken, searchDriveContents } from "../_shared/google.ts";
import { getAdminClient, getUserFromAuthHeader } from "../_shared/supabaseAdmin.ts";

Deno.serve(async (req) => {
  const optionsResponse = handleOptions(req);
  if (optionsResponse) return optionsResponse;

  if (req.method !== "POST") return jsonResponse({ error: "method not allowed" }, { status: 405 });
  let stage = "authenticate";
  const requestId = crypto.randomUUID();
  try {
  const user = await getUserFromAuthHeader(req);
  if (!user) return jsonResponse({ error: "인증이 필요합니다." }, { status: 401 });

  stage = "read_request";
  const body = await readSmallJson(req);
  const parentId = body.parentId == null ? null : validateDriveId(body.parentId);
  const includePdfs = body.includePdfs === true;
  if (body.search !== undefined && (typeof body.search !== "string" || body.search.length > 100)) throw new RequestError("검색어는 100자 이하로 입력해 주세요.");
  const admin = getAdminClient();

  stage = "read_connection";
  const { data: connection, error } = await admin
    .from("drive_connections")
    .select("refresh_token_encrypted, refresh_token_iv")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) throw error;
  if (!connection) {
    return jsonResponse(
      { error: "Google Drive가 연결되어 있지 않습니다." },
      { status: 404 },
    );
  }

  stage = "decrypt_token";
  const refreshToken = await decryptSecret(
    connection.refresh_token_encrypted,
    connection.refresh_token_iv,
  );
  stage = "refresh_token";
  const { access_token } = await refreshAccessToken(refreshToken);
  stage = "list_folders";
  if (typeof body.search === "string" && body.search.trim()) return jsonResponse(await searchDriveContents(access_token, body.search.trim()));
  const [folders, pdfs] = await Promise.all([
    listDriveFolders(access_token, parentId),
    includePdfs ? listPdfFilesInFolder(access_token, parentId ?? "root") : Promise.resolve([]),
  ]);

  return jsonResponse({
    folders,
    pdfs: pdfs.map(({ id, name, modifiedTime, size }) => ({ id, name, modifiedTime, size })),
  }, { headers: corsHeaders });
  } catch (error) {
    const expired = error instanceof GoogleTokenError && error.code === "invalid_grant";
    const status = error instanceof RequestError ? error.status : expired ? 409 : 502;
    // Never log raw Google responses, request URLs, database details or credentials.
    const rawMessage = error instanceof Error ? error.message : "";
    const safeReasons = ["invalid_grant", "invalid_client", "accessNotConfigured", "SERVICE_DISABLED", "insufficientPermissions", "rateLimitExceeded"];
    const reason = safeReasons.find((code) => rawMessage.includes(code)) ??
      (error instanceof GoogleTokenError ? error.code : "unknown");
    const dbCode = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
    const safeDbCode = /^(?:[0-9A-Z]{5}|PGRST[0-9]{3})$/.test(dbCode) ? dbCode : undefined;
    const upstreamStatus = rawMessage.match(/(?:Drive API 오류 .*?:|갱신 실패:)\s*(\d{3})/)?.[1];
    console.error("drive-folders failed", { status, stage, reason, dbCode: safeDbCode, upstreamStatus, requestId });
    const messages: Record<string, string> = {
      authenticate: "로그인 인증을 확인하지 못했습니다.",
      read_connection: "Drive 연결 정보를 불러오지 못했습니다.",
      decrypt_token: "저장된 Drive 인증을 읽지 못했습니다. 연결 설정을 확인하거나 Drive를 다시 연결해 주세요.",
      refresh_token: "Google 인증을 갱신하지 못했습니다. Drive 연결을 다시 시도해 주세요.",
      list_folders: "Google Drive 폴더 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
    };
    const message = error instanceof RequestError ? error.message : expired ? error.message : messages[stage] ?? "Drive 요청을 처리하지 못했습니다.";
    return jsonResponse({ error: `${message} [${stage}]`, request_id: requestId, code: expired ? "reconnect_required" : reason }, { status });
  }
});

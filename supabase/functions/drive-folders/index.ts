import { validateDriveId } from "../_shared/driveInputs.ts";
import { readSmallJson, RequestError } from "../_shared/requestLimits.ts";
// POST /drive-folders
// Lists Google Drive folders for the authenticated user's connected account.

import { corsHeaders, handleOptions, jsonResponse } from "../_shared/cors.ts";
import { decryptSecret } from "../_shared/crypto.ts";
import { listDriveFolders, listPdfFilesInFolder, refreshAccessToken } from "../_shared/google.ts";
import { getAdminClient, getUserFromAuthHeader } from "../_shared/supabaseAdmin.ts";

Deno.serve(async (req) => {
  const optionsResponse = handleOptions(req);
  if (optionsResponse) return optionsResponse;

  if (req.method !== "POST") return jsonResponse({ error: "method not allowed" }, { status: 405 });
  try {
  const user = await getUserFromAuthHeader(req);
  if (!user) return jsonResponse({ error: "인증이 필요합니다." }, { status: 401 });

  const body = await readSmallJson(req);
  const parentId = body.parentId == null ? null : validateDriveId(body.parentId);
  const includePdfs = body.includePdfs === true;
  const admin = getAdminClient();

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

  const refreshToken = await decryptSecret(
    connection.refresh_token_encrypted,
    connection.refresh_token_iv,
  );
  const { access_token } = await refreshAccessToken(refreshToken);
  const [folders, pdfs] = await Promise.all([
    listDriveFolders(access_token, parentId),
    includePdfs ? listPdfFilesInFolder(access_token, parentId ?? "root") : Promise.resolve([]),
  ]);

  return jsonResponse({
    folders,
    pdfs: pdfs.map(({ id, name, modifiedTime, size }) => ({ id, name, modifiedTime, size })),
  }, { headers: corsHeaders });
  } catch (error) {
    const status = error instanceof RequestError ? error.status : 502;
    console.error("drive-folders failed", { status });
    return jsonResponse({ error: error instanceof RequestError ? error.message : "Drive 요청을 처리하지 못했습니다." }, { status });
  }
});

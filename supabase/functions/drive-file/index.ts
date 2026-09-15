// Only authenticated, bounded PDF content may be returned as a preview.
import { corsHeaders, handleOptions, jsonResponse } from "../_shared/cors.ts";
import { decryptSecret } from "../_shared/crypto.ts";
import { driveFetch, refreshAccessToken } from "../_shared/google.ts";
import { getAdminClient, getUserFromAuthHeader } from "../_shared/supabaseAdmin.ts";
import { readLimitedBody, readSmallJson, RequestError } from "../_shared/requestLimits.ts";
import { MAX_PDF_BYTES, validatePdf } from "../_shared/pdfLimits.ts";

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== "POST") return jsonResponse({ error: "method not allowed" }, { status: 405 });
  try {
    const user = await getUserFromAuthHeader(req);
    if (!user) return jsonResponse({ error: "인증이 필요합니다." }, { status: 401 });
    const { fileId } = await readSmallJson(req);
    if (typeof fileId !== "string" || !/^[A-Za-z0-9_-]{1,256}$/.test(fileId)) throw new RequestError("유효한 Drive 파일 ID가 필요합니다.");
    const { data: connection, error } = await getAdminClient().from("drive_connections")
      .select("refresh_token_encrypted, refresh_token_iv").eq("user_id", user.id).maybeSingle();
    if (error) throw error;
    if (!connection) throw new RequestError("Google Drive가 연결되어 있지 않습니다.", 404);
    const refreshToken = await decryptSecret(connection.refresh_token_encrypted, connection.refresh_token_iv);
    const { access_token } = await refreshAccessToken(refreshToken);
    const signal = AbortSignal.timeout(30_000);
    const metadata = await (await driveFetch(access_token, `/files/${encodeURIComponent(fileId)}?fields=mimeType,size`, { signal })).json();
    if (metadata.mimeType !== "application/pdf") throw new RequestError("PDF 파일만 미리볼 수 있습니다.", 415);
    if (!Number.isFinite(Number(metadata.size)) || Number(metadata.size) > MAX_PDF_BYTES) throw new RequestError("PDF는 20MB 이하만 미리볼 수 있습니다.", 413);
    const response = await driveFetch(access_token, `/files/${encodeURIComponent(fileId)}?alt=media`, { signal });
    const bytes = await readLimitedBody(response, MAX_PDF_BYTES, signal);
    validatePdf(bytes, metadata.mimeType);
    return new Response(bytes, { headers: {
      ...corsHeaders, "Content-Type": "application/pdf", "Cache-Control": "private, no-store",
      "Content-Disposition": "inline", "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox",
    } });
  } catch (error) {
    const status = error instanceof RequestError ? error.status : 502;
    console.error("drive-file failed", { status });
    return jsonResponse({ error: error instanceof RequestError ? error.message : "PDF를 불러오지 못했습니다." }, { status });
  }
});

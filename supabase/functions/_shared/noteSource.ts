import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.116.0";
import { MAX_PDF_BYTES, validatePdf } from "./pdfLimits.ts";
import { readLimitedBody, RequestError } from "./requestLimits.ts";
import { decryptSecret } from "./crypto.ts";
import { driveFetch, refreshAccessToken } from "./google.ts";
import { sameSourceTimestamp } from "./noteAnalysis.ts";
type Source = { file_path: string | null; drive_file_id: string | null; drive_modified_time: string | null };
export async function readNotePdf(db: SupabaseClient, userId: string, note: Source, signal: AbortSignal): Promise<Uint8Array> {
  let bytes: Uint8Array;
  if (note.drive_file_id) {
    const connection = await db.from("drive_connections").select("refresh_token_encrypted,refresh_token_iv").eq("user_id", userId).single();
    if (connection.error) throw new RequestError("Drive 연결을 확인해 주세요.");
    const token = await refreshAccessToken(await decryptSecret(connection.data.refresh_token_encrypted, connection.data.refresh_token_iv));
    const meta = await (await driveFetch(token.access_token, `/files/${encodeURIComponent(note.drive_file_id)}?fields=mimeType,size,modifiedTime`, { signal })).json();
    if (meta.mimeType !== "application/pdf" || Number(meta.size) > MAX_PDF_BYTES) throw new RequestError("20MB 이하 PDF만 분석할 수 있습니다.");
    if (!sameSourceTimestamp(meta.modifiedTime, note.drive_modified_time)) throw new RequestError("Drive 자료가 변경되었습니다. Drive 변경 반영 후 다시 분석해 주세요.");
    bytes = await readLimitedBody(await driveFetch(token.access_token, `/files/${encodeURIComponent(note.drive_file_id)}?alt=media`, { signal }), MAX_PDF_BYTES, signal);
  } else if (note.file_path) {
    if (!note.file_path.startsWith(`${userId}/`)) throw new RequestError("자료 접근 권한을 확인해 주세요.");
    const file = await db.storage.from("note-files").download(note.file_path);
    if (file.error || !file.data || file.data.size > MAX_PDF_BYTES) throw new RequestError("PDF를 불러오지 못했습니다.");
    bytes = new Uint8Array(await file.data.arrayBuffer());
  } else throw new RequestError("PDF 파일을 첨부해 주세요.");
  validatePdf(bytes, "application/pdf");
  return bytes;
}
export function pdfBase64(bytes: Uint8Array) {
  let result = "";
  for (let i = 0; i < bytes.length; i += 8192) result += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(result);
}

import { getAdminClient, getUserFromAuthHeader } from "../_shared/supabaseAdmin.ts";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { readSmallJson, RequestError } from "../_shared/requestLimits.ts";
import { decryptSecret } from "../_shared/crypto.ts";
import { GoogleTokenError, refreshAccessToken } from "../_shared/google.ts";

const API = "https://www.googleapis.com/drive/v3";
const MAX = 20 * 1024 * 1024;
const escape = (s: string) => s.replaceAll("\\", "\\\\").replaceAll("'", "\\'");
async function google(token: string, url: string, init: RequestInit = {}) {
  const response = await fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(60000) });
  if (response.status === 401 || response.status === 403) throw new RequestError("Drive 업로드 권한을 승인해야 합니다. Google Drive를 다시 연결해 주세요.", 409);
  if (!response.ok) throw new RequestError("Drive 업로드 요청에 실패했습니다. 잠시 후 다시 시도해 주세요.", 502);
  return response;
}
async function folder(token: string, key: string, name: string, parent = "root") {
  const q = `trashed=false and mimeType='application/vnd.google-apps.folder' and '${escape(parent)}' in parents and appProperties has { key='unilinkFolder' and value='${escape(key)}' }`;
  const params = new URLSearchParams({ q, fields: "files(id)", pageSize: "1" });
  const found = await (await google(token, `${API}/files?${params}`)).json();
  if (found.files?.[0]?.id) return found.files[0].id as string;
  const created = await (await google(token, `${API}/files?fields=id`, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [parent], appProperties: { unilinkFolder: key } }) })).json();
  return created.id as string;
}

/** 폴더 이름으로 쓸 학기·종류. 1~60자, 경로 구분자·제어문자 없음. 없거나 잘못되면 null */
export function folderLabel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const label = value.trim();
  return label && label.length <= 60 && !/[\/\u0000-\u001f]/.test(label) ? label : null;
}

export async function handleDriveUpload(req: Request): Promise<Response> {
  const options = handleOptions(req); if (options) return options;
  if (req.method !== "POST") return jsonResponse({ error: "method not allowed" }, { status: 405 });
  let jobId: string | null = null;
  const db = getAdminClient();
  try {
    const user = await getUserFromAuthHeader(req);
    if (!user) throw new RequestError("로그인이 필요합니다.", 401);
    const body = await readSmallJson(req);
    if (typeof body.noteId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.noteId)) throw new RequestError("노트를 선택해 주세요.");
    const result = await db.from("notes").select("*").eq("id", body.noteId).eq("user_id", user.id).single();
    if (result.error) throw new RequestError("노트를 찾을 수 없습니다.", 404);
    const note = result.data;
    if (note.drive_file_id) return jsonResponse({ uploaded: true, file_id: note.drive_file_id });
    if (!["course", "personal"].includes(note.linked_type) || !note.linked_id || !note.linked_title) throw new RequestError("먼저 노트를 내 수업 또는 개인 학습으로 분류해 주세요.");
    const connection = await db.from("drive_connections").select("refresh_token_encrypted,refresh_token_iv").eq("user_id", user.id).single();
    if (connection.error) throw new RequestError("Google Drive를 먼저 연결해 주세요.", 409);
    const reserved = await db.rpc("reserve_drive_upload", { p_note: note.id, p_user: user.id });
    if (reserved.error) throw new RequestError("진행 중인 업로드가 있거나 하루 한도(30개)에 도달했습니다.", 429);
    jobId = reserved.data;
    const token = (await refreshAccessToken(await decryptSecret(connection.data.refresh_token_encrypted, connection.data.refresh_token_iv))).access_token;
    let bytes: Uint8Array; let mime: string; let name: string;
    if (note.file_path) {
      if (!note.file_path.startsWith(`${user.id}/`)) throw new RequestError("파일 접근 권한을 확인해 주세요.", 403);
      const file = await db.storage.from("note-files").download(note.file_path);
      if (file.error || !file.data || file.data.size > MAX) throw new RequestError("20MB 이하 파일만 업로드할 수 있습니다.");
      mime = file.data.type || "application/octet-stream";
      bytes = new Uint8Array(await file.data.arrayBuffer());
      name = note.file_name || `${note.title}.bin`;
    } else {
      if (!note.content?.trim()) throw new RequestError("파일이나 노트 내용이 필요합니다.");
      bytes = new TextEncoder().encode(note.content); mime = "text/plain"; name = `${note.title}.txt`;
      if (bytes.length > MAX) throw new RequestError("노트 내용이 너무 큽니다.");
    }
    // 분류된 파일: UniLink / 학기 / 과목 / 종류. 학기·종류를 보내지 않은 기존 호출은 UniLink / 과목
    const term = folderLabel(body.term), kind = folderLabel(body.kind);
    const root = await folder(token, "root", "UniLink");
    const termFolder = term ? await folder(token, `term:${term}`, term, root) : root;
    const courseKey = term ? `${note.linked_type}:${note.linked_id}:${term}` : `${note.linked_type}:${note.linked_id}`;
    const courseFolder = await folder(token, courseKey, note.linked_title.slice(0, 150), termFolder);
    const target = kind ? await folder(token, `${courseKey}:${kind}`, kind, courseFolder) : courseFolder;
    const folderPath = ["UniLink", ...(term ? [term] : []), note.linked_title, ...(kind ? [kind] : [])];
    const folderPathIds = [root, ...(term ? [termFolder] : []), courseFolder, ...(kind ? [target] : [])];
    const job = await db.from("drive_upload_jobs").select("drive_file_id").eq("id", jobId).eq("user_id", user.id).single();
    if (job.error) throw new RequestError("업로드 상태를 확인하지 못했습니다.");
    let fileId = job.data.drive_file_id;
    if (!fileId) {
      fileId = (await (await google(token, `${API}/files/generateIds?count=1&space=drive&type=files`)).json()).ids[0];
      const saved = await db.from("drive_upload_jobs").update({ drive_file_id: fileId }).eq("id", jobId).eq("user_id", user.id);
      if (saved.error) throw new RequestError("업로드 식별자를 저장하지 못했습니다.");
    }
    const existing = await fetch(`${API}/files/${encodeURIComponent(fileId)}?fields=id,name,modifiedTime,size,parents`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) });
    let remote;
    if (existing.ok) remote = await existing.json();
    else {
      if (existing.status !== 404) throw new RequestError("Drive 파일 상태를 확인하지 못했습니다.", 502);
      const start = await google(token, "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,modifiedTime,size,parents", {
        method: "POST", headers: { "Content-Type": "application/json", "X-Upload-Content-Type": mime, "X-Upload-Content-Length": String(bytes.length) },
        body: JSON.stringify({ id: fileId, name, parents: [target], appProperties: { unilinkNote: note.id } }),
      });
      const uploadUrl = start.headers.get("location");
      if (!uploadUrl || new URL(uploadUrl).origin !== "https://www.googleapis.com") throw new RequestError("업로드 주소를 확인하지 못했습니다.");
      remote = await (await google(token, uploadUrl, { method: "PUT", headers: { "Content-Type": mime }, body: new Uint8Array(bytes).buffer })).json();
    }
    const saved = await db.from("notes").update({ drive_file_id: fileId, drive_modified_time: remote.modifiedTime,
      drive_folder_id: target, drive_folder_name: kind ?? note.linked_title, drive_folder_path: folderPath, drive_folder_path_ids: folderPathIds, sync_status: "synced" })
      .eq("id", note.id).eq("user_id", user.id).eq("updated_at", note.updated_at).select("id").single();
    if (saved.error) throw new RequestError("파일은 Drive에 업로드됐지만 노트 연결 저장에 실패했습니다. 다시 누르면 같은 파일로 재연결합니다.", 503);
    const complete = await db.from("drive_upload_jobs").update({ status: "completed" }).eq("id", jobId).eq("user_id", user.id);
    if (complete.error) throw new RequestError("노트는 연결됐지만 업로드 완료 기록을 확인하지 못했습니다.", 503);
    return jsonResponse({ uploaded: true, file_id: fileId, folder_name: note.linked_title });
  } catch (error) {
    if (jobId) await db.from("drive_upload_jobs").update({ status: "failed" }).eq("id", jobId);
    console.error("drive-upload failed", { type: error instanceof Error ? error.name : "unknown" });
    const message = error instanceof GoogleTokenError ? "Drive 인증을 갱신하지 못했습니다. Drive를 다시 연결해 주세요." : error instanceof RequestError ? error.message : "노트를 Drive에 업로드하지 못했습니다.";
    return jsonResponse({ error: message }, { status: error instanceof RequestError ? error.status : error instanceof GoogleTokenError ? 409 : 502 });
  }
}
if (import.meta.main) Deno.serve(handleDriveUpload);

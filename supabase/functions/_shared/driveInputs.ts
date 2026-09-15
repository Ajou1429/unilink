import { RequestError } from "./requestLimits.ts";
export function validateDriveId(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,256}$/.test(value)) {
    throw new RequestError("유효한 Drive 파일/폴더 ID가 필요합니다.");
  }
  return value;
}
export function parseFolderIds(values: unknown): string[] {
  if (!Array.isArray(values) || values.length > 10) throw new RequestError("동기화 폴더는 최대 10개까지 지정할 수 있습니다.");
  return [...new Set(values.map(value => {
    if (typeof value !== "string") throw new RequestError("유효한 폴더 ID가 필요합니다.");
    let id = value.trim();
    if (id.startsWith("https://")) {
      const url = new URL(id);
      if (url.hostname !== "drive.google.com") throw new RequestError("Google Drive 폴더 주소가 필요합니다.");
      id = url.pathname.match(/\/folders\/([^/]+)\/?$/)?.[1] ?? "";
    }
    return validateDriveId(id);
  }))];
}

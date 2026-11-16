// 과목 화면에서 자료를 누르면 원본 파일(PDF 등)을 브라우저 새 탭에서 바로 연다(파일 관리자처럼).
// 원본은 세 곳 중 하나에 있다: 이 브라우저(데모·비로그인) / 로그인 저장소(note-files) / Google Drive.
import { getSupabaseClient } from "../supabase/client";
import { fetchDrivePdf } from "../drive-connection";
import type { MyNote } from "../my-notes-storage";

const MIME: Record<string, string> = {
  pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};
const mimeOf = (name?: string) => MIME[(name ?? "").split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";

export function hasOriginal(note: MyNote) {
  return Boolean(note.fileDataUrl || note.filePath || (note.driveFileId && note.fileName));
}

async function originalUrl(note: MyNote): Promise<string> {
  if (note.fileDataUrl) {
    // 브라우저는 data: 주소를 새 탭으로 바로 열지 못하므로 blob 주소로 바꾼다
    const blob = await (await fetch(note.fileDataUrl)).blob();
    return URL.createObjectURL(new Blob([blob], { type: mimeOf(note.fileName) }));
  }
  if (note.filePath) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("로그인 상태를 확인한 뒤 다시 시도해 주세요.");
    const { data, error } = await supabase.storage.from("note-files").createSignedUrl(note.filePath, 60 * 60);
    if (error || !data?.signedUrl) throw new Error("저장된 파일을 불러오지 못했습니다. 다시 시도해 주세요.");
    return data.signedUrl;
  }
  if (note.driveFileId) {
    const blob = await fetchDrivePdf(note.driveFileId);
    return URL.createObjectURL(new Blob([blob], { type: mimeOf(note.fileName) }));
  }
  throw new Error("이 자료에는 열 수 있는 원본 파일이 연결되어 있지 않습니다.");
}

/** 클릭 순간 새 탭을 먼저 열어(팝업 차단 방지) 원본 주소가 준비되면 그 탭에 띄운다 */
export async function openOriginal(note: MyNote) {
  const tab = window.open("", "_blank");
  if (!tab) throw new Error("새 탭이 차단됐어요. 브라우저에서 이 사이트의 팝업을 허용해 주세요.");
  try {
    tab.document.title = note.fileName || note.title;
    tab.location.href = await originalUrl(note);
  } catch (error) {
    tab.close();
    throw error;
  }
}

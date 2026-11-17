import { getSupabaseBrowserClient } from "./supabase-client";
import type { MyNote } from "./my-notes-storage";
import { sameSourceTimestamp } from "../../supabase/functions/_shared/noteAnalysis";

export interface ChatDocumentAnalysis {
  noteId: string;
  noteTitle: string;
  version: number;
  updatedAt: string;
  summary: string;
  candidates: {
    kind: string;
    title: string;
    description?: string;
    exam_scope?: string;
    date_text: string;
    page?: number;
  }[];
}

/** A compact, explicitly bounded excerpt of a completed analysis for the current source. */
export function chatDocumentContext(analysis: ChatDocumentAnalysis | undefined, notes: MyNote[], request: string) {
  if (!analysis) return undefined;
  const note = notes.find(item => item.id === analysis.noteId);
  if (!note || note.version !== analysis.version || !sameSourceTimestamp(note.updatedAt, analysis.updatedAt)) {
    throw new Error("자료가 변경됐어요. 최신 원본을 분석한 뒤 다시 요청해 주세요.");
  }
  const keywords = request.normalize("NFC").split(/\s+/).filter(word => word.length > 1);
  const score = (item: ChatDocumentAnalysis["candidates"][number]) => {
    const text = `${item.title} ${item.description ?? ""} ${item.exam_scope ?? ""}`.normalize("NFC");
    return keywords.filter(word => text.includes(word)).length
      + (/시험|퀴즈/.test(request) && item.kind === "exam" ? 10 : 0)
      + (/과제|제출|마감/.test(request) && item.kind === "assignment" ? 10 : 0);
  };
  const candidates = [...analysis.candidates].sort((a, b) => score(b) - score(a)).map(item => ({
    kind: item.kind,
    title: item.title.slice(0, 200),
    description: item.description?.slice(0, 400),
    exam_scope: item.exam_scope?.slice(0, 400),
    date_text: item.date_text.slice(0, 500),
    page: item.page,
  }));
  const context = {
    source: "현재 버전 PDF의 완료된 AI 분석. 본문 전체 대신 후보 발췌이며 오독 가능성이 있음",
    note_id: analysis.noteId,
    title: analysis.noteTitle,
    summary: analysis.summary.slice(0, 1200),
    total_candidates: candidates.length,
    partial: analysis.summary.length > 1200 || analysis.candidates.some(item => (item.description?.length ?? 0) > 400 || (item.exam_scope?.length ?? 0) > 400),
    candidates,
  };
  while (JSON.stringify(context).length > 6500 && context.candidates.length) {
    context.candidates.pop();
    context.partial = true;
  }
  return context;
}

/** An explicit request to classify/name only takes precedence over a model-selected tool. */
export function allowsChatDocumentAnalysis(request: string) {
  if (/분석\s*(?:하지|하지는)\s*마|분석하지\s*말|본문\s*(?:읽지|전송하지)|(?:파일명|제목)\s*만|분류\s*만/.test(request)) return false;
  return !(/분류/.test(request) && !/내용|분석|시험|과제|계획|요약|설명|일정/.test(request));
}


export async function loadChatDocumentAnalysis(note: MyNote, userId: string, check: () => void): Promise<ChatDocumentAnalysis | undefined> {
  const db = getSupabaseBrowserClient();
  if (!db) return undefined;
  const result = await db.from("note_analyses").select("id,summary,note_version,note_updated_at")
    .eq("user_id", userId).eq("note_id", note.id).eq("status", "completed")
    .eq("note_version", note.version).eq("note_updated_at", note.updatedAt)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  check();
  if (result.error) throw new Error("저장된 자료 분석을 확인하지 못했어요. 잠시 후 다시 요청해 주세요.");
  if (!result.data) return undefined;
  const rows = await db.from("note_analysis_candidates").select("kind,title,description,exam_scope,date_text,page")
    .eq("user_id", userId).eq("analysis_id", result.data.id).order("page");
  check();
  if (rows.error) throw new Error("자료 분석 내용을 불러오지 못했어요.");
  return {
    noteId: note.id, noteTitle: note.title, version: result.data.note_version, updatedAt: result.data.note_updated_at,
    summary: result.data.summary ?? "", candidates: rows.data ?? [],
  };
}

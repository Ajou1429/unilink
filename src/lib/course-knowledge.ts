import { getSupabaseBrowserClient } from "./supabase-client";
import { getStorageUser } from "./private-storage";
import { describeFunctionError } from "./supabase/function-error";

export const courseKnowledgeEnabled = process.env.NEXT_PUBLIC_COURSE_KNOWLEDGE_ENABLED === "true";
export type KnowledgeStatus = {
  goal_id: string; title: string; status: string; pdf_count: number; pdf_ready: number;
  overview_complete: boolean; detail_complete: boolean; syllabus_detected: boolean;
  research_status: string; pending_steps: number; warnings: string[];
  sources?: { id: string; title: string }[];
  failed_steps: { id: string; kind: string; message: string }[];
  actual_progress: { id: string; date: string; title: string; mapped: boolean }[];
  knowledge: {
    context_truncated?: boolean;
    syllabus_facts?: { field: string; value: string; page: number; note_id: string }[];
    content: { artifact_id: string; note_id: string; pages: number[]; kind: string; content: {
      summary: string; units: { title: string; required_depth: string; methods: string[] }[];
      syllabus: { field: string; value: string; page: number }[];
    } }[];
    research: { artifact_id: string; content: { required_depth: string; minutes_low: number | null; minutes_high: number | null;
      time_basis: string; uncertainty: string; methods: string[]; sources: { url: string; title: string; checked_at: string; relevance: string }[] } }[];
  };
};

export async function requestCourseKnowledge(goalId: string, asOf: string, options: { action?: "status" | "refresh"; consent?: boolean; research_consent?: boolean; retry?: boolean; note_id?: string; refresh_request_id?: string } = {}) {
  const db = getSupabaseBrowserClient();
  if (!db) throw new Error("Supabase 연결이 필요합니다.");
  const { data, error } = await db.functions.invoke<KnowledgeStatus>("course-knowledge", { body: { goal_id: goalId, as_of: asOf, ...options } });
  if (error) throw new Error(await describeFunctionError(error, "과목 분석을 확인하지 못했습니다."));
  if (!data || typeof data.status !== "string") throw new Error("과목 분석 응답이 올바르지 않습니다.");
  return data;
}

// Each call advances one persisted step. Closing/refreshing cannot erase completed work.
export async function prepareCourseKnowledge(goalIds: string[], asOf: string, userId: string, consent: boolean, researchConsent: boolean,
  onStatus: (status: KnowledgeStatus) => void, retry = false) {
  if (!courseKnowledgeEnabled) return;
  for (const goalId of goalIds) {
    const started = Date.now();
    while (Date.now() - started < 20 * 60_000) {
      if (getStorageUser() !== userId) throw new Error("계정이 변경됐습니다. 다시 요청해 주세요.");
      const status = await requestCourseKnowledge(goalId, asOf, { consent, research_consent: researchConsent, retry });
      if (getStorageUser() !== userId) throw new Error("계정이 변경됐습니다. 다시 요청해 주세요.");
      if (status.status === "working") { await new Promise((resolve) => setTimeout(resolve, 3000)); continue; }
      if (status.status === "disabled") throw new Error("서버의 과목 지식 분석 설정이 필요합니다.");
      onStatus(status);
      if (status.status === "consent_required") throw new Error("선택한 과목 PDF의 AI 전송에 동의해 주세요.");
      if (status.status === "failed") throw new Error(status.failed_steps[0]?.message ?? "자료 분석에 실패했습니다. 해당 단계만 다시 시도해 주세요.");
      // Search is optional: a declined/failed search must be visibly degraded, never fabricated.
      if (status.status === "research_consent_required" || (status.status === "ready" &&
        (!researchConsent || status.research_status !== "pending"))) break;
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
    if (Date.now() - started >= 20 * 60_000) throw new Error("분석 결과는 저장되어 있습니다. 잠시 후 분석 이어가기를 눌러 주세요.");
  }
}

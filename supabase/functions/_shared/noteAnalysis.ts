export type NoteCandidate = { kind: "topic" | "assignment" | "exam"; title: string; description: string; exam_scope: string; date_text: string; page: number; quote: string };

export function sameSourceTimestamp(left: unknown, right: unknown): boolean {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const a = Date.parse(left), b = Date.parse(right);
  return Number.isFinite(a) && Number.isFinite(b) && a === b;
}
export const analysisSchema = {
  type: "object", additionalProperties: false,
  properties: { summary: { type: "string" }, candidates: { type: "array", items: {
    type: "object", additionalProperties: false,
    properties: { kind: { type: "string", enum: ["topic", "assignment", "exam"] },
      title: { type: "string" }, description: { type: "string" }, exam_scope: { type: "string" },
      date_text: { type: "string" }, page: { type: "integer" }, quote: { type: "string" } },
    required: ["kind", "title", "description", "exam_scope", "date_text", "page", "quote"],
  } } }, required: ["summary", "candidates"],
};
export function parseNoteAnalysis(value: unknown, pageCount: number): { summary: string; candidates: NoteCandidate[] } {
  const fail = () => { throw new Error("분석 결과 형식을 확인하지 못했습니다."); };
  if (!value || typeof value !== "object") return fail();
  const data = value as Record<string, unknown>;
  if (typeof data.summary !== "string" || data.summary.length > 3000 || !Array.isArray(data.candidates) || data.candidates.length > 30) return fail();
  const candidates = data.candidates as NoteCandidate[];
  const unique = new Set<string>();
  for (const c of candidates) {
    if (!c || !["topic", "assignment", "exam"].includes(c.kind) || !Number.isInteger(c.page) || c.page < 1 || c.page > pageCount) return fail();
    for (const [key, limit] of [["title", 200], ["description", 3000], ["exam_scope", 2000], ["date_text", 500], ["quote", 1500]] as const) {
      if (typeof c[key] !== "string" || c[key].length > limit || (["title", "quote"].includes(key) && !c[key].trim())) return fail();
    }
    const key = `${c.kind}:${c.page}:${c.title.trim()}`;
    if (unique.has(key)) return fail();
    unique.add(key);
  }
  return { summary: data.summary, candidates };
}

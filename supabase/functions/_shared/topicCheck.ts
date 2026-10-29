export type CheckQuestion = { prompt: string; options: string[]; correct_index: number; explanation: string; evidence_quote: string };
export const TOPIC_CHECK_PROMPT = "topic-check-v1";
export const checkSchema = {
  type: "object", additionalProperties: false,
  properties: { questions: { type: "array", items: {
    type: "object", additionalProperties: false,
    properties: { prompt: { type: "string" }, options: { type: "array", items: { type: "string" } },
      correct_index: { type: "integer" }, explanation: { type: "string" }, evidence_quote: { type: "string" } },
    required: ["prompt", "options", "correct_index", "explanation", "evidence_quote"],
  } } }, required: ["questions"],
};
export function parseTopicCheck(value: unknown, quote: string) {
  const fail = (): never => { throw new Error("노트 근거로 확인 가능한 세 문항을 생성하지 못했습니다."); };
  if (!value || typeof value !== "object" || !('questions' in value) || !Array.isArray(value.questions) || value.questions.length !== 3) return fail();
  const seen = new Set<string>();
  const questions = value.questions as CheckQuestion[];
  for (const q of questions) {
    if (!q || typeof q !== "object") return fail();
    for (const [key, limit] of [["prompt", 600], ["explanation", 1000], ["evidence_quote", 1500]] as const) {
      if (typeof q[key] !== "string" || !q[key].trim() || q[key].length > limit) return fail();
    }
    if (!Array.isArray(q.options) || q.options.length !== 4 || q.options.some((o) => typeof o !== "string" || !o.trim() || o.length > 300) || new Set(q.options.map((o) => o.trim())).size !== 4) return fail();
    if (!Number.isInteger(q.correct_index) || q.correct_index < 0 || q.correct_index > 3 || !quote.includes(q.evidence_quote) || seen.has(q.prompt.trim())) return fail();
    seen.add(q.prompt.trim());
  }
  // Explicit projection prevents accidental answer-key leakage in the public row.
  return {
    questions: questions.map((q, i) => ({ id: i + 1, prompt: q.prompt, options: q.options })),
    key: questions.map((q) => ({ correct_index: q.correct_index, explanation: q.explanation, evidence_quote: q.evidence_quote })),
  };
}

// POST /file-classify
// 대시보드 파일 추가·Drive 동기화 파일의 자동 분류. 브라우저가 이미 줄여 보낸 앞쪽 텍스트(또는 저해상도 첫 페이지 이미지)만 받는다.
// mode=classify: 자료 종류 + 과목, mode=syllabus: 강의계획서 항목(과목·교수·시간·성적 반영비율).
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { getAdminClient, getUserFromAuthHeader } from "../_shared/supabaseAdmin.ts";
import { readLimitedBody, RequestError } from "../_shared/requestLimits.ts";
import { loadCoachingSettings } from "../_shared/coachingSettings.ts";
import {
  classifySchema, InputError, instructionsFor, modelInput, parseClassifyOutput, parseClassifyRequest,
  parseSyllabusOutput, syllabusSchema,
} from "../_shared/fileClassify.ts";

const MAX_REQUEST_BYTES = 512 * 1024;

export async function handleFileClassify(req: Request): Promise<Response> {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== "POST") return jsonResponse({ error: "method not allowed" }, { status: 405 });
  try {
    const user = await getUserFromAuthHeader(req);
    if (!user) throw new RequestError("로그인이 필요합니다.", 401);
    const raw = new TextDecoder().decode(await readLimitedBody(req, MAX_REQUEST_BYTES, AbortSignal.timeout(15000)));
    let request;
    try { request = parseClassifyRequest(JSON.parse(raw)); }
    catch (error) { throw new RequestError(error instanceof InputError ? error.message : "요청 형식을 확인해 주세요."); }

    const db = getAdminClient();
    const settings = await loadCoachingSettings(db);
    const model = Deno.env.get("FILE_CLASSIFY_MODEL") ?? settings.analysis_model ?? Deno.env.get("COACHING_MODEL");
    if (!model || !Deno.env.get("OPENAI_API_KEY")) throw new RequestError("AI 분류 설정이 필요합니다.", 503);
    const reserved = await db.rpc("reserve_file_classification", { p_user: user.id, p_mode: request.mode });
    if (reserved.error || reserved.data !== true) throw new RequestError("오늘 자동 분류 한도에 도달했습니다. 내일 다시 시도하거나 직접 분류해 주세요.", 429);

    const signal = AbortSignal.timeout(60000);
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST", signal,
      headers: { Authorization: `Bearer ${Deno.env.get("OPENAI_API_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model, store: false, max_output_tokens: request.mode === "classify" ? 300 : 1500,
        instructions: instructionsFor(request.mode),
        input: modelInput(request),
        text: { format: { type: "json_schema", name: request.mode === "classify" ? "file_classification" : "syllabus_facts", strict: true,
          schema: request.mode === "classify" ? classifySchema : syllabusSchema } },
      }),
    });
    if (!response.ok) throw new RequestError("AI 분류 요청을 처리하지 못했습니다.", 502);
    const data = JSON.parse(new TextDecoder().decode(await readLimitedBody(response, 65536, signal)));
    if (data.status !== "completed") throw new RequestError("AI 분류가 완료되지 않았습니다.", 502);
    const text = data.output?.filter((o: { type: string }) => o.type === "message")
      .flatMap((o: { content: { type: string; text: string }[] }) => o.content ?? [])
      .filter((c: { type: string }) => c.type === "output_text").map((c: { text: string }) => c.text).join("");
    const parsed = JSON.parse(text);
    const result = request.mode === "classify" ? parseClassifyOutput(parsed, request.courses) : parseSyllabusOutput(parsed);
    return jsonResponse({ result, usage: { input_tokens: data.usage?.input_tokens ?? 0, output_tokens: data.usage?.output_tokens ?? 0 } });
  } catch (error) {
    console.error("file-classify failed", { type: error instanceof Error ? error.name : "unknown" });
    const status = error instanceof RequestError ? error.status : 500;
    return jsonResponse({ error: error instanceof RequestError ? error.message : "파일을 분류하지 못했습니다." }, { status });
  }
}
if (import.meta.main) Deno.serve(handleFileClassify);

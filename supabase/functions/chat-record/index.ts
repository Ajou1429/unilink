// POST /chat-record
// 홈 채팅의 한 메시지를 진도·이해도 기록으로 해석한다. 저장은 브라우저가 기존 경로(회차·주제 관측·문제은행)로 한다.
// 대화 원문은 서버에 남기지 않는다(OpenAI store:false, 로그는 오류 종류만).
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { getAdminClient, getUserFromAuthHeader } from "../_shared/supabaseAdmin.ts";
import { readLimitedBody, RequestError } from "../_shared/requestLimits.ts";
import { loadCoachingSettings } from "../_shared/coachingSettings.ts";
import { CHAT_INSTRUCTIONS, chatModelInput, chatSchema, InputError, parseChatOutput, parseChatRequest } from "../_shared/chatRecord.ts";

const MAX_REQUEST_BYTES = 256 * 1024;

export async function handleChatRecord(req: Request): Promise<Response> {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== "POST") return jsonResponse({ error: "method not allowed" }, { status: 405 });
  try {
    const user = await getUserFromAuthHeader(req);
    if (!user) throw new RequestError("로그인이 필요합니다.", 401);
    const raw = new TextDecoder().decode(await readLimitedBody(req, MAX_REQUEST_BYTES, AbortSignal.timeout(15000)));
    let request;
    try { request = parseChatRequest(JSON.parse(raw)); }
    catch (error) { throw new RequestError(error instanceof InputError ? error.message : "요청 형식을 확인해 주세요."); }

    const db = getAdminClient();
    const settings = await loadCoachingSettings(db);
    const model = Deno.env.get("CHAT_RECORD_MODEL") ?? settings.analysis_model ?? Deno.env.get("COACHING_MODEL");
    if (!model || !Deno.env.get("OPENAI_API_KEY")) throw new RequestError("AI 설정이 필요합니다.", 503);
    const reserved = await db.rpc("reserve_file_classification", { p_user: user.id, p_mode: "chat" });
    if (reserved.error || reserved.data !== true) throw new RequestError("오늘 대화 기록 한도에 도달했습니다. 내일 다시 시도해 주세요.", 429);

    const signal = AbortSignal.timeout(45000);
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST", signal,
      headers: { Authorization: `Bearer ${Deno.env.get("OPENAI_API_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model, store: false, max_output_tokens: 1200,
        instructions: CHAT_INSTRUCTIONS,
        input: chatModelInput(request),
        text: { format: { type: "json_schema", name: "chat_learning_records", strict: true, schema: chatSchema } },
      }),
    });
    if (!response.ok) throw new RequestError("AI 요청을 처리하지 못했습니다.", 502);
    const data = JSON.parse(new TextDecoder().decode(await readLimitedBody(response, 65536, signal)));
    if (data.status !== "completed") throw new RequestError("AI 응답이 완료되지 않았습니다.", 502);
    const text = data.output?.filter((o: { type: string }) => o.type === "message")
      .flatMap((o: { content: { type: string; text: string }[] }) => o.content ?? [])
      .filter((c: { type: string }) => c.type === "output_text").map((c: { text: string }) => c.text).join("");
    const result = parseChatOutput(JSON.parse(text), request);
    return jsonResponse({ result, usage: { input_tokens: data.usage?.input_tokens ?? 0, output_tokens: data.usage?.output_tokens ?? 0 } });
  } catch (error) {
    console.error("chat-record failed", { type: error instanceof Error ? error.name : "unknown" });
    const status = error instanceof RequestError ? error.status : 500;
    return jsonResponse({ error: error instanceof RequestError ? error.message : "대화를 기록하지 못했습니다." }, { status });
  }
}
if (import.meta.main) Deno.serve(handleChatRecord);

import { getAdminClient, getUserFromAuthHeader } from "../_shared/supabaseAdmin.ts";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { readLimitedBody, RequestError } from "../_shared/requestLimits.ts";
import { AGENT_VERSION, parseAgentRequest, type AgentGoal } from "../_shared/serviceAgent.ts";
import { runServiceAgent } from "../_shared/serviceAgentRunner.ts";

export async function handleServiceAgent(req: Request): Promise<Response> {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== "POST") return jsonResponse({ error: "method not allowed" }, { status: 405 });
  try {
    const user = await getUserFromAuthHeader(req);
    if (!user) throw new RequestError("로그인이 필요합니다.", 401);
    if (Deno.env.get("SERVICE_AGENT_ENABLED") !== "true") throw new RequestError("통합 비서 서버가 아직 활성화되지 않았습니다. 기존 기록·코칭 화면은 계속 사용할 수 있습니다.", 503);
    const signal = AbortSignal.timeout(90000);
    let request;
    try { request = parseAgentRequest(JSON.parse(new TextDecoder().decode(await readLimitedBody(req, 32768, signal)))); }
    catch (error) { throw new RequestError(error instanceof Error ? error.message : "입력을 확인해 주세요."); }
    const db = getAdminClient();
    const rows = await db.from("learning_goals").select("id,title,course_id").eq("user_id", user.id).eq("status", "active").order("created_at", { ascending: false }).limit(100);
    if (rows.error) throw new RequestError("학습 목표 조회에 실패했습니다.", 503);
    const goals = (rows.data ?? []) as AgentGoal[];
    const key = Deno.env.get("OPENAI_API_KEY");
    if (!key && request.message) throw new RequestError("AI 서버 설정이 필요합니다.", 503);
    if (request.message) {
      const reserved = await db.rpc("reserve_file_classification", { p_user: user.id, p_mode: "chat" });
      if (reserved.error || reserved.data !== true) throw new RequestError("오늘 AI 대화 한도에 도달했습니다.", 429);
    }
    const usage = { calls: 0, input_tokens: 0, output_tokens: 0 };
    // Every admin-client read is owner scoped. No model-chosen tables, columns, SQL or user IDs.
    async function checked(query: PromiseLike<{ data: unknown; error: unknown }>) {
      const result = await query;
      if (result.error) throw new RequestError("개인 DB를 조회하지 못했습니다. 빈 결과로 처리하지 않았습니다.", 503);
      return result.data;
    }
    const result = await runServiceAgent(request, goals, {
      routerModel: Deno.env.get("SERVICE_ROUTER_MODEL") || "gpt-6.1-terra",
      assistantModel: Deno.env.get("SERVICE_ASSISTANT_MODEL") || "gpt-6.1-terra",
      respond: async body => {
        const response = await fetch("https://api.openai.com/v1/responses", {
          method: "POST", signal, headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, store: false, max_output_tokens: 2400 }),
        });
        if (!response.ok) throw new RequestError("AI 서버 요청에 실패했습니다. 저장 작업은 실행되지 않았습니다.", 502);
        const data = JSON.parse(new TextDecoder().decode(await readLimitedBody(response, 131072, signal)));
        usage.calls++; usage.input_tokens += data.usage?.input_tokens ?? 0; usage.output_tokens += data.usage?.output_tokens ?? 0;
        return data;
      },
      read: async domain => {
        const limit = 60;
        switch (domain) {
          case "courses": return { limit, goals, courses: await checked(db.from("courses").select("id,name,term,course_code,status").eq("user_id", user.id).eq("status", "active").order("created_at", { ascending: false }).limit(limit)) };
          case "schedule": return { limit, from: request.today,
            events: await checked(db.from("calendar_events").select("id,goal_id,title,event_type,starts_at,ends_at,due_at,status").eq("user_id", user.id).eq("status", "scheduled").or(`starts_at.gte.${request.today},due_at.gte.${request.today}`).order("due_at", { nullsFirst: false }).limit(limit)),
            classes: await checked(db.from("coaching_course_schedules").select("course_id,day_of_week,start_time,end_time,effective_from,effective_to").eq("user_id", user.id).limit(limit)),
            commitments: await checked(db.from("recurring_commitments").select("title,day_of_week,start_time,end_time,effective_from,effective_to,is_blocking").eq("user_id", user.id).limit(limit)) };
          case "learning": return { limit, topics: await checked(db.from("goal_topics").select("id,goal_id,title,status").eq("user_id", user.id).eq("status", "confirmed").order("updated_at", { ascending: false }).limit(limit)),
            self_reported: await checked(db.from("topic_learning_states").select("goal_id,topic_id,learning_status,self_rating,observed_at,source").eq("user_id", user.id).order("observed_at", { ascending: false }).limit(limit)),
            assessed: await checked(db.from("topic_check_states").select("goal_id,topic_id,correct_count,question_count,source_stale,created_at").eq("user_id", user.id).is("voided_at", null).order("created_at", { ascending: false }).limit(limit)),
            sessions: await checked(db.from("active_course_sessions").select("course_id,session_date,pace").eq("user_id", user.id).order("session_date", { ascending: false }).limit(limit)) };
          case "plans": return { limit, items: await checked(db.from("study_plan_items").select("id,goal_id,title,status,scheduled_start,scheduled_end,planned_minutes").eq("user_id", user.id).eq("status", "planned").order("scheduled_start", { nullsFirst: false }).limit(limit)) };
          case "notes": return { limit, metadata_only: true, notes: await checked(db.from("notes").select("id,title,course_name,linked_type,linked_id,file_name,updated_at,version").eq("user_id", user.id).order("updated_at", { ascending: false }).limit(limit)) };
        }
      },
    });
    return jsonResponse({ version: AGENT_VERSION, request_id: request.request_id, result, usage });
  } catch (error) {
    console.error("service-agent failed", { type: error instanceof Error ? error.name : "unknown" });
    return jsonResponse({ error: error instanceof RequestError ? error.message : "통합 비서가 요청을 처리하지 못했습니다. 저장은 진행하지 않았습니다." }, { status: error instanceof RequestError ? error.status : 500 });
  }
}
if (import.meta.main) Deno.serve(handleServiceAgent);

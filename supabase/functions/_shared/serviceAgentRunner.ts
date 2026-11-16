import { ASSISTANT_INSTRUCTIONS, fileOnlyPlan, parseAgentPlan, READ_DOMAINS, ROUTING_INSTRUCTIONS, routingSchema, workflowSchema,
  type AgentGoal, type AgentPlan, type AgentRequest, type ReadDomain } from "./serviceAgent.ts";

type ModelResponse = { status: string; output: { type: string; name?: string; call_id?: string; arguments?: string; content?: { type: string; text?: string }[] }[] };
export type AgentRuntime = {
  routerModel: string; assistantModel: string;
  respond: (body: Record<string, unknown>) => Promise<ModelResponse>;
  read: (domain: ReadDomain) => Promise<unknown>;
};
export async function runServiceAgent(request: AgentRequest, goals: AgentGoal[], runtime: AgentRuntime): Promise<AgentPlan> {
  const fileOnly = fileOnlyPlan(request);
  if (fileOnly) return fileOnly;
  const input: unknown[] = [{ role: "user", content: JSON.stringify({ request, goals }) }];
  const routing = await runtime.respond({ model: runtime.routerModel, instructions: ROUTING_INSTRUCTIONS, input,
    text: { format: { type: "json_schema", name: "service_route", strict: true, schema: routingSchema } } });
  if (routing.status !== "completed") throw new Error("요청 분류가 완료되지 않았습니다.");
  const output = routing.output.filter(item => item.type === "message").flatMap(item => item.content ?? []).filter(c => c.type === "output_text").map(c => c.text ?? "").join("");
  const { route } = JSON.parse(output);
  if (route !== "assistant" && route !== "coaching") throw new Error("요청 분류를 확인하지 못했습니다.");
  input.push({ role: "user", content: JSON.stringify({ route, instruction: "Prepare the requested workflow without executing writes." }) });
  const read = { type: "function", name: "read_service_data", description: "Read a bounded sample of the authenticated user's actual DB records. No writes.", strict: true,
    parameters: { type: "object", additionalProperties: false, required: ["domain"], properties: { domain: { type: "string", enum: [...READ_DOMAINS] } } } };
  const prepare = { type: "function", name: "prepare_workflow", description: "Finish with an unexecuted workflow. Changes need existing app validation and UI approval; this function cannot write.", strict: true, parameters: workflowSchema };
  const cache = new Map<ReadDomain, unknown>();
  for (let turn = 0; turn < 6; turn++) {
    const response = await runtime.respond({ model: runtime.assistantModel, instructions: ASSISTANT_INSTRUCTIONS,
      input, tools: turn === 5 ? [prepare] : [read, prepare], parallel_tool_calls: false,
      tool_choice: turn === 5 ? { type: "function", name: "prepare_workflow" } : "required" });
    if (response.status !== "completed") throw new Error("비서 응답이 완료되지 않았습니다. 변경하지 않았습니다.");
    const calls = response.output.filter(item => item.type === "function_call");
    if (calls.length !== 1 || !calls[0].call_id) throw new Error("비서 작업 형식이 올바르지 않습니다.");
    const call = calls[0], args = JSON.parse(call.arguments ?? "null");
    if (call.name === "prepare_workflow") return parseAgentPlan(args, route, goals);
    if (call.name !== "read_service_data" || !args || !READ_DOMAINS.includes(args.domain)) throw new Error("허용되지 않은 도구입니다.");
    const domain = args.domain as ReadDomain;
    if (!cache.has(domain)) cache.set(domain, await runtime.read(domain));
    input.push(...response.output, { type: "function_call_output", call_id: call.call_id, output: JSON.stringify(cache.get(domain)) });
  }
  throw new Error("작업 횟수 제한에 도달했습니다. 변경하지 않았습니다.");
}

import { generateProposal, intentInstructions } from "../functions/_shared/coaching/model.ts";
import { CoachingError, parseCoachingRequest, type CoachingContext } from "../functions/_shared/coaching/contract.ts";

function assert(value: unknown): asserts value { if (!value) throw new Error("Assertion failed"); }

Deno.test("intent instructions reference the grouped input and preserve daily, exam and review scope", () => {
  assert(intentInstructions("daily_plan").includes("request.daily_sources"));
  assert(intentInstructions("daily_plan").includes("kind=plan"));
  assert(intentInstructions("daily_plan").includes("goal_briefs[].deadlines"));
  assert(intentInstructions("exam_prep").includes("request.exam_inputs"));
  assert(intentInstructions("topic_review").includes("shared_context.recurring_blocks"));
  assert(intentInstructions("topic_review").includes("Never replace existing plans"));
});

Deno.test("coaching provider uses bounded structured output and fails closed on refusal", async () => {
  const originalFetch = globalThis.fetch;
  const oldKey = Deno.env.get("OPENAI_API_KEY");
  const oldModel = Deno.env.get("COACHING_MODEL");
  Deno.env.set("OPENAI_API_KEY", "test-only-key");
  Deno.env.set("COACHING_MODEL", "test-model");
  const goal = "00000000-0000-4000-8000-000000000001";
  const request = parseCoachingRequest({
    goal_ids: [goal], intent: "daily_plan", daily_sources: [{ kind: "event", id: goal }], period_start: "2026-10-01", period_end: "2026-10-01",
    day_budgets: [{ date: "2026-10-01", minutes: 30, windows: [{ start: "09:00", end: "10:00" }] }],
    desired_outcome: "Review", constraints: "",
    rules: { transition_minutes: 10, break_minutes: 10, break_after_minutes: 60,
      method_minimums: { note_review: 20 }, max_focus_goals: 1, carryover: true },
  });
  const context: CoachingContext = {
    timezone: "Asia/Seoul", goals: [{ id: goal, title: "Math", goal_type: "course", target_date: null, importance: 3, metadata: { private: "omit" } }],
    topics: [], methods: [{ code: "note_review", display_name: "Review", active: true }],
    deadlines: [], sessions: [], existing_items: [],
    personal_preferences: {preferred_session_minutes:40,coaching_style:"적용 문제 위주"},
    personal_feedback: [{id:"f",run_id:"r",goal_ids:[goal],feedback_type:"rejected",explanation:"구체적인 작업을 원함",created_at:"2026-11-08"}],
  };
  let refuse = false;
  let selected = "test-model";
  globalThis.fetch = async (input, init) => {
    assert(input === "https://api.openai.com/v1/responses");
    const body = JSON.parse(String(init?.body));
    assert(body.store === false && body.model === selected);
    assert(selected === "gpt-6.1-sol" ? body.reasoning.effort === "low" : body.reasoning === undefined);
    const submitted = JSON.parse(body.input.at(-1).content);
    assert(submitted.input_schema_version === "coaching-evidence-v5");
    assert(submitted.request.day_budgets[0].minutes === 30);
    assert(submitted.goal_briefs[0].goal.id === goal);
    assert(submitted.goal_briefs[0].evidence_gaps.missing_records.includes("scored_checks"));
    assert(!JSON.stringify(submitted).includes("private"));
    assert(body.instructions.includes("# Decision procedure"));
    assert(body.instructions.includes("Personalization without waiting for optional input"));
    assert(submitted.shared_context.personal_preferences.preferred_session_minutes === 40);
    assert(submitted.shared_context.personal_feedback[0].feedback_id === "f");
    assert(body.text.format.strict === true && body.text.format.schema.additionalProperties === false);
    const itemSchema = body.text.format.schema.properties.items.items;
    assert(itemSchema.properties.goal_id.enum.length === 1 && itemSchema.properties.goal_id.enum[0] === goal);
    assert(itemSchema.properties.topic_id.enum.length === 1 && itemSchema.properties.topic_id.enum[0] === null);
    assert(itemSchema.properties.method_code.enum[0] === "note_review");
    assert(itemSchema.properties.planned_date.enum.length === 1 && itemSchema.properties.planned_date.enum[0] === "2026-10-01");
    assert(!body.input.includes("private"));
    return Response.json(refuse ? { status: "completed", output: [{ type: "message", content: [{ type: "refusal", refusal: "No" }] }] }
      : { status: "completed", usage: { input_tokens: 120, input_tokens_details: { cached_tokens: 20 }, output_tokens: 40,
        output_tokens_details: { reasoning_tokens: 10 }, total_tokens: 160 }, output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({
        summary: "Review", items: [{ goal_id: goal, topic_id: null, method_code: "note_review", title: "Math review",
          planned_date: "2026-10-01", start_time: "09:00", planned_minutes: 30, reason: "Practice" }], deferred_goals: [],
      }) }] }] });
  };
  try {
    const generated = await generateProposal(request, context);
    assert(generated.proposal.items.length === 1);
    assert(generated.usage.input_tokens === 120 && generated.usage.cached_input_tokens === 20);
    assert(generated.usage.output_tokens === 40 && generated.usage.reasoning_tokens === 10);
    selected = "gpt-6.1-sol";
    await generateProposal({...request,desired_outcome:"",constraints:""}, context, undefined, selected);
    selected = "test-model";
    refuse = true;
    try { await generateProposal(request, context); throw new Error("Expected refusal"); }
    catch (error) { assert(error instanceof CoachingError && error.status === 502); }
  } finally {
    globalThis.fetch = originalFetch;
    if (oldKey === undefined) Deno.env.delete("OPENAI_API_KEY"); else Deno.env.set("OPENAI_API_KEY", oldKey);
    if (oldModel === undefined) Deno.env.delete("COACHING_MODEL"); else Deno.env.set("COACHING_MODEL", oldModel);
  }
});

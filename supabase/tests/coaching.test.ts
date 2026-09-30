import { generateProposal } from "../functions/_shared/coaching/model.ts";
import { CoachingError, parseCoachingRequest, type CoachingContext } from "../functions/_shared/coaching/contract.ts";

function assert(value: unknown): asserts value { if (!value) throw new Error("Assertion failed"); }

Deno.test("coaching provider uses bounded structured output and fails closed on refusal", async () => {
  const originalFetch = globalThis.fetch;
  const oldKey = Deno.env.get("OPENAI_API_KEY");
  const oldModel = Deno.env.get("COACHING_MODEL");
  Deno.env.set("OPENAI_API_KEY", "test-only-key");
  Deno.env.set("COACHING_MODEL", "test-model");
  const goal = "00000000-0000-4000-8000-000000000001";
  const request = parseCoachingRequest({
    goal_ids: [goal], intent: "daily_plan", period_start: "2026-10-01", period_end: "2026-10-01",
    day_budgets: [{ date: "2026-10-01", minutes: 30 }], desired_outcome: "Review", constraints: "",
  });
  const context: CoachingContext = {
    timezone: "Asia/Seoul", goals: [{ id: goal, title: "Math", goal_type: "course", target_date: null, importance: 3, metadata: { private: "omit" } }],
    topics: [], methods: [{ code: "note_review", display_name: "Review", active: true }],
    deadlines: [], sessions: [], existing_items: [],
  };
  let refuse = false;
  globalThis.fetch = async (input, init) => {
    assert(input === "https://api.openai.com/v1/responses");
    const body = JSON.parse(String(init?.body));
    assert(body.store === false && body.model === "test-model");
    assert(body.text.format.strict === true && body.text.format.schema.additionalProperties === false);
    assert(!body.input.includes("private"));
    return Response.json(refuse ? { status: "completed", output: [{ type: "message", content: [{ type: "refusal", refusal: "No" }] }] }
      : { status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({
        summary: "Review", items: [{ goal_id: goal, topic_id: null, method_code: "note_review", title: "Math review",
          planned_date: "2026-10-01", planned_minutes: 30, reason: "Practice" }],
      }) }] }] });
  };
  try {
    assert((await generateProposal(request, context)).items.length === 1);
    refuse = true;
    try { await generateProposal(request, context); throw new Error("Expected refusal"); }
    catch (error) { assert(error instanceof CoachingError && error.status === 502); }
  } finally {
    globalThis.fetch = originalFetch;
    if (oldKey === undefined) Deno.env.delete("OPENAI_API_KEY"); else Deno.env.set("OPENAI_API_KEY", oldKey);
    if (oldModel === undefined) Deno.env.delete("COACHING_MODEL"); else Deno.env.set("COACHING_MODEL", oldModel);
  }
});

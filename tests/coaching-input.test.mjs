import test from "node:test";
import assert from "node:assert/strict";
import { buildModelInput, groupEvidenceContext } from "../supabase/functions/_shared/coaching/input.ts";
import { coachingContextSnapshot } from "../supabase/functions/_shared/coaching/run.ts";
import { synthesisModel } from "../supabase/functions/_shared/coachingSettings.ts";
import { knowledgeModels } from "../supabase/functions/_shared/courseKnowledgeStore.ts";
import { coachingUsagePayload } from "../supabase/functions/_shared/coaching/usage.ts";

test("synthesis model routing leaves PDF/search models unchanged and accounts for Sol pricing", () => {
  const settings = { synthesis_model: "gpt-6.1-sol", analysis_model: "gpt-5.4-mini", research_model: "gpt-4.1", research_enabled: true };
  const env = (key) => ({ COACHING_MODEL: "gpt-4.1-mini" })[key];
  assert.equal(synthesisModel(env, settings), "gpt-6.1-sol");
  assert.equal(synthesisModel((key) => key === "COACHING_SYNTHESIS_MODEL" ? "rollback-model" : undefined, settings), "rollback-model");
  assert.equal(synthesisModel(env, {}), "gpt-4.1-mini");
  assert.deepEqual(knowledgeModels(env, settings), { model: "gpt-5.4-mini", searchModel: "gpt-4.1" });
  const usage = coachingUsagePayload("gpt-6.1-sol", [{ input_tokens: 1000, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 100, reasoning_tokens: 50, total_tokens: 1100 }]);
  assert.equal(usage.totals.estimated_cost_usd, 0.003);
});

test("goal briefs isolate evidence, preserve source details, zero scores and missing records without duplication", () => {
  const source = {
    timezone: "Asia/Seoul",
    goals: [
      { id: "a", title: "SQL", course_id: "c1", goal_type: "course", metadata: { private: "not for model" } },
      { id: "b", title: "Math", course_id: "c2", goal_type: "course" },
    ],
    topics: [{ id: "t", goal_id: "a", title: "JOIN", status: "confirmed" }],
    course_knowledge: [{ goal_id: "a", content: [{ artifact_id: "e1", pages: [3, 5], content: "JOIN evidence" }] }],
    course_progress: [{ id: "s", course_id: "c1", session_date: "2026-11-01", metadata: {} }],
    topic_check_states: [{ id: "q", goal_id: "a", topic_id: "t", correct_count: 0, question_count: 3 }],
    methods: [], deadlines: [], sessions: [], existing_items: [],
  };
  const before = JSON.stringify(source);
  const input = buildModelInput({ goal_ids: ["a", "b"], constraints: "Keep my windows" }, source);
  assert.equal(input.goal_briefs[0].course_knowledge.length, 1);
  assert.equal(input.goal_briefs[0].recorded_class_progress.length, 1);
  assert.deepEqual(input.goal_briefs[1].course_knowledge, []);
  assert.deepEqual(input.goal_briefs[1].scored_checks, []);
  assert.ok(input.goal_briefs[1].evidence_gaps.missing_records.includes("scored_checks"));
  assert.equal(input.goal_briefs[0].scored_checks[0].correct_count, 0);
  assert.equal(input.goal_briefs[0].course_knowledge[0].content[0].artifact_id, "e1");
  assert.equal(JSON.stringify(input).split("JOIN evidence").length - 1, 1);
  assert.equal(input.context, undefined);
  assert.equal(input.request.constraints, "Keep my windows");
  assert.equal(JSON.stringify(source), before);
  assert.ok(!JSON.stringify(input).includes("not for model"));
});

const fixture = () => ({
  timezone: "Asia/Seoul", goals: [{ id: "a", title: "SQL", course_id: "c1", goal_type: "course" }],
  topics: [{ id: "t", goal_id: "a", title: "JOIN", status: "confirmed" }],
  methods: [], deadlines: [], sessions: [], existing_items: [],
  course_knowledge: [{ goal_id: "a", overview_complete: true, detail_complete: true, context_truncated: false,
    content: [{ artifact_id: "e1", pages: [3, 5], content: "JOIN" }] }],
  topic_learning_states: [{ id: "s1", goal_id: "a", topic_id: "t", self_rating: 2, observed_at: "2026-11-06" }],
  topic_check_states: [{ id: "q1", goal_id: "a", topic_id: "t", correct_count: 0, question_count: 3, source_stale: false }],
});

test("counterfactual mastery changes observations but never rewrites material or invents weights", () => {
  const low = fixture(); const high = structuredClone(low);
  high.topic_learning_states[0].self_rating = 5;
  high.topic_check_states[0].correct_count = 3;
  const a = buildModelInput({}, low).goal_briefs[0];
  const b = buildModelInput({}, high).goal_briefs[0];
  assert.deepEqual(a.course_knowledge, b.course_knowledge);
  assert.equal(a.self_reports[0].self_rating_1_to_5, 2);
  assert.equal(b.self_reports[0].self_rating_1_to_5, 5);
  assert.notDeepEqual(a.scored_checks, b.scored_checks);
  assert.equal(b.mastery_score, undefined);
});

test("material truncation, incomplete coverage and stale checks remain explicit", () => {
  const source = fixture();
  Object.assign(source.course_knowledge[0], { context_truncated: true, detail_complete: false });
  source.topic_check_states[0].source_stale = true;
  const brief = buildModelInput({}, source).goal_briefs[0];
  assert.equal(brief.evidence_gaps.truncated_material, true);
  assert.equal(brief.evidence_gaps.incomplete_material, true);
  assert.deepEqual(brief.evidence_gaps.stale_check_ids, ["q1"]);
  assert.equal(brief.scored_checks.length, 1);
});

test("request time and deadline counterfactuals reach the model without hiding unchanged evidence", () => {
  const source = fixture();
  source.deadlines = [{ id: "d1", goal_id: "a", title: "JOIN assignment", due_at: "2026-11-08" }];
  const request = { day_budgets: [{ date: "2026-11-07", minutes: 120, windows: [{ start: "09:00", end: "12:00" }] }] };
  const first = buildModelInput(request, source);
  const short = buildModelInput({ ...request, day_budgets: [{ ...request.day_budgets[0], minutes: 30 }] }, source);
  assert.equal(short.request.day_budgets[0].minutes, 30);
  assert.deepEqual(first.goal_briefs, short.goal_briefs);
  source.deadlines[0].due_at = "2026-11-07";
  const urgent = buildModelInput(request, source);
  assert.notDeepEqual(first.goal_briefs[0].deadlines, urgent.goal_briefs[0].deadlines);
  assert.deepEqual(first.goal_briefs[0].course_knowledge, urgent.goal_briefs[0].course_knowledge);
});

test("stored context preserves approval timezone and reconstructs model input without duplicated evidence", () => {
  const source = fixture(); source.timezone = "America/New_York";
  const snapshot = JSON.parse(JSON.stringify(coachingContextSnapshot(source)));
  assert.equal(snapshot.context.timezone, "America/New_York");
  assert.equal(snapshot.schema_version, 1);
  assert.equal(snapshot.model_input_context, undefined);
  assert.equal(JSON.stringify(snapshot).split('"artifact_id":"e1"').length - 1, 1);
  const { input_schema_version, request, ...prepared } = JSON.parse(JSON.stringify(buildModelInput({ intent: "weekly_plan" }, source)));
  assert.equal(snapshot.model_input_schema_version, input_schema_version);
  assert.deepEqual(JSON.parse(JSON.stringify(groupEvidenceContext(snapshot.context))), prepared);
  assert.equal(request.intent, "weekly_plan");
});

test("personal DB input keeps preferences soft, feedback scoped, and execution references instead of inferred mastery", () => {
  const source = fixture();
  source.personal_preferences = {preferred_session_minutes:45,coaching_style:"짧은 실습 위주",private:"omit-this"};
  source.personal_feedback = [
    {id:"f1",run_id:"r1",goal_ids:["a","foreign"],feedback_type:"rejected",explanation:"단순 암기보다 적용 문제를 원함",created_at:"2026-11-08"},
    {id:"f2",run_id:"r2",goal_ids:["foreign"],feedback_type:"accepted",explanation:"foreign-secret",created_at:"2026-11-08"},
  ];
  source.sessions = [{id:"s1",plan_item_id:"p1",goal_id:"a",topic_id:"t",method_code:"practice",actual_minutes:25,
    completion_status:"partial",source:"timer",started_at:"2026-11-08T00:00:00Z",created_at:"2026-11-08T01:00:00Z",metadata:{private:"omit-this"}}];
  const out = buildModelInput({desired_outcome:"",constraints:"",goal_ids:["a"]}, source);
  assert.equal(out.shared_context.personal_preferences.preferred_session_minutes,45);
  assert.equal(out.shared_context.personal_feedback.length,1);
  assert.deepEqual(out.shared_context.personal_feedback[0].goal_ids,["a"]);
  assert.equal(out.shared_context.personal_feedback[0].scope,"whole_run_not_topic_diagnosis");
  assert.equal(out.goal_briefs[0].study_history[0].plan_item_id,"p1");
  assert.equal(out.goal_briefs[0].study_history[0].method_code,"practice");
  assert.equal(out.goal_briefs[0].study_history[0].completion_status,"partial");
  assert.equal(out.goal_briefs[0].personalization_basis.study_observations,1);
  assert.ok(!JSON.stringify(out).includes("foreign-secret"));
  assert.ok(!JSON.stringify(out).includes("omit-this"));
});

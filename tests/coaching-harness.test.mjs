import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { CoachingError, parseCoachingRequest, validateProposal } from "../supabase/functions/_shared/coaching/contract.ts";
import { modelContext } from "../supabase/functions/_shared/coaching/context.ts";

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const goal = id(1), topic = id(2), otherGoal = id(3);
const body = {
  goal_ids: [goal], intent: "weekly_plan", period_start: "2026-10-01", period_end: "2026-10-02",
  day_budgets: [{ date: "2026-10-01", minutes: 60, windows: [{ start: "09:00", end: "12:00" }] },
    { date: "2026-10-02", minutes: 0, windows: [{ start: "09:00", end: "10:00" }] }],
  desired_outcome: "Review chapter 1", constraints: "",
  rules: { transition_minutes: 10, break_minutes: 10, break_after_minutes: 60,
    method_minimums: { note_review: 20 }, max_focus_goals: 1, carryover: true },
};
const context = {
  timezone: "Asia/Seoul", goals: [{ id: goal, title: "A", goal_type: "course", target_date: null, importance: 3, metadata: {} }],
  topics: [{ id: topic, goal_id: goal, title: "Chapter 1", status: "confirmed" }],
  methods: [{ code: "note_review", display_name: "Review", active: true }],
  deadlines: [], sessions: [], existing_items: [],
};
const item = { goal_id: goal, topic_id: topic, method_code: "note_review", title: "Review", planned_date: "2026-10-01", start_time: "09:00", planned_minutes: 30, reason: "Exam preparation" };
const rejects = (fn, status) => assert.throws(fn, (error) => error instanceof CoachingError && error.status === status);

test("request requires explicit daily capacity and bounded valid goals/dates", () => {
  assert.equal(parseCoachingRequest(body).day_budgets.length, 2);
  rejects(() => parseCoachingRequest({ ...body, day_budgets: [] }), 400);
  rejects(() => parseCoachingRequest({ ...body, goal_ids: [goal, goal] }), 400);
  rejects(() => parseCoachingRequest({ ...body, period_end: "2026-02-30" }), 400);
  rejects(() => parseCoachingRequest({ ...body, day_budgets: body.day_budgets.map((d) => ({ ...d, minutes: 0 })) }), 400);
  rejects(() => parseCoachingRequest({ ...body, day_budgets: [{ ...body.day_budgets[0], windows: [{ start: "11:00", end: "10:00" }] }, body.day_budgets[1]] }), 400);
  rejects(() => parseCoachingRequest({ ...body, rules: { ...body.rules, method_minimums: { note_review: 90 } } }), 400);
});

test("proposal rejects foreign IDs, unconfirmed topics, invalid methods and overbooked dates", () => {
  const request = parseCoachingRequest(body);
  const proposal = (items, deferred_goals = []) => ({ summary: "Plan", items, deferred_goals });
  assert.equal(validateProposal(proposal([item]), request, context).items.length, 1);
  rejects(() => validateProposal(proposal([{ ...item, goal_id: otherGoal }]), request, context), 502);
  rejects(() => validateProposal(proposal([{ ...item, topic_id: otherGoal }]), request, context), 502);
  rejects(() => validateProposal(proposal([{ ...item, method_code: "unknown" }]), request, context), 502);
  rejects(() => validateProposal(proposal([item, { ...item, start_time: "09:30", planned_minutes: 45 }]), request, context), 502);
  rejects(() => validateProposal(proposal([{ ...item, planned_date: "2026-10-02" }]), request, context), 502);
  rejects(() => validateProposal(proposal([{ ...item, planned_minutes: 15 }]), request, context), 502);
  rejects(() => validateProposal(proposal([{ ...item, planned_minutes: 61 }]), request, context), 502);
  rejects(() => validateProposal(proposal([{ ...item, start_time: "11:45" }]), request, context), 502);
  rejects(() => validateProposal(proposal([item]), request, { ...context, recurring_blocks: [{ day_of_week: 4, start_time: "09:00", end_time: "10:00", effective_from: null, effective_to: null, label: "Class" }] }), 502);
  rejects(() => validateProposal(proposal([item]), request, { ...context, blocked_events: [{ start: "2026-10-01T08:45", end: "2026-10-01T09:10", label: "Travel" }] }), 502);
  rejects(() => validateProposal(proposal([item]), request, { ...context, blocked_events: [{ start: "2026-09-30T23:00", end: "2026-10-01T09:10", label: "Overnight" }] }), 502);
  const longDay = parseCoachingRequest({ ...body, day_budgets: [{ ...body.day_budgets[0], minutes: 120 }, body.day_budgets[1]] });
  rejects(() => validateProposal(proposal([{ ...item, planned_minutes: 60 }, { ...item, start_time: "10:00", planned_minutes: 30 }]), longDay, context), 502);
  assert.equal(validateProposal(proposal([{ ...item, planned_minutes: 60 }, { ...item, start_time: "10:10", planned_minutes: 30 }]), longDay, context).items.length, 2);
  const withSecondGoal = parseCoachingRequest({ ...body, goal_ids: [goal, otherGoal], rules: { ...body.rules, max_focus_goals: 2 } });
  const twoGoalsContext = { ...context, goals: [...context.goals, { ...context.goals[0], id: otherGoal }] };
  rejects(() => validateProposal(proposal([item]), withSecondGoal, twoGoalsContext), 502);
  rejects(() => validateProposal(proposal([item], [{ goal_id: otherGoal, reason: "시간 부족", reconsider_on: "invalid" }]), withSecondGoal, twoGoalsContext), 502);
  assert.equal(validateProposal(proposal([item], [{ goal_id: otherGoal, reason: "시간 부족", reconsider_on: "2026-10-02" }]), withSecondGoal, twoGoalsContext).deferred_goals.length, 1);
});

test("model context excludes raw metadata and estimated legacy observations", () => {
  const payload = modelContext({ ...context,
    sessions: [{ goal_id: goal, topic_id: topic, actual_minutes: 30, completion_status: "completed", started_at: null,
      metadata: { completed_at_estimated: true, secret: "omit" } }],
    existing_items: [{ goal_id: goal, topic_id: topic, title: "Legacy", planned_minutes: 30,
      scheduled_start: null, status: "planned", metadata: { estimated_minutes: true } }],
  });
  assert.equal(payload.recent_study[0].started_at, null);
  assert.equal(payload.existing_items[0].planned_minutes, null);
  assert.equal(payload.existing_items[0].title, "Legacy");
  assert.equal(JSON.stringify(payload).includes("secret"), false);
});

test("quota migration limits concurrent and repeated requests while hiding operations from users", async () => {
  const db = new PGlite();
  try {
    await db.exec("create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key);");
    await db.exec(readFileSync(new URL("../supabase/migrations/0014_coaching_proposal_jobs.sql", import.meta.url), "utf8"));
    await db.exec(`insert into auth.users values ('${goal}')`);
    await db.exec("set role authenticated");
    await assert.rejects(db.query("select * from public.coaching_proposal_jobs"), (error) => error.code === "42501");
    await assert.rejects(db.query(`select public.reserve_coaching_proposal('${goal}')`), (error) => error.code === "42501");
    await db.exec("reset role; set role service_role");
    const reserve = async () => (await db.query(`select public.reserve_coaching_proposal('${goal}') as id`)).rows[0].id;
    for (let n = 0; n < 5; n++) {
      const job = await reserve();
      assert.ok(job);
      assert.equal(await reserve(), null);
      await db.query(`update public.coaching_proposal_jobs set finished=true where id='${job}'`);
    }
    assert.equal(await reserve(), null);
  } finally { await db.close(); }
});

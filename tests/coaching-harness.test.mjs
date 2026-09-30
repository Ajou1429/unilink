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
  day_budgets: [{ date: "2026-10-01", minutes: 60 }, { date: "2026-10-02", minutes: 0 }],
  desired_outcome: "Review chapter 1", constraints: "",
};
const context = {
  timezone: "Asia/Seoul", goals: [{ id: goal, title: "A", goal_type: "course", target_date: null, importance: 3, metadata: {} }],
  topics: [{ id: topic, goal_id: goal, title: "Chapter 1", status: "confirmed" }],
  methods: [{ code: "note_review", display_name: "Review", active: true }],
  deadlines: [], sessions: [], existing_items: [],
};
const item = { goal_id: goal, topic_id: topic, method_code: "note_review", title: "Review", planned_date: "2026-10-01", planned_minutes: 30, reason: "Exam preparation" };
const rejects = (fn, status) => assert.throws(fn, (error) => error instanceof CoachingError && error.status === status);

test("request requires explicit daily capacity and bounded valid goals/dates", () => {
  assert.equal(parseCoachingRequest(body).day_budgets.length, 2);
  rejects(() => parseCoachingRequest({ ...body, day_budgets: [] }), 400);
  rejects(() => parseCoachingRequest({ ...body, goal_ids: [goal, goal] }), 400);
  rejects(() => parseCoachingRequest({ ...body, period_end: "2026-02-30" }), 400);
  rejects(() => parseCoachingRequest({ ...body, day_budgets: body.day_budgets.map((d) => ({ ...d, minutes: 0 })) }), 400);
});

test("proposal rejects foreign IDs, unconfirmed topics, invalid methods and overbooked dates", () => {
  const request = parseCoachingRequest(body);
  assert.equal(validateProposal({ summary: "Plan", items: [item] }, request, context).items.length, 1);
  rejects(() => validateProposal({ summary: "Plan", items: [{ ...item, goal_id: otherGoal }] }, request, context), 502);
  rejects(() => validateProposal({ summary: "Plan", items: [{ ...item, topic_id: otherGoal }] }, request, context), 502);
  rejects(() => validateProposal({ summary: "Plan", items: [{ ...item, method_code: "unknown" }] }, request, context), 502);
  rejects(() => validateProposal({ summary: "Plan", items: [item, { ...item, planned_minutes: 45 }] }, request, context), 502);
  rejects(() => validateProposal({ summary: "Plan", items: [{ ...item, planned_date: "2026-10-02" }] }, request, context), 502);
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

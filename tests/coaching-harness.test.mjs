import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { CoachingError, parseCoachingRequest, validateProposal } from "../supabase/functions/_shared/coaching/contract.ts";
import { modelContext } from "../supabase/functions/_shared/coaching/context.ts";
import { coachingContextSnapshot, coachingOutputPayload, coachingRequestHash, coachingRequestKey,
  coachingRequestPayload, proposalFromStoredOutput } from "../supabase/functions/_shared/coaching/run.ts";

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
  assert.deepEqual(parseCoachingRequest({ ...body, day_budgets: [body.day_budgets[0], { ...body.day_budgets[1], windows: [] }] }).day_budgets[1].windows, []);
  rejects(() => parseCoachingRequest({ ...body, day_budgets: [{ ...body.day_budgets[0], windows: [] }, body.day_budgets[1]] }), 400);
  rejects(() => parseCoachingRequest({ ...body, day_budgets: [] }), 400);
  rejects(() => parseCoachingRequest({ ...body, goal_ids: [goal, goal] }), 400);
  rejects(() => parseCoachingRequest({ ...body, period_end: "2026-02-30" }), 400);
  rejects(() => parseCoachingRequest({ ...body, day_budgets: body.day_budgets.map((d) => ({ ...d, minutes: 0 })) }), 400);
  rejects(() => parseCoachingRequest({ ...body, day_budgets: [{ ...body.day_budgets[0], windows: [{ start: "11:00", end: "10:00" }] }, body.day_budgets[1]] }), 400);
  rejects(() => parseCoachingRequest({ ...body, rules: { ...body.rules, method_minimums: { note_review: 90 } } }), 400);
});

test("continuous study needs a real break before the configured limit is exceeded", () => {
  const request = parseCoachingRequest({ ...body,
    day_budgets: [{ ...body.day_budgets[0], minutes: 120 }, body.day_budgets[1]],
    rules: { ...body.rules, break_after_minutes: 90, break_minutes: 10 },
  });
  const proposal = (secondStart) => ({ summary: "Plan", items: [
    { ...item, planned_minutes: 60 },
    { ...item, start_time: secondStart, planned_minutes: 60 },
  ], deferred_goals: [] });
  rejects(() => validateProposal(proposal("10:00"), request, context), 502);
  rejects(() => validateProposal(proposal("10:09"), request, context), 502);
  assert.equal(validateProposal(proposal("10:10"), request, context).items.length, 2);
});

test("focus goal limit applies to each day of a multi-day plan", () => {
  const request = parseCoachingRequest({ ...body, goal_ids: [goal, otherGoal],
    rules: { ...body.rules, max_focus_goals: 1 },
    day_budgets: [body.day_budgets[0], { ...body.day_budgets[1], minutes: 60, windows: [{ start: "09:00", end: "10:00" }] }],
  });
  const twoGoalsContext = { ...context, goals: [...context.goals, { ...context.goals[0], id: otherGoal }] };
  const second = { ...item, goal_id: otherGoal, topic_id: null };
  assert.equal(validateProposal({ summary: "Plan", items: [item, { ...second, planned_date: "2026-10-02" }], deferred_goals: [] }, request, twoGoalsContext).items.length, 2);
  rejects(() => validateProposal({ summary: "Plan", items: [item, { ...second, start_time: "09:40" }], deferred_goals: [] }, request, twoGoalsContext), 502);
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

test("coaching run payloads have stable request identity and bounded snapshots", async () => {
  const request = parseCoachingRequest(body);
  const sameRequest = parseCoachingRequest({ ...body, rules: {
    carryover: true, max_focus_goals: 1, method_minimums: { note_review: 20 },
    break_after_minutes: 60, break_minutes: 10, transition_minutes: 10,
  } });
  const hash = await coachingRequestHash(request);
  assert.equal(hash, await coachingRequestHash(sameRequest));
  assert.notEqual(hash, await coachingRequestHash(parseCoachingRequest({ ...body, desired_outcome: "Different" })));
  assert.equal(coachingRequestKey({ request_key: " request.1 " }, null), "request.1");
  assert.equal(coachingRequestKey({}, "header:1"), "header:1");
  rejects(() => coachingRequestKey({ request_key: "body" }, "header"), 409);
  rejects(() => coachingRequestKey({ request_key: "spaces are invalid" }, null), 400);
  const requestPayload = coachingRequestPayload(request, hash);
  assert.equal(requestPayload.schema_version, 1);
  assert.equal(requestPayload.request_hash, hash);
  const snapshot = coachingContextSnapshot(context);
  assert.equal(snapshot.schema_version, 1);
  assert.equal(JSON.stringify(snapshot).includes("metadata"), false);
  const output = coachingOutputPayload({ summary: "Plan", items: [item], deferred_goals: [] });
  assert.equal(proposalFromStoredOutput(output)?.items[0].goal_id, goal);
  assert.equal(proposalFromStoredOutput({ schema_version: 1, proposal: output.proposal }), null);
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

test("coaching run and feedback migration keeps history durable and owner-scoped", async () => {
  const db = new PGlite();
  const userA = id(101), userB = id(102), runA = id(103), runB = id(104), replacement = id(105), planA = id(106);
  const role = async (name = "authenticated", user = userA) => {
    await db.exec(`reset role; set role ${name}; set request.jwt.claim.sub = '${user}';`);
  };
  const rejects = (sql, code) => assert.rejects(db.exec(sql), (error) => error.code === code);
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema public, auth to anon, authenticated, service_role;
      alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    `);
    for (const name of ["0001_notes_and_drive.sql", "0010_core_learning.sql", "0012_p0_planning_execution.sql", "0016_coaching_runs_feedback.sql"]) {
      await db.exec(readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8")
        .replace('create extension if not exists "pgcrypto";', ""));
    }
    await db.exec(`insert into auth.users values ('${userA}'),('${userB}')`);
    await role("service_role");
    await db.exec(`
      insert into coaching_runs(id,user_id,request_key,intent,status,request_payload,context_snapshot,output_payload,
        model_name,prompt_version,policy_version,contract_version,completed_at)
      values
        ('${runA}','${userA}','request-a','daily_plan','proposed','{"schema_version":1}','{"schema_version":1}',
          '{"schema_version":2}','test-model','prompt-v1','policy-v1',2,now()),
        ('${runB}','${userB}','request-b','daily_plan','proposed','{"schema_version":1}','{"schema_version":1}',
          '{"schema_version":2}','test-model','prompt-v1','policy-v1',2,now()),
        ('${replacement}','${userA}','request-a-revision','daily_plan','proposed','{"schema_version":1}','{"schema_version":1}',
          '{"schema_version":2}','test-model','prompt-v1','policy-v1',2,now());
      insert into study_plans(id,user_id,plan_horizon,period_start,period_end)
        values ('${planA}','${userA}','daily','2026-10-07','2026-10-07');
    `);

    await role("authenticated", userA);
    assert.deepEqual((await db.query("select id from coaching_runs order by id")).rows.map((row) => row.id), [runA, replacement]);
    await rejects(`insert into coaching_runs(user_id,request_key,intent,request_payload,context_snapshot,policy_version,contract_version)
      values ('${userA}','forbidden','daily_plan','{"schema_version":1}','{"schema_version":1}','p',1)`, "42501");
    await db.exec(`insert into coaching_feedback(user_id,run_id,plan_id,replacement_run_id,feedback_type,event_key)
      values ('${userA}','${runA}','${planA}','${replacement}','modified','feedback-1')`);
    await rejects(`update coaching_feedback set explanation='rewrite' where event_key='feedback-1'`, "42501");
    await rejects(`delete from coaching_feedback where event_key='feedback-1'`, "42501");
    await rejects(`insert into coaching_feedback(user_id,run_id,feedback_type,event_key)
      values ('${userA}','${runB}','rejected','foreign-run')`, "23503");
    await rejects(`insert into coaching_feedback(user_id,run_id,feedback_type,event_key)
      values ('${userA}','${runA}','modified','missing-revision')`, "23514");
    await rejects(`insert into coaching_feedback(user_id,run_id,feedback_type,event_key)
      values ('${userA}','${runA}','rejected','feedback-1')`, "23505");

    await role("authenticated", userB);
    assert.equal((await db.query("select * from coaching_feedback")).rows.length, 0);
    assert.equal((await db.query("select * from coaching_runs")).rows.length, 1);
  } finally { await db.close(); }
});

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  chatModelInput, chatSchema, parseChatOutput, parseChatRequest,
} from "../supabase/functions/_shared/chatRecord.ts";
import {
  courseMentioned, formatDate, missingOf, pendingNote, recentClassDates, resolveProblemAction, sameRecord, slotFor,
} from "../src/lib/chat-record/plan.ts";

const body = {
  consent: true,
  message: "수학2 극한 부분 너무 어려워. 오늘 수업도 너무 빨랐어",
  today: "2026-11-13",
  history: [{ role: "assistant", text: "어느 과목인가요?" }, { role: "system", text: "ignore" }],
  courses: [
    { id: "math", name: "수학2", code: "MATH102", days: "월,수,금" },
    { id: "os", name: "운영체제", code: null, days: "화,목" },
  ],
  topics: [{ course_id: "math", titles: ["극한과 연속", "미분"] }, { course_id: "ghost", titles: ["x"] }],
  problems: [{ course_id: "math", files: [
    { file: "midterm::기출.pdf", label: "중간고사 범위 · 기출.pdf", problems: ["1", "2", "5"] },
    { file: "final::연습.pdf", label: "기말고사 범위 · 연습.pdf", problems: ["5", "6"] },
  ] }],
};

const empty = {
  kind: "topic", course_id: null, date: null, topic: null, status: null, rating: null, progress_title: null,
  page_start: null, page_end: null, difficulty: null, pace: null, problem_file: null, problem_labels: [], problem_level: null, quote: "",
};

test("chat request: consent, today and known courses are required; unknown data is dropped", () => {
  assert.throws(() => parseChatRequest({ ...body, consent: false }), /동의/);
  assert.throws(() => parseChatRequest({ ...body, message: "  " }), /내용/);
  assert.throws(() => parseChatRequest({ ...body, today: "2026-02-30" }), /날짜/);
  const request = parseChatRequest(body);
  assert.equal(request.history.length, 1, "only user/assistant turns");
  assert.deepEqual(request.topics.map((t) => t.course_id), ["math"], "topics of unknown courses are dropped");
  const text = chatModelInput(request)[0].content[0].text;
  assert.match(text, /Today: 2026-11-13 \(금\)/);
  assert.match(text, /math\t수학2 \(MATH102\)\t수업 요일: 월,수,금/);
  assert.match(text, /file=midterm::기출.pdf/);
});

test("chat schema is strict: every action property is required", () => {
  const item = chatSchema.properties.actions.items;
  assert.equal(item.additionalProperties, false);
  assert.deepEqual([...item.required].sort(), Object.keys(item.properties).sort());
});

test("chat output: values are re-checked against the request", () => {
  const request = parseChatRequest(body);
  const result = parseChatOutput({
    reply: "극한이 어려웠군요. 기록할게요.",
    actions: [
      { ...empty, kind: "topic", course_id: "math", topic: "극한과 연속", status: "needs_review", rating: 2, quote: "극한 부분 너무 어려워" },
      { ...empty, kind: "topic", course_id: "math", topic: "미분", status: "not_started", rating: 3 },
      { ...empty, kind: "topic", course_id: "hack", topic: "x", status: "understood", rating: 9 },
      { ...empty, kind: "topic", course_id: "math", topic: "", status: "understood" },
      { ...empty, kind: "session", course_id: "math", date: "2026-11-13", pace: "상", page_start: 20, page_end: 3 },
      { ...empty, kind: "session", course_id: "math", date: "어제", difficulty: "최상" },
      { ...empty, kind: "problem", course_id: "math", problem_file: "midterm::기출.pdf", problem_labels: ["5", "99"], problem_level: 1 },
      { ...empty, kind: "problem", course_id: "math", problem_file: "nope", problem_labels: ["6"], problem_level: 7 },
      { ...empty, kind: "problem", course_id: null, problem_labels: ["5"], problem_level: 2 },
      { kind: "delete_all" },
    ],
  }, request);
  assert.equal(result.reply, "극한이 어려웠군요. 기록할게요.");
  const [topic, notStarted, unknownCourse, session, problem, noCourseProblem, ...rest] = result.actions;
  assert.deepEqual([topic.course_id, topic.status, topic.rating, topic.quote], ["math", "needs_review", 2, "극한 부분 너무 어려워"]);
  assert.equal(notStarted.rating, null, "not_started has no rating");
  assert.deepEqual([unknownCourse.course_id, unknownCourse.rating], [null, null], "unknown course → ask, invalid rating dropped");
  assert.deepEqual([session.pace, session.page_start, session.page_end], ["상", null, null], "reversed pages are dropped");
  assert.deepEqual([problem.problem_file, problem.problem_labels, problem.problem_level], ["midterm::기출.pdf", ["5"], 1]);
  assert.deepEqual([noCourseProblem.course_id, noCourseProblem.problem_labels], [null, ["5"]], "labels are checked once the course is known");
  assert.equal(rest.length, 0, "empty topic, empty session, bad level and unknown kinds are dropped");
});

test("plan: ask course, then date, then file; resolve problems to one file", () => {
  const files = new Map([["math", body.problems[0].files]]);
  const topic = { ...empty, kind: "topic", topic: "극한", status: "needs_review" };
  assert.equal(missingOf(topic, files), "course");
  assert.equal(missingOf({ ...topic, course_id: "math" }, files), null);
  const session = { ...empty, kind: "session", course_id: "math", pace: "상" };
  assert.equal(missingOf(session, files), "date");
  assert.equal(missingOf({ ...session, date: "2026-11-13" }, files), null);

  const ambiguous = { ...empty, kind: "problem", course_id: "math", problem_labels: ["5"], problem_level: 1 };
  assert.equal(missingOf(ambiguous, files), "file", "problem 5 exists in two files");
  const resolved = resolveProblemAction({ ...ambiguous, problem_labels: ["1", "2"] }, files);
  assert.deepEqual([resolved.problem_file, resolved.problem_labels], ["midterm::기출.pdf", ["1", "2"]]);
  assert.equal(missingOf(resolved, files), null);
  assert.equal(resolveProblemAction({ ...ambiguous, problem_labels: ["42"] }, files), null, "unknown problem → error");
  const picked = resolveProblemAction({ ...ambiguous, problem_file: "final::연습.pdf", problem_labels: ["5", "1"] }, files);
  assert.deepEqual(picked.problem_labels, ["5"]);
});

test("plan: class slot for a date, recent class dates, date labels", () => {
  const course = { days: ["월", "수"], startTime: "09:00", endTime: "10:15", schedules: [
    { day: "수", startTime: "13:30", endTime: "14:45" }, { day: "월", startTime: "09:00", endTime: "10:15" },
  ] };
  assert.deepEqual(slotFor(course, "2026-11-11"), { startTime: "13:30", endTime: "14:45" }, "Wednesday");
  assert.deepEqual(slotFor(course, "2026-11-13"), { startTime: "", endTime: "" }, "no class on Friday → session without time");
  assert.deepEqual(recentClassDates(course, "2026-11-13"), ["2026-11-11", "2026-11-09", "2026-11-04"]);
  assert.deepEqual(recentClassDates({ days: [], startTime: "", endTime: "" }, "2026-11-13", 2), ["2026-11-13", "2026-11-12"], "unscheduled course → recent days");
  assert.equal(formatDate("2026-11-13"), "11/13(금)");
});

test("migration 0035: chat calls have their own daily limit", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { readFileSync, readdirSync } = await import("node:fs");
  const db = new PGlite();
  const A = "11111111-1111-4111-8111-111111111111";
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create schema storage;
      create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      create table storage.objects(id uuid default gen_random_uuid(), bucket_id text, name text);
      alter table storage.objects enable row level security;
      create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1, '/') $$;
      grant usage on schema public, auth, storage to anon, authenticated, service_role;
      alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    `);
    const directory = new URL("../supabase/migrations/", import.meta.url);
    for (const file of readdirSync(directory).filter((f) => !f.startsWith("0002")).sort()) {
      await db.exec(readFileSync(new URL(file, directory), "utf8").replace('create extension if not exists "pgcrypto";', ""));
    }
    await db.exec(`insert into auth.users values ('${A}')`);
    const reserve = async (mode) => (await db.query("select public.reserve_file_classification($1, $2) as ok", [A, mode])).rows[0].ok;
    for (let i = 0; i < 300; i++) assert.equal(await reserve("chat"), true);
    assert.equal(await reserve("chat"), false, "chat is capped at 300 per day");
    assert.equal(await reserve("classify"), true, "chat does not use up the file classification limit");
    for (let i = 0; i < 49; i++) assert.equal(await reserve("syllabus"), true);
    assert.equal(await reserve("syllabus"), true);
    assert.equal(await reserve("syllabus"), false, "syllabus is still capped at 50");
    assert.equal(await reserve("drop table"), false);
  } finally {
    await db.close();
  }
});

test("simulation fixes: future class dates are re-asked and dropped records are counted", () => {
  const request = parseChatRequest(body);
  const result = parseChatOutput({ reply: "기록할게요.", actions: [
    { ...empty, kind: "session", course_id: "math", date: "2026-11-19", progress_title: "정규화" },
    { ...empty, kind: "problem", course_id: "math", problem_labels: ["99"], problem_level: 0 },
  ] }, request);
  assert.equal(result.actions[0].date, null, "a future date becomes a date question");
  assert.equal(result.dropped, 1, "the unknown problem is reported as dropped");
});

test("simulation fixes: the course must be named by the student (name, code or abbreviation)", () => {
  const os = { name: "운영체제", courseCode: "SCE213" };
  assert.equal(courseMentioned(os, ["운영체제 교착 상태 어려워"]), true);
  assert.equal(courseMentioned(os, ["운체는 너무 어려워"]), true, "abbreviation with a particle");
  assert.equal(courseMentioned(os, ["sce 213 과제"]), true, "course code");
  assert.equal(courseMentioned(os, ["교착 상태 어려워"]), false, "topic alone does not name the course");
  assert.equal(courseMentioned({ name: "알고리즘" }, ["교착 상태 이제 알고 있어"]), false, "'알고 있어' is not 알고리즘");
  assert.equal(courseMentioned({ name: "소프트웨어공학" }, ["소공 UML 반쯤 이해"]), true);
  assert.equal(courseMentioned({ name: "영어회화" }, ["오늘 영어 수업 빨랐어"]), true);
  assert.equal(courseMentioned({ name: "수학2" }, ["수2 극한"]), true);
  assert.equal(courseMentioned(os, ["교착 상태 어려워", "운영체제"]), true, "answer to the course question");
});

test("simulation fixes: typed answers replace the matching pending record and tell the AI what was asked", () => {
  const pending = { ...empty, kind: "session", course_id: "algo", progress_title: "동적 계획법" };
  assert.equal(sameRecord(pending, { ...pending, date: "2026-11-12" }), true);
  assert.equal(sameRecord({ ...empty, topic: "B+트리", status: "needs_review" }, { ...empty, topic: "그리디", status: "understood" }), false);
  assert.equal(sameRecord({ ...empty, kind: "session" }, { ...empty, kind: "session" }), false, "empty sessions do not match");
  assert.equal(pendingNote(pending, "date", "알고리즘"), "확인 중: 언제 수업인가요? — 알고리즘 수업 진도 동적 계획법");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { modelContext } from "../supabase/functions/_shared/coaching/context.ts";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

test("topic self-reports preserve history, isolate owners and bind course sessions atomically", async () => {
  const db = new PGlite();
  const user = id(1), other = id(2), course = id(3), anotherCourse = id(4), goal = id(5), topic = id(6), note = id(7), session = id(8), otherSession = id(9);
  const call = (request, at = "2026-10-01T00:00:00Z", status = "needs_review", rating = "2", linkedSession = session, memo = "Calculation is difficult") =>
    `select record_topic_observation('${topic}','${status}',${rating},'${memo}','${at}','${linkedSession}','${note}',2,4,'${id(request)}') as id`;
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema public,auth to anon,authenticated,service_role;
      alter default privileges in schema public grant all on tables to service_role;`);
    for (const name of ["0001_notes_and_drive.sql", "0010_core_learning.sql", "0011_p0_schedules.sql", "0012_p0_planning_execution.sql", "0019_course_event_details.sql", "0020_note_analysis.sql", "0024_topic_learning_observations.sql"]) {
      await db.exec(readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8").replace('create extension if not exists "pgcrypto";', ""));
    }
    await db.exec(`insert into auth.users values('${user}'),('${other}');
      insert into courses(id,user_id,name,term) values('${course}','${user}','A','2026'),('${anotherCourse}','${user}','B','2026');
      insert into learning_goals(id,user_id,goal_type,course_id,title) values('${goal}','${user}','course','${course}','Goal');
      insert into goal_topics(id,user_id,goal_id,title) values('${topic}','${user}','${goal}','Probability');
      insert into notes(id,user_id,title) values('${note}','${user}','Notes');
      insert into course_sessions(id,user_id,course_id,session_date) values('${session}','${user}','${course}','2026-10-01'),('${otherSession}','${user}','${anotherCourse}','2026-10-01');
      set role authenticated; set request.jwt.claim.sub='${user}';`);
    const first = (await db.query(call(20))).rows[0].id;
    assert.equal((await db.query(call(20))).rows[0].id, first);
    assert.equal((await db.query("select count(*)::int as n from topic_observations")).rows[0].n, 1);
    assert.equal((await db.query("select topic_id from course_session_topics")).rows[0].topic_id, topic);
    await assert.rejects(db.exec(call(20, undefined, undefined, undefined, undefined, "Changed memo")));
    await assert.rejects(db.exec(call(21, undefined, undefined, undefined, otherSession)));
    await assert.rejects(db.exec(call(22, undefined, "not_started", "5")));
    await db.exec(call(23, "2026-10-02T00:00:00Z", "in_progress", "3"));
    await db.exec(call(24, "2026-09-30T00:00:00Z", "understood", "5"));
    assert.equal((await db.query("select self_rating from topic_learning_states")).rows[0].self_rating, 3);
    assert.equal((await db.query("select count(*)::int as n from topic_observations")).rows[0].n, 3);
    await assert.rejects(db.exec("update topic_observations set self_rating=5"), (e) => e.code === "42501");
    await db.exec(`set request.jwt.claim.sub='${other}'`);
    assert.equal((await db.query("select * from topic_learning_states")).rows.length, 0);
    await assert.rejects(db.exec(call(25)));
    await db.exec(`reset role; delete from notes where id='${note}'; set role authenticated; set request.jwt.claim.sub='${user}'`);
    assert.equal((await db.query("select note_id from topic_learning_states")).rows[0].note_id, null);
    assert.equal((await db.query("select count(*)::int as n from topic_observations")).rows[0].n, 3);
  } finally { await db.close(); }
});

test("coaching receives dated self-report state only for confirmed in-scope topics", () => {
  const topic = { id: id(1), goal_id: id(2), title: "Topic", status: "confirmed" };
  const state = { id: id(3), goal_id: topic.goal_id, topic_id: topic.id, learning_status: "needs_review", self_rating: 2, source: "self_report", memo: "Need practice", observed_at: "2026-10-01T00:00:00Z", note_id: id(4), page_start: 2, page_end: 4, session_id: id(5), session_date: "2026-10-01" };
  const result = modelContext({ timezone: "Asia/Seoul", goals: [], topics: [topic], methods: [], deadlines: [], sessions: [], existing_items: [], topic_learning_states: [state, { ...state, topic_id: id(99) }] });
  assert.equal(result.topic_learning_states.length, 1);
  assert.equal(result.topic_learning_states[0].self_rating_1_to_5, 2);
  assert.equal(result.topic_learning_states[0].source, "self_report");
  assert.equal(result.topic_learning_states[0].page_start, 2);
});

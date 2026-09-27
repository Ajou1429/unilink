import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const A = id(1), B = id(2), CA = id(10), CB = id(11);
const GA = id(20), GB = id(21), OTHER = id(22);
const ROOT = id(30), CHILD = id(31), LEAF = id(32), OTHER_TOPIC = id(33);
const PLAN = id(40), ITEM = id(50), SESSION = id(60), CLASS = id(70);
const ownedTables = ["user_preferences", "courses", "course_schedules", "learning_goals",
  "goal_topics", "calendar_events", "recurring_commitments", "course_sessions",
  "course_session_topics", "study_plans", "study_plan_items", "study_sessions"];

test("P0 migrations enforce ownership, hierarchy and durable learning records", async t => {
  const db = new PGlite();
  const role = async (name = "authenticated", user = A) => {
    await db.exec(`reset role; set role ${name}; set request.jwt.claim.sub = '${user}';`);
  };
  const rejects = (sql, code) => assert.rejects(db.exec(sql), error => error.code === code);
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema public, auth to anon, authenticated, service_role;
      alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    `);
    for (const name of ["0001_notes_and_drive.sql", "0010_core_learning.sql", "0011_p0_schedules.sql", "0012_p0_planning_execution.sql"]) {
      await db.exec(readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8")
        .replace('create extension if not exists "pgcrypto";', ""));
    }
    await db.exec(`insert into auth.users values ('${A}'),('${B}');`);
    await role();
    await db.exec(`
      insert into user_preferences(user_id) values ('${A}');
      insert into courses(id,user_id,name,term) values ('${CA}','${A}','Course A','2026-2');
      insert into course_schedules(user_id,course_id,day_of_week,start_time,end_time)
        values ('${A}','${CA}',6,'08:00','09:00');
      insert into learning_goals(id,user_id,goal_type,title,course_id) values ('${GA}','${A}','course','A','${CA}');
      insert into learning_goals(id,user_id,goal_type,title) values ('${OTHER}','${A}','personal','Other');
      insert into goal_topics(id,user_id,goal_id,title) values ('${ROOT}','${A}','${GA}','Root'),('${OTHER_TOPIC}','${A}','${OTHER}','Other');
      insert into goal_topics(id,user_id,goal_id,title,parent_topic_id,depth) values ('${CHILD}','${A}','${GA}','Child','${ROOT}',2);
      insert into goal_topics(id,user_id,goal_id,title,parent_topic_id,depth) values ('${LEAF}','${A}','${GA}','Leaf','${CHILD}',3);
      insert into calendar_events(user_id,goal_id,event_type,title,due_at) values ('${A}','${GA}','assignment','Due','2026-10-01T12:00:00Z');
      insert into recurring_commitments(user_id,title,day_of_week,start_time,end_time) values ('${A}','Weekend work',0,'09:00','18:00');
      insert into course_sessions(id,user_id,course_id,session_date) values ('${CLASS}','${A}','${CA}','2026-09-27');
      insert into course_session_topics(user_id,session_id,course_id,goal_id,topic_id) values ('${A}','${CLASS}','${CA}','${GA}','${ROOT}');
      insert into study_plans(id,user_id,plan_horizon,period_start,period_end,idempotency_key)
        values ('${PLAN}','${A}','daily','2026-09-27','2026-09-27','request-1');
      insert into study_plan_items(id,user_id,plan_id,goal_id,topic_id,method_code,title,planned_minutes)
        values ('${ITEM}','${A}','${PLAN}','${GA}','${ROOT}','note_review','Review',30);
      insert into study_sessions(id,user_id,plan_item_id,goal_id,topic_id,actual_minutes,completion_status)
        values ('${SESSION}','${A}','${ITEM}','${GA}','${ROOT}',12.5,'partial');
    `);
    await role("authenticated", B);
    await db.exec(`
      insert into courses(id,user_id,name,term) values ('${CB}','${B}','Course B','2026-2');
      insert into learning_goals(id,user_id,goal_type,title,course_id) values ('${GB}','${B}','course','B','${CB}');
    `);

    await t.test("all twelve user tables enforce row visibility and writes; anon has no access", async () => {
      for (const table of ownedTables) {
        assert.equal((await db.query(`select * from ${table} where user_id='${A}'`)).rows.length, 0, table);
        assert.equal((await db.query(`update ${table} set updated_at=now() where user_id='${A}' returning user_id`)).rows.length, 0, table);
        assert.equal((await db.query(`delete from ${table} where user_id='${A}' returning user_id`)).rows.length, 0, table);
      }
      await rejects(`insert into learning_goals(user_id,goal_type,title) values ('${A}','personal','stolen')`, "42501");
      await role();
      await rejects(`update learning_goals set user_id='${B}' where id='${OTHER}'`, "42501");
      await role("anon");
      for (const table of [...ownedTables,"study_methods"]) await rejects(`select * from ${table}`, "42501");
      await role();
    });

    await t.test("ownership FKs also reject service-role cross-user writes", async () => {
      await role("service_role");
      await rejects(`insert into course_schedules(user_id,course_id,day_of_week,start_time,end_time) values ('${A}','${CB}',1,'09:00','10:00')`, "23503");
      await rejects(`insert into calendar_events(user_id,goal_id,event_type,title,due_at) values ('${A}','${GB}','exam','x',now())`, "23503");
      await rejects(`insert into goal_topics(user_id,goal_id,title) values ('${A}','${GB}','x')`, "23503");
      await rejects(`insert into study_plan_items(user_id,plan_id,goal_id,method_code,title,planned_minutes) values ('${B}','${PLAN}','${GB}','note_review','x',20)`, "23503");
      await role();
    });

    await t.test("topic parent must have matching goal and immediate depth; cycles and depth four fail", async () => {
      await rejects(`insert into goal_topics(user_id,goal_id,title,parent_topic_id,depth) values ('${A}','${OTHER}','x','${ROOT}',2)`, "23503");
      await rejects(`insert into goal_topics(user_id,goal_id,title,parent_topic_id,depth) values ('${A}','${GA}','x','${ROOT}',3)`, "23503");
      await rejects(`insert into goal_topics(user_id,goal_id,title,parent_topic_id,depth) values ('${A}','${GA}','x','${LEAF}',4)`, "23514");
      await rejects(`update goal_topics set parent_topic_id='${LEAF}',depth=2 where id='${ROOT}'`, "23503");
      await rejects(`update goal_topics set depth=2 where id='${ROOT}'`, "23514");
    });

    await t.test("plan/session topics and class topics must match their goal/course", async () => {
      await rejects(`update study_plan_items set topic_id='${OTHER_TOPIC}' where id='${ITEM}'`, "23503");
      await rejects(`update study_sessions set goal_id='${OTHER}',topic_id='${OTHER_TOPIC}' where id='${SESSION}'`, "23503");
      await rejects(`update study_sessions set topic_id='${OTHER_TOPIC}' where id='${SESSION}'`, "23503");
      await rejects(`update course_session_topics set goal_id='${OTHER}',topic_id='${OTHER_TOPIC}'`, "23503");
      await rejects(`insert into course_session_topics(user_id,session_id,course_id,goal_id,topic_id) values ('${A}','${CLASS}','${CA}','${GA}','${ROOT}')`, "23505");
    });

    await t.test("preference units, real timezone names and versioned JSON objects are checked", async () => {
      await rejects(`update user_preferences set timezone='Neverland/Invalid'`, "23514");
      await rejects(`update user_preferences set min_break_minutes=-1`, "23514");
      await rejects(`update user_preferences set default_block_minutes=0`, "23514");
      await rejects(`update courses set credits='NaN'`, "23514");
      for (const json of ['[]','{}','{"schema_version":0}','{"schema_version":"1"}']) {
        await rejects(`update user_preferences set metadata='${json}'`, "23514");
      }
      await db.exec(`update user_preferences set metadata='{"schema_version":1,"preferred_windows":[]}'`);
    });

    await t.test("deadlines are allowed; blocking events require positive bounded time slots", async () => {
      await rejects(`insert into calendar_events(user_id,event_type,title) values ('${A}','other','x')`, "23514");
      await rejects(`update calendar_events set is_blocking=true`, "23514");
      await rejects(`update calendar_events set ends_at=now()`, "23514");
      await db.exec(`update calendar_events set starts_at='2026-10-01T00:00:00Z',ends_at='2026-10-01T01:00:00Z',is_blocking=true`);
      await rejects(`update calendar_events set ends_at=starts_at`, "23514");
    });

    await t.test("weekends work; empty/reversed/duplicate recurring slots fail", async () => {
      await rejects(`update course_schedules set day_of_week=7`, "23514");
      await rejects(`update course_schedules set end_time=start_time`, "23514");
      await rejects(`update recurring_commitments set start_time='22:00',end_time='06:00'`, "23514");
      await rejects(`update recurring_commitments set effective_from='2026-10-02',effective_to='2026-10-01'`, "23514");
      await rejects(`insert into course_schedules(user_id,course_id,day_of_week,start_time,end_time) values ('${A}','${CA}',6,'08:00','09:00')`, "23505");
    });

    await t.test("plans require coherent revisions, approval timestamp and idempotency", async () => {
      await rejects(`insert into study_plans(user_id,plan_horizon,period_start,period_end,idempotency_key) values ('${A}','daily','2026-09-27','2026-09-27','request-1')`, "23505");
      await rejects(`update study_plans set period_end='2026-09-26' where id='${PLAN}'`, "23514");
      await rejects(`update study_plans set status='approved' where id='${PLAN}'`, "23514");
      await db.exec(`update study_plans set status='approved',approved_at=now() where id='${PLAN}'`);
      await rejects(`insert into study_plans(user_id,plan_horizon,period_start,period_end,parent_plan_id,revision_no) values ('${A}','daily','2026-09-27','2026-09-27','${PLAN}',3)`, "23503");
      await db.exec(`insert into study_plans(user_id,plan_horizon,period_start,period_end,parent_plan_id,revision_no) values ('${A}','daily','2026-09-27','2026-09-27','${PLAN}',2)`);
      await rejects(`insert into study_plans(user_id,plan_horizon,period_start,period_end,parent_plan_id,revision_no) values ('${A}','daily','2026-09-27','2026-09-27','${PLAN}',2)`, "23505");
    });

    await t.test("planned windows must fit; actual time preserves fractions and excludes impossible totals", async () => {
      await rejects(`update study_plan_items set planned_minutes=0`, "23514");
      await rejects(`update study_plan_items set scheduled_start=now()`, "23514");
      await rejects(`update study_plan_items set scheduled_start='2026-09-27T01:00:00Z',scheduled_end='2026-09-27T01:10:00Z'`, "23514");
      await rejects(`update study_sessions set actual_minutes=-1`, "23514");
      await rejects(`update study_sessions set source='timer'`, "23514");
      await rejects(`update study_sessions set started_at='2026-09-27T01:00:00Z',ended_at='2026-09-27T01:05:00Z'`, "23514");
      await db.exec(`update study_sessions set source='timer',started_at='2026-09-27T01:00:00Z',ended_at='2026-09-27T01:15:00Z'`);
      assert.equal(Number((await db.query(`select actual_minutes from study_sessions where id='${SESSION}'`)).rows[0].actual_minutes), 12.5);
      await db.exec(`insert into study_sessions(user_id,goal_id,actual_minutes,completion_status,source,started_at,ended_at)
        values ('${A}','${GA}',0.0167,'partial','timer','2026-09-27T01:00:00Z','2026-09-27T01:00:01Z')`);
    });

    await t.test("lookup is readable but not client-editable; referenced history cannot be deleted", async () => {
      const methods = (await db.query("select code,display_name from study_methods")).rows;
      assert.equal(methods.length, 9);
      assert.equal(methods.find(m => m.code === "note_review").display_name, "노트 복습");
      await rejects("delete from study_methods", "42501");
      await rejects(`delete from courses where id='${CA}'`, "23503");
      await rejects(`delete from learning_goals where id='${GA}'`, "23503");
      await rejects(`delete from study_plan_items where id='${ITEM}'`, "23503");
      await db.exec(`update learning_goals set status='archived' where id='${GA}'`);
    });

    await t.test("account deletion cascades consistently through ownership without breaking FKs", async () => {
      await db.exec(`reset role; delete from auth.users where id='${A}'`);
      for (const table of ownedTables) assert.equal((await db.query(`select * from ${table} where user_id='${A}'`)).rows.length,0,table);
      assert.equal((await db.query("select * from study_methods")).rows.length,9);
      assert.equal((await db.query(`select * from learning_goals where user_id='${B}'`)).rows.length,1);
    });
  } finally { await db.close(); }
});

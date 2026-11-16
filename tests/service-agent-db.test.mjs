import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createDatabase, createClient, createBrowser, moduleLoader, root } from "../scripts/simulation/runtime.mjs";

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
test("assistant calendar approval uses existing SQL/RLS, not a second local storage path", async t => {
  const { db } = await createDatabase();
  const A = id(1), B = id(2), G = id(3), OTHER = id(4);
  try {
    await db.query("insert into auth.users(id,email) values ($1,'a@example.invalid'),($2,'b@example.invalid')", [A, B]);
    await db.query("insert into learning_goals(id,user_id,title,goal_type) values ($1,$2,'Certificate','personal'),($3,$4,'Other','personal')", [G, A, OTHER, B]);
    const client = createClient(db, { userId: A }), app = createBrowser(client, A);
    const load = moduleLoader({ window: app.window, process: { env: {} } }, name => {
      if (/(?:supabase-client)(?:\.ts)?$/.test(name)) return { getSupabaseBrowserClient: () => client };
      if (/private-storage(?:\.ts)?$/.test(name)) return app.local;
      if (/p0-sync(?:\.ts)?$/.test(name)) return app.lib("p0-sync");
    });
    const api = load(path.join(root, "src/lib/service-agent.ts"));
    const draft = { goal_id: G, kind: "assignment", title: "Practice report", description: "Exercise 3", exam_scope: "", starts_at: null, ends_at: null, due_at: "2030-11-20T23:00:00+09:00" };
    const guard = api.createWorkflowGuard(A, () => {});
    await t.test("approved create persists once and uncertain retry returns the same event", async () => {
      assert.equal(await api.approveAgentCalendar(id(10), draft, A, guard.assert), id(10));
      assert.equal(await api.approveAgentCalendar(id(10), draft, A, guard.assert), id(10));
      assert.equal((await db.query("select count(*)::int n from calendar_events")).rows[0].n, 1);
      const row = (await db.query("select * from calendar_events where id=$1", [id(10)])).rows[0];
      assert.equal(row.goal_id, G);
      assert.equal(row.metadata.source, "service-agent-calendar-v1");
      assert.equal(row.is_blocking, false);
      assert.equal(app.get("unilink:monthly-events"), null);
    });
    await t.test("retry cannot overwrite an event edited after approval", async () => {
      await db.query("update calendar_events set title='User edited' where id=$1", [id(10)]);
      await assert.rejects(api.approveAgentCalendar(id(10), draft, A, guard.assert), /변경/);
      assert.equal((await db.query("select title from calendar_events where id=$1", [id(10)])).rows[0].title, "User edited");
    });
    await t.test("foreign goal and foreign account fail without saving", async () => {
      await assert.rejects(api.approveAgentCalendar(id(11), { ...draft, goal_id: OTHER }, A, guard.assert), /목표/);
      await assert.rejects(api.approveAgentCalendar(id(12), draft, B, guard.assert), /계정/);
      assert.equal((await createClient(db, { userId: B }).from("calendar_events").select("id")).data.length, 0);
    });
    await t.test("cancelled workflow and changed prerequisite cannot write", async () => {
      const cancelled = api.createWorkflowGuard(A, () => {}); cancelled.cancel();
      await assert.rejects(api.approveAgentCalendar(id(13), draft, A, cancelled.assert), /취소/);
      await assert.rejects(api.approveAgentCalendar(id(14), draft, A, () => { throw new Error("prerequisite changed"); }), /prerequisite/);
    });
    await t.test("account switch invalidates a previously prepared workflow", async () => {
      app.local.setStorageUser(B);
      assert.throws(guard.assert, /계정/);
      await assert.rejects(api.approveAgentCalendar(id(15), draft, A, guard.assert), /계정/);
      app.local.setStorageUser(A);
      assert.throws(guard.assert, /계정/);
      assert.equal((await db.query("select count(*)::int n from calendar_events")).rows[0].n, 1);
    });
    await t.test("every new server read column exists in the actual schema", async () => {
      for (const sql of [
        "select goal_id,topic_id,learning_status,self_rating,observed_at,source from topic_learning_states limit 0",
        "select goal_id,topic_id,correct_count,question_count,source_stale,created_at,voided_at from topic_check_states limit 0",
        "select course_id,session_date,pace from active_course_sessions limit 0",
        "select course_id,day_of_week,start_time,end_time,effective_from,effective_to from coaching_course_schedules limit 0",
        "select id,goal_id,title,status,scheduled_start,scheduled_end,planned_minutes from study_plan_items limit 0",
      ]) await db.query(sql);
    });
  } finally { await db.close(); }
});

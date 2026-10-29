import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { parseNoteAnalysis, sameSourceTimestamp } from "../supabase/functions/_shared/noteAnalysis.ts";

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
test("Drive and PostgreSQL timestamp formats do not falsely mark unchanged notes as modified", () => {
  assert.equal(sameSourceTimestamp("2026-10-29T01:00:00.000Z", "2026-10-29T01:00:00+00:00"), true);
  assert.equal(sameSourceTimestamp("2026-10-29T01:00:00.123Z", "2026-10-29T10:00:00.123+09:00"), true);
  assert.equal(sameSourceTimestamp("2026-10-29T01:00:00.123Z", "2026-10-29T01:00:00.124Z"), false);
  assert.equal(sameSourceTimestamp(null, null), false);
  assert.equal(sameSourceTimestamp("invalid", "invalid"), false);
});
test("analysis rejects nonexistent pages, blank evidence and oversized or duplicate candidates", () => {
  const c = { kind: "exam", title: "Midterm", description: "", exam_scope: "Chapters 1-3", date_text: "next Friday", page: 2, quote: "Midterm next Friday" };
  assert.equal(parseNoteAnalysis({ summary: "Test", candidates: [c] }, 3).candidates[0].date_text, "next Friday");
  for (const candidates of [[{ ...c, page: 4 }], [{ ...c, quote: "" }], [{ ...c, kind: "instruction" }], [c, c]]) {
    assert.throws(() => parseNoteAnalysis({ summary: "Test", candidates }, 3));
  }
});

test("confirmed extraction is owner scoped, atomic, idempotent and rejects stale versions", async () => {
  const db = new PGlite();
  const user = id(1), other = id(2), note = id(3), goal = id(4), analysis = id(5), candidate = id(6), stale = id(7);
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema public,auth to anon,authenticated,service_role;
      alter default privileges in schema public grant all on tables to service_role;`);
    for (const name of ["0001_notes_and_drive.sql", "0010_core_learning.sql", "0011_p0_schedules.sql", "0012_p0_planning_execution.sql", "0019_course_event_details.sql", "0020_note_analysis.sql", "0021_drive_uploads.sql"]) {
      await db.exec(readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8").replace('create extension if not exists "pgcrypto";', ""));
    }
    await db.exec(`insert into auth.users values('${user}'),('${other}');
      insert into notes(id,user_id,title) values('${note}','${user}','Syllabus');
      insert into learning_goals(id,user_id,goal_type,title) values('${goal}','${user}','personal','Study');
      insert into note_analyses(id,user_id,note_id,note_version,note_updated_at,model_name,status)
        select '${analysis}','${user}',id,version,updated_at,'test','completed' from notes where id='${note}';
      insert into note_analysis_candidates(id,analysis_id,user_id,kind,title,page,quote)
        values('${candidate}','${analysis}','${user}','assignment','Homework',1,'Due Friday'),
              ('${stale}','${analysis}','${user}','exam','Exam',1,'Midterm');
      set role authenticated; set request.jwt.claim.sub='${other}';`);
    assert.equal((await db.query("select * from note_analyses")).rows.length, 0);
    const call = `select public.confirm_note_candidate('${candidate}','${goal}','Homework','Solve exercises','','2026-11-01T14:00Z',null,false) as id`;
    await assert.rejects(db.exec(call));
    await db.exec(`set request.jwt.claim.sub='${user}'`);
    const first = (await db.query(call)).rows[0].id;
    assert.equal((await db.query(call)).rows[0].id, first);
    assert.equal((await db.query("select count(*)::int as n from calendar_events")).rows[0].n, 1);
    await assert.rejects(db.exec(`select public.reserve_drive_upload('${note}','${user}')`), (e) => e.code === "42501");
    await assert.rejects(db.exec("select * from drive_upload_jobs"), (e) => e.code === "42501");
    await db.exec("reset role; set role service_role");
    await assert.rejects(db.exec(`select public.reserve_drive_upload('${note}','${other}')`));
    const upload = (await db.query(`select public.reserve_drive_upload('${note}','${user}') as id`)).rows[0].id;
    await assert.rejects(db.exec(`select public.reserve_drive_upload('${note}','${user}')`));
    await db.exec(`update drive_upload_jobs set status='failed',drive_file_id='retained-drive-id' where id='${upload}'`);
    assert.equal((await db.query(`select public.reserve_drive_upload('${note}','${user}') as id`)).rows[0].id, upload);
    assert.equal((await db.query(`select drive_file_id from drive_upload_jobs where id='${upload}'`)).rows[0].drive_file_id, "retained-drive-id");
    await db.exec("reset role; set role authenticated");
    assert.equal((await db.query("select description from calendar_events")).rows[0].description, "Solve exercises");
    await assert.rejects(db.exec(`update note_analysis_candidates set page=100`), (e) => e.code === "42501");
    await db.exec(`reset role; update notes set version=2 where id='${note}'; set role authenticated`);
    await assert.rejects(db.exec(`select public.confirm_note_candidate('${stale}','${goal}','Exam','','1-3','2026-11-03T10:00Z','2026-11-03T11:00Z',false)`));
    assert.equal((await db.query("select count(*)::int as n from calendar_events")).rows[0].n, 1);
  } finally { await db.close(); }
});

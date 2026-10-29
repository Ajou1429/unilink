import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { parseTopicCheck } from "../supabase/functions/_shared/topicCheck.ts";
import { modelContext } from "../supabase/functions/_shared/coaching/context.ts";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const raw = { questions: [0,1,2].map((n) => ({ prompt: `Question ${n}`, options: ["a","b","c","d"], correct_index: n, explanation: "Because of the definition", evidence_quote: "A sample quote" })) };
const parsed = parseTopicCheck(raw, "A sample quote is evidence.");

test("checks strictly validate evidence and never expose grading keys before submission", () => {
  assert.equal(parsed.questions.length,3);
  assert.equal(JSON.stringify(parsed.questions).includes("correct_index"),false);
  assert.equal(JSON.stringify(parsed.questions).includes("explanation"),false);
  for (const question of [ { ...raw.questions[0], evidence_quote: "Invented" }, { ...raw.questions[0], correct_index: 4 },
    { ...raw.questions[0], options: ["a","a","b","c"] }, { ...raw.questions[0], prompt: "" } ]) {
    assert.throws(() => parseTopicCheck({ questions: [question, ...raw.questions.slice(1)] }, "A sample quote"));
  }
  assert.throws(() => parseTopicCheck({ questions: [raw.questions[0],raw.questions[0],raw.questions[2]] }, "A sample quote"));
  assert.throws(() => parseTopicCheck({ questions: [] }, "A sample quote"));
});

test("reserve, private keys and scoring are owner scoped, atomic, idempotent and version bound", async () => {
  const db = new PGlite();
  const user=id(1),other=id(2),note=id(3),goal=id(4),topic=id(5),analysis=id(6),candidate=id(7);
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema public,auth to anon,authenticated,service_role;
      alter default privileges in schema public grant all on tables to service_role;`);
    for (const file of ["0001_notes_and_drive.sql","0010_core_learning.sql","0011_p0_schedules.sql","0012_p0_planning_execution.sql","0019_course_event_details.sql","0020_note_analysis.sql","0024_topic_learning_observations.sql","0025_topic_checks.sql"]) {
      await db.exec(readFileSync(new URL(`../supabase/migrations/${file}`,import.meta.url),"utf8").replace('create extension if not exists "pgcrypto";',""));
    }
    await db.exec(`insert into auth.users values('${user}'),('${other}');
      insert into notes(id,user_id,title) values('${note}','${user}','Notes');
      insert into learning_goals(id,user_id,goal_type,title) values('${goal}','${user}','personal','Learning');
      insert into note_analyses(id,user_id,note_id,note_version,note_updated_at,model_name,status)
        select '${analysis}','${user}',id,version,updated_at,'test','completed' from notes where id='${note}';
      insert into note_analysis_candidates(id,analysis_id,user_id,kind,title,page,quote) values('${candidate}','${analysis}','${user}','topic','Definition',1,'A sample quote');
      set role authenticated; set request.jwt.claim.sub='${user}';`);
    const confirmed = (await db.query(`select confirm_note_candidate('${candidate}','${goal}','Definition','','',null,null,false) as id`)).rows[0].id;
    const reserve = (request,uid=user,tid=confirmed) => `select reserve_topic_check('${uid}','${tid}','${id(request)}','test') as id`;
    await assert.rejects(db.exec(reserve(10)),(e)=>e.code==="42501");
    await db.exec("reset role; set role service_role");
    await assert.rejects(db.exec(reserve(10,other)));
    const check=(await db.query(reserve(10))).rows[0].id;
    assert.equal((await db.query(reserve(10))).rows[0].id,check);
    assert.equal((await db.query(reserve(11))).rows[0].id,check);
    const claim = `update topic_checks set generation_started=true where id='${check}' and status='processing' and generation_started=false returning id`;
    assert.equal((await db.query(claim)).rows.length,1);
    assert.equal((await db.query(claim)).rows.length,0);
    const publish = (checkId) => `select publish_topic_check('${checkId}','${user}','${JSON.stringify(parsed.questions)}','${JSON.stringify(parsed.key)}','{"input_tokens":100}')`;
    await db.exec(publish(check));
    await assert.rejects(db.exec(publish(check)));
    await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${other}'`);
    assert.equal((await db.query("select * from topic_checks")).rows.length,0);
    await assert.rejects(db.exec(`select submit_topic_check('${check}','[0,1,2]')`));
    await db.exec(`set request.jwt.claim.sub='${user}'`);
    await assert.rejects(db.exec("select * from topic_check_keys"),(e)=>e.code==="42501");
    await assert.rejects(db.exec("update topic_checks set status='ready'"),(e)=>e.code==="42501");
    await assert.rejects(db.exec(`select submit_topic_check('${check}','[0,1]')`));
    await assert.rejects(db.exec(`select submit_topic_check('${check}','[0,1,4]')`));
    await assert.rejects(db.exec(`select submit_topic_check('${check}','[0,1,"2"]')`));
    const submit = `select submit_topic_check('${check}','[0,0,2]') as id`;
    const attempt=(await db.query(submit)).rows[0].id;
    assert.equal((await db.query(submit)).rows[0].id,attempt);
    await assert.rejects(db.exec(`select submit_topic_check('${check}','[0,1,2]')`));
    const result=(await db.query("select * from topic_check_states")).rows[0];
    assert.equal(result.correct_count,2); assert.equal(result.question_count,3); assert.equal(result.source,"generated_mcq");
    assert.equal(result.results[1].is_correct,false); assert.equal(result.source_stale,false);
    assert.equal((await db.query("select * from topic_observations")).rows.length,0);
    await assert.rejects(db.exec("update topic_check_attempts set correct_count=3"),(e)=>e.code==="42501");
    await db.exec("reset role; set role service_role");
    const next=(await db.query(reserve(12))).rows[0].id;
    assert.notEqual(next,check);
    await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${other}'`);
    await assert.rejects(db.exec(`select void_topic_check('${check}')`));
    await db.exec(`set request.jwt.claim.sub='${user}'; select void_topic_check('${check}'); select void_topic_check('${check}')`);
    assert.ok((await db.query("select voided_at from topic_check_states")).rows[0].voided_at);
    await db.exec("reset role; set role service_role");
    await db.exec(`update notes set version=version+1 where id='${note}'`);
    await assert.rejects(db.exec(publish(next)));
    await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${user}'`);
    assert.equal((await db.query("select source_stale from topic_check_states")).rows[0].source_stale,true);
    await db.exec(`reset role; update topic_checks set status='failed' where id='${next}'; set role service_role`);
    await assert.rejects(db.exec(reserve(13)));
    await db.exec(`reset role; update note_analyses a set note_version=n.version,note_updated_at=n.updated_at from notes n where n.id=a.note_id;
      insert into goal_topics(id,user_id,goal_id,title) values('${topic}','${user}','${goal}','Manual title'); set role service_role`);
    await assert.rejects(db.exec(reserve(14,user,topic)));
    for (let i=0;i<8;i++) {
      const q=(await db.query(reserve(30+i))).rows[0].id;
      await db.exec(`update topic_checks set status='failed' where id='${q}'`);
    }
    await assert.rejects(db.exec(reserve(50)),(e)=>e.message.includes('10회'));
    await db.exec("update topic_checks set created_at=now()-interval '25 hours'");
    assert.ok((await db.query(reserve(51))).rows[0].id);
    await db.exec(`reset role; delete from notes where id='${note}';`);
    assert.equal((await db.query("select * from topic_check_attempts")).rows.length,0);
    assert.equal((await db.query("select * from topic_check_keys")).rows.length,0);
  } finally { await db.close(); }
});

test("coaching receives scores separately from self-report and excludes foreign topics", () => {
  const state={id:id(1),check_id:id(2),goal_id:id(3),topic_id:id(4),correct_count:1,question_count:3,source:"generated_mcq",grader_version:"exact-choice-v1",created_at:"2026-10-29T00:00:00Z",note_id:id(5),note_version:1,source_stale:true};
  const out=modelContext({timezone:"Asia/Seoul",goals:[],topics:[{id:state.topic_id,goal_id:state.goal_id,title:"Topic",status:"confirmed"}],methods:[],deadlines:[],sessions:[],existing_items:[],topic_check_states:[state,{...state,topic_id:id(99)},{...state,voided_at:"2026-10-29T01:00:00Z"}]});
  assert.equal(out.topic_check_results.length,1);
  assert.equal(out.topic_check_results[0].review_signal,"incorrect_answers_recorded");
  assert.equal(out.topic_check_results[0].source_stale,true);
  assert.deepEqual(out.topic_learning_states,[]);
});

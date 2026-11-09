import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase, createClient } from '../scripts/simulation/runtime.mjs';
import { coachingRequestHash, coachingRequestPayload } from '../supabase/functions/_shared/coaching/run.ts';
import { buildModelInput } from '../supabase/functions/_shared/coaching/input.ts';
import { loadCoachingContext } from '../supabase/functions/_shared/coaching/context.ts';
import { understandingCases } from '../scripts/evaluation/coaching-understanding-cases.mjs';

test('one-off request reaches current generation but storage whitelist omits all request text', async()=>{
  const fixture=understandingCases()[0],request={...fixture.request,desired_outcome:'오늘만 요약 금지',constraints:'오늘은 20분만, 다음에도 기억하지 마'};
  const hash=await coachingRequestHash(request),stored=coachingRequestPayload(request,hash);
  assert.equal(buildModelInput(request,fixture.context).request.constraints,request.constraints);
  assert.equal(stored.request.constraints,undefined);assert.equal(stored.request.desired_outcome,undefined);
  assert.equal(stored.one_off_text_present,true);assert.equal(stored.request_hash,hash);
  assert.notEqual(hash,await coachingRequestHash({...request,constraints:''}));
  assert.equal(stored.request.period_start,request.period_start);
  const next=buildModelInput({...request,desired_outcome:'',constraints:''},fixture.context);
  assert.ok(!JSON.stringify(next).includes('오늘은 20분만'));
  const history=structuredClone(fixture.context);
  history.personal_feedback=[{id:'f',run_id:'r',goal_ids:[history.goals[0].id],feedback_type:'accepted',explanation:request.constraints,created_at:'2026-11-09'}];
  assert.ok(!JSON.stringify(buildModelInput({...request,desired_outcome:'',constraints:''},history)).includes(request.constraints));
});

test('satisfaction is owner scoped, one observation per proposal, removable and not a stored request preference',async()=>{
  const {db}=await createDatabase();const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
  const [u,other,goal,run,topic]=[801,802,803,804,805].map(id);
  const secret='ONE_OFF_REQUEST_DO_NOT_REMEMBER';
  try{
    await db.exec(`insert into auth.users(id) values('${u}'),('${other}');
      insert into learning_goals(id,user_id,goal_type,title) values('${goal}','${u}','personal','SQL');
      insert into goal_topics(id,user_id,goal_id,title) values('${topic}','${u}','${goal}','JOIN');`);
    const raw={schema_version:1,request_hash:'original-hash',request:{goal_ids:[goal],intent:'weekly_plan',period_start:'2026-11-10',period_end:'2026-11-10',constraints:secret,desired_outcome:secret},unknown_text:secret};
    await db.query(`insert into coaching_runs(id,user_id,request_key,intent,status,request_payload,context_snapshot,output_payload,policy_version,contract_version,completed_at)
      values($1,$2,'scope-test','weekly_plan','proposed',$3,'{"schema_version":1,"context":{"timezone":"Asia/Seoul"}}',
      '{"schema_version":2,"proposal":{"summary":"JOIN practice","items":[],"deferred_goals":[]}}','time-window-v5',2,now())`,[run,u,JSON.stringify(raw)]);
    const stored=(await db.query('select request_payload from coaching_runs')).rows[0].request_payload;
    assert.ok(!JSON.stringify(stored).includes(secret));assert.equal(stored.request_hash,'original-hash');assert.equal(stored.one_off_text_present,true);
    assert.equal(stored.request.period_start,'2026-11-10');
    await db.exec(`set role authenticated;set request.jwt.claim.sub='${u}';`);
    const rate=(n)=>db.query(`select record_coaching_satisfaction($1,$2,'too_hard','too_long') as id`,[run,n]);
    const first=(await rate(2)).rows[0].id;assert.equal((await rate(2)).rows[0].id,first);
    assert.equal((await rate(4)).rows[0].id,first);
    assert.equal((await db.query('select count(*)::int as n from coaching_satisfaction')).rows[0].n,1);
    await assert.rejects(rate(0));await assert.rejects(rate(6));
    const observed=(await db.query('select * from coaching_satisfaction_evidence')).rows[0];
    assert.equal(observed.had_one_off_request,true);assert.equal(observed.rating,4);assert.equal(observed.goal_id,goal);
    assert.ok(!JSON.stringify(observed).includes(secret));
    await assert.rejects(db.exec('update coaching_satisfaction set rating=5'));
    const evidence=(await db.query("select * from learner_personalization_events where event_type='satisfaction'")).rows;
    assert.equal(evidence.length,1);assert.ok(!JSON.stringify(evidence).includes(secret));
    await db.exec(`set request.jwt.claim.sub='${other}'`);
    assert.equal((await db.query('select * from learner_personalization_events')).rows.length,0);
    await assert.rejects(rate(5));await db.query('select clear_coaching_satisfaction($1)',[run]);
    await db.exec('reset role');assert.equal((await db.query('select count(*)::int as n from coaching_satisfaction')).rows[0].n,1);
    const context=await loadCoachingContext(createClient(db,{admin:true}),u,{...understandingCases()[0].request,goal_ids:[goal],desired_outcome:'',constraints:''});
    const input=buildModelInput({...understandingCases()[0].request,goal_ids:[goal],desired_outcome:'',constraints:''},context);
    assert.equal(input.goal_briefs[0].satisfaction_observations[0].rating_1_to_5,4);
    assert.equal(input.goal_briefs[0].satisfaction_observations[0].had_one_off_request,true);
    assert.equal(input.goal_briefs[0].personalization_basis.distinct_satisfaction_runs,1);
    assert.ok(!JSON.stringify(input).includes(secret));
    await db.exec(`set role authenticated;set request.jwt.claim.sub='${u}'`);await db.query('select clear_coaching_satisfaction($1)',[run]);
    assert.equal((await db.query('select * from learner_personalization_events')).rows.length,0);
  }finally{await db.close();}
});

test('understanding history is dated evidence, excludes duplicate latest observations and foreign topics',()=>{
  const f=understandingCases()[0],c=structuredClone(f.context),latest=c.topic_learning_states[0];
  const row={id:'older',goal_id:latest.goal_id,topic_id:latest.topic_id,learning_status:'in_progress',self_rating:2,observed_at:'2026-11-01',memo:'DO_NOT_COPY_HISTORY_PROSE'};
  c.understanding_history={records:[row,{...row,id:latest.id},{...row,id:'foreign',topic_id:'foreign'}],truncated_goal_ids:[]};
  const input=buildModelInput(f.request,c),brief=input.goal_briefs[0];
  assert.equal(brief.previous_understanding.length,1);
  assert.equal(brief.previous_understanding[0].observation_id,'older');
  assert.equal(brief.previous_understanding[0].self_rating_1_to_5,2);
  assert.ok(!JSON.stringify(input).includes('DO_NOT_COPY_HISTORY_PROSE'));
});

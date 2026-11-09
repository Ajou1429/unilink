import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createDatabase, moduleLoader, root } from '../scripts/simulation/runtime.mjs';
import { buildModelInput } from '../supabase/functions/_shared/coaching/input.ts';
import { loadBankEvidence } from '../supabase/functions/_shared/coaching/problemBank.ts';
import { understandingCases } from '../scripts/evaluation/coaching-understanding-cases.mjs';

test('understanding-only counterfactuals preserve scope, deadlines, budget and evidence for three domains', () => {
  const cases = understandingCases();
  for (const domain of ['sql', 'theory', 'personal']) {
    const values = cases.filter(c => c.domain === domain && c.repeat === 1);
    const inputs = values.map(c => JSON.parse(JSON.stringify(buildModelInput(c.request, c.context))));
    assert.equal(inputs.length, 3);
    const strip = input => { for (const g of input.goal_briefs) for (const r of g.self_reports) r.self_rating_1_to_5 = null; return input; };
    assert.deepEqual(strip(structuredClone(inputs[0])), strip(structuredClone(inputs[1])));
    assert.deepEqual(strip(structuredClone(inputs[0])), strip(structuredClone(inputs[2])));
    assert.equal(inputs[1].goal_briefs[0].self_reports[0].self_rating_1_to_5, 1);
    assert.equal(inputs[2].goal_briefs[0].self_reports[0].self_rating_1_to_5, 5);
    assert.equal(inputs[1].shared_context.evidence_scales.self_rating_1_to_5[0], 'hard_to_explain');
  }
});

test('bank learning stages preserve zero/default distinction, goal/topic ownership and bounded data', async () => {
  const fixture = understandingCases()[0]; const c = structuredClone(fixture.context);
  const base = { id:'p1',goal_id:c.goals[0].id,topic_id:c.topics[0].id,subject_id:'s1',subject_name:'SQL',label:'Q7',level:0,level_recorded_at:null,updated_at:'2026-11-09' };
  c.problem_bank = { status:'ready',truncated_goal_ids:[c.goals[0].id,'foreign'],records:[base,{...base,id:'p2',level:4,level_recorded_at:'2026-11-09T10:00:00Z'}, {...base,id:'foreign',goal_id:'foreign'}, {...base,id:'p3',topic_id:'foreign'}] };
  const input = buildModelInput(fixture.request,c), rows = input.goal_briefs[0].problem_bank_stages;
  assert.equal(rows.length,3);
  assert.equal(rows[0].observation_kind,'default_or_legacy_zero_unknown');
  assert.equal(rows[1].stage_meaning,'attempted_independently');
  assert.equal(rows[2].topic_id,null);
  assert.equal(JSON.stringify(input).includes('"problem_id":"foreign"'),false);
  const calls=[];
  const db={from(table){const call={table,filters:[]};calls.push(call);const q={select(){return q;},eq(...v){call.filters.push(v);return q;},order(){return q;},limit(n){call.limit=n;return q;},then(resolve){resolve({data:Array.from({length:21},()=>base),error:null});}};return q;}};
  const result=await loadBankEvidence(db,'owner',[c.goals[0].id]);
  assert.equal(result.records.length,20); assert.deepEqual(result.truncated_goal_ids,[c.goals[0].id]);
  assert.deepEqual(calls[0].filters,[['user_id','owner'],['goal_id',c.goals[0].id]]); assert.equal(calls[0].limit,21);
  const failure=code=>({from(){const q={select(){return q;},eq(){return q;},order(){return q;},limit(){return q;},then(resolve){resolve({error:{code}});}};return q;}});
  assert.equal((await loadBankEvidence(failure('PGRST205'),'owner',['goal'])).status,'schema_unavailable');
  await assert.rejects(loadBankEvidence(failure('42501'),'owner',['goal']),e=>e.status===503);
});

test('bank mapping SQL isolates users, enforces matching goal/topic, preserves values and records explicit stage time', async () => {
  const { db }=await createDatabase(); const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
  const [u,other,g,g2,t,s,p]=[1,2,3,4,5,6,7].map(id);
  try {
    await db.exec(`insert into auth.users(id) values('${u}'),('${other}');
      insert into learning_goals(id,user_id,goal_type,title) values('${g}','${u}','personal','SQL'),('${g2}','${other}','personal','SQL');
      insert into goal_topics(id,user_id,goal_id,title) values('${t}','${u}','${g}','JOIN');
      insert into problem_bank_subjects(id,user_id,name) values('${s}','${u}','SQL');
      insert into problem_bank_problems(id,user_id,subject_id,label) values('${p}','${u}','${s}','Q1');
      set role authenticated; set request.jwt.claim.sub='${u}';`);
    await assert.rejects(db.exec(`insert into problem_bank_coaching_links values('${s}','${u}','${g2}',null,now())`));
    await db.exec(`insert into problem_bank_coaching_links(subject_id,user_id,goal_id,topic_id) values('${s}','${u}','${g}','${t}')`);
    assert.equal((await db.query('select level_recorded_at from coaching_problem_bank_states')).rows[0].level_recorded_at,null);
    await db.exec(`update problem_bank_problems set level=0 where id='${p}'`);
    assert.ok((await db.query('select level_recorded_at from coaching_problem_bank_states')).rows[0].level_recorded_at);
    await db.exec(`update problem_bank_problems set level=4 where id='${p}'; set request.jwt.claim.sub='${other}'`);
    assert.equal((await db.query('select * from coaching_problem_bank_states')).rows.length,0);
    await assert.rejects(db.exec(`insert into problem_bank_coaching_links(subject_id,user_id,goal_id) values('${s}','${other}','${g2}')`));
    await db.exec(`reset role; delete from goal_topics where id='${t}';`);
    assert.equal((await db.query('select topic_id from coaching_problem_bank_states')).rows[0].topic_id,null);
    const load=moduleLoader({},name=>name.startsWith('jsr:')?{}:undefined);
    const {createClient}=await import('../scripts/simulation/runtime.mjs');
    const context=await load(path.join(root,'supabase/functions/_shared/coaching/context.ts')).loadCoachingContext(createClient(db,{admin:true}),u,{
      ...understandingCases()[0].request,goal_ids:[g]});
    assert.equal(buildModelInput({...understandingCases()[0].request,goal_ids:[g]},context).goal_briefs[0].problem_bank_stages[0].stage_0_to_5,4);
    await db.exec(`delete from learning_goals where id='${g}'`);
    assert.equal((await db.query('select * from problem_bank_coaching_links')).rows.length,0);
    assert.equal((await db.query('select level from problem_bank_problems')).rows[0].level,4);
  } finally {await db.close();}
});

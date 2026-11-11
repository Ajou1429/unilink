import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase, createClient } from '../scripts/simulation/runtime.mjs';
import { understandingCases } from '../scripts/evaluation/coaching-understanding-cases.mjs';
import { parseCoachingRequest, validateProposal, fitProposalSchedule } from '../supabase/functions/_shared/coaching/contract.ts';
import { loadCoachingContext } from '../supabase/functions/_shared/coaching/context.ts';
import { coachingContextSnapshot, coachingRequestPayload, coachingRequestHash } from '../supabase/functions/_shared/coaching/run.ts';
import { loadCoachingReview } from '../supabase/functions/_shared/coaching/diagnosis.ts';
import { planKnowledge } from '../supabase/functions/_shared/courseKnowledge.ts';

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const fixture = () => structuredClone(understandingCases()[0]);

test('review flags and 21-day outlook never enlarge executable 14-day windows or persist request prose', async () => {
  const f = fixture();
  const request = parseCoachingRequest({ ...f.request, intent: 'exam_prep', exam_inputs: f.request.goal_ids.map(goal_id => ({ goal_id, scope:'JOIN', exam_at:'2026-11-25T05:00:00Z', priority:3, difficulty:3 })),
    period_start:'2026-11-11', period_end:'2026-11-11', day_budgets:[{date:'2026-11-11',minutes:60,windows:[{start:'13:00',end:'16:00'}]}],
    preparation_end:'2026-12-01', review_other_goals:true, use_related_learning:true, constraints:'THIS_REQUEST_ONLY' });
  assert.equal(request.preparation_end,'2026-12-01');
  assert.throws(()=>parseCoachingRequest({...request,preparation_end:'2026-12-02'}));
  assert.throws(()=>parseCoachingRequest({...request,period_end:'2026-12-01'}));
  f.context.approval_revision=5;
  const snapshot = coachingContextSnapshot(f.context,request);
  assert.equal(snapshot.execution_contract.revision,5);
  assert.deepEqual(snapshot.execution_contract.day_budgets,request.day_budgets);
  assert.ok(!JSON.stringify(snapshot.execution_contract).includes('THIS_REQUEST_ONLY'));
  assert.ok(!JSON.stringify(coachingRequestPayload(request,await coachingRequestHash(request))).includes('THIS_REQUEST_ONLY'));
  const daily={...f.request,intent:'daily_plan',daily_sources:[{kind:'event',id:id(8)}],review_other_goals:true};
  assert.equal(parseCoachingRequest(daily).review_other_goals,undefined);
});

test('material-free public research is bounded, labelled, cached and independent of learner history', async () => {
  const goal={title:'SQL certification',goal_type:'certification',as_of:'2026-11-11'};
  const p=await planKnowledge([],[],[],'model','search',goal);
  assert.equal(p.tasks.length,1);assert.equal(p.tasks[0].kind,'research');
  assert.equal(p.tasks[0].payload.concepts.basis,'public_goal_without_material');
  assert.equal(p.research_status,'pending');assert.ok(p.warnings.length);
  const ready={...p.tasks[0],status:'ready',payload:{...p.tasks[0].payload,research:{required_depth:'provisional'}}};
  const reuse=await planKnowledge([],[],[ready],'model','search',{...goal,as_of:'2026-11-20'});
  assert.equal(reuse.tasks.length,0);assert.equal(reuse.research_status,'ready');
  const next=await planKnowledge([],[],[ready],'model','search',{...goal,as_of:'2026-12-01'});
  assert.equal(next.tasks.length,1);
  assert.equal((await planKnowledge([],[],[],'model',null,goal)).tasks.length,0);
});

test('advice-only goals cannot be scheduled and completion references must belong to their goal', () => {
  const f=fixture(),g=f.context.goals[0],topic=f.context.topics.find(t=>t.goal_id===g.id);
  const d=f.request.day_budgets.find(d=>d.minutes>=30);
  const c={...f.context,blocked_events:[],recurring_blocks:[],review:{status:'ready',truncated:false,candidates:[{goal_id:id(909),title:'Another exam',target_date:null,events:[{id:id(910),title:'exam',event_type:'exam',at:'2026-11-15T00:00:00Z'}]}],related_learning:[]}};
  const value={summary:'Plan',items:[{goal_id:g.id,topic_id:topic?.id??null,method_code:c.methods[0].code,title:'JOIN exercise',planned_date:d.date,start_time:d.windows[0].start,planned_minutes:30,reason:'Application',
    completion_criteria:{task_scope:'one query',observable_check:'explain returned rows',evidence_ids:topic?[topic.id]:[]}}],deferred_goals:[],advisories:[{goal_id:id(909),reason:'approaching exam',suggested_action:'review this goal before selecting',evidence_ids:[id(910)]}],preparation_outlook:''};
  const r={...f.request,goal_ids:[g.id],rules:{...f.request.rules,method_minimums:{},carryover:false}};
  assert.equal(validateProposal(value,r,c).advisories.length,1);
  assert.throws(()=>validateProposal({...value,items:[{...value.items[0],goal_id:id(909)}]},r,c));
  assert.throws(()=>validateProposal({...value,items:[{...value.items[0],completion_criteria:{...value.items[0].completion_criteria,evidence_ids:[id(910)]}}]},r,c));
  assert.throws(()=>validateProposal({...value,advisories:[{...value.advisories[0],goal_id:id(999)}]},r,c));
});

test('owner-scoped review and lexical prerequisite observations are separate from execution selection', async () => {
  const {db}=await createDatabase();const uid=id(901),other=id(902),goal=id(903),extra=id(904),foreign=id(905),topic=id(906);
  try {
    await db.exec(`insert into auth.users(id) values('${uid}'),('${other}');
      insert into learning_goals(id,user_id,title,goal_type,target_date) values('${goal}','${uid}','JOIN','personal',null),('${extra}','${uid}','Algebra','personal','2026-11-20'),('${foreign}','${other}','SECRET','personal','2026-11-20');
      insert into goal_topics(id,user_id,goal_id,title) values('${topic}','${uid}','${extra}','Algebra');
      insert into topic_observations(user_id,goal_id,topic_id,learning_status,self_rating,observed_at,request_id) values('${uid}','${extra}','${topic}','understood',4,now(),'${id(907)}');`);
    const f=fixture();const request={...f.request,goal_ids:[goal],period_start:'2026-11-11',period_end:'2026-11-24',review_other_goals:true,use_related_learning:true};
    const ctx={...f.context,goals:[{...f.context.goals[0],id:goal}],course_knowledge:[{goal_id:goal,content:[{artifact_id:'art',content:{units:[{unit_ref:'unit',title:'JOIN',prerequisites:['Algebra']}]}}]}]};
    const review=await loadCoachingReview(createClient(db,{admin:true}),uid,request,ctx);
    assert.deepEqual(review.candidates.map(c=>c.goal_id),[extra]);
    assert.equal(review.related_learning[0].topic_id,topic);
    assert.ok(!JSON.stringify(review).includes('SECRET'));
    assert.equal((await loadCoachingReview(createClient(db,{admin:true}),uid,{...request,intent:'daily_plan'},ctx)).candidates.length,0);
    assert.equal((await loadCoachingReview(createClient(db,{admin:true}),uid,{...request,review_other_goals:false,use_related_learning:false},ctx)).status,'not_requested');
  }finally{await db.close();}
});

test('fresh approval persists criteria, invalidates sibling proposals and manual changes, rejects expired/legacy proposals', async () => {
  const {db}=await createDatabase();const uid=id(920),other=id(921),goal=id(922),topic=id(923);
  try {
    await db.exec(`insert into auth.users(id) values('${uid}'),('${other}');
      insert into learning_goals(id,user_id,title,goal_type) values('${goal}','${uid}','SQL','personal');
      insert into goal_topics(id,user_id,goal_id,title) values('${topic}','${uid}','${goal}','JOIN');`);
    const f=fixture(),request={...f.request,goal_ids:[goal],period_start:'2026-11-11',period_end:'2026-11-11',day_budgets:[{date:'2026-11-11',minutes:60,windows:[{start:'13:00',end:'16:00'}]}]};
    const admin=createClient(db,{admin:true}),owner=createClient(db,{userId:uid});
    const ctx=await loadCoachingContext(admin,uid,request);
    const proposal={summary:'query',items:[{goal_id:goal,topic_id:topic,method_code:ctx.methods[0].code,title:'query',planned_date:'2026-11-11',start_time:'13:00',planned_minutes:30,reason:'apply',
      completion_criteria:{schema_version:1,task_scope:'one query',observable_check:'correct rows',evidence_ids:[topic]}}],deferred_goals:[]};
    async function run(key,snapshot=coachingContextSnapshot(ctx,request),expired=false){
      const result=await db.query(`insert into coaching_runs(user_id,request_key,intent,status,request_payload,context_snapshot,output_payload,policy_version,contract_version,created_at,completed_at,expires_at)
        values($1,$2,'weekly_plan','proposed',$3,$4,$5,'time-window-v5',2,now()-interval '2 days',now()-interval '1 day',${expired?"now()-interval '1 hour'":"now()+interval '1 day'"}) returning id`,
        [uid,key,JSON.stringify(coachingRequestPayload(request,await coachingRequestHash(request))),JSON.stringify(snapshot),JSON.stringify({schema_version:2,proposal})]);
      return result.rows[0].id;
    }
    const first=await run('first'),sibling=await run('sibling'),expired=await run('expired',undefined,true),legacy=await run('legacy',{schema_version:1,context:{timezone:'Asia/Seoul'}});
    assert.ok((await createClient(db,{userId:other}).rpc('approve_coaching_proposal',{p_run_id:first})).error);
    assert.ok((await owner.rpc('approve_coaching_proposal',{p_run_id:expired})).error);
    assert.ok((await owner.rpc('approve_coaching_proposal',{p_run_id:legacy})).error);
    const accepted=await owner.rpc('approve_coaching_proposal',{p_run_id:first});assert.equal(accepted.error,null);
    assert.equal((await owner.rpc('approve_coaching_proposal',{p_run_id:first})).data,accepted.data);
    assert.equal((await db.query('select completion_criteria from study_plan_items where plan_id=$1',[accepted.data])).rows[0].completion_criteria.observable_check,'correct rows');
    assert.ok((await owner.rpc('approve_coaching_proposal',{p_run_id:sibling})).error);
    const fresh=await loadCoachingContext(admin,uid,request),manual=await run('manual',coachingContextSnapshot(fresh,request));
    await db.query(`insert into calendar_events(user_id,goal_id,event_type,title,starts_at,ends_at,is_blocking) values($1,$2,'appointment','new','2026-11-11T04:00:00Z','2026-11-11T05:00:00Z',true)`,[uid,goal]);
    assert.ok((await owner.rpc('approve_coaching_proposal',{p_run_id:manual})).error);
    assert.ok((await owner.rpc('approve_coaching_proposal_legacy',{p_run_id:manual})).error);
    assert.equal((await db.query('select count(*)::int as n from study_plans')).rows[0].n,1);
    const revision=async()=>(await db.query('select revision from coaching_state_revisions where user_id=$1',[uid])).rows[0].revision;
    const before=await revision();
    await db.query('update learning_goals set title=title where id=$1',[goal]);
    assert.equal(await revision(),before,'identical sync must not invalidate a proposal');
    await db.exec('begin');
    await db.query("update learning_goals set title='temporary' where id=$1",[goal]);
    await db.exec('rollback');
    assert.equal(await revision(),before,'rolled back changes must not invalidate proposals');
    await db.query('delete from calendar_events where user_id=$1',[uid]);
    assert.ok(await revision()>before,'deleted blocking work invalidates proposals too');
  }finally{await db.close();}
});

test('structured completion tasks are never silently split into duplicate completion checks', () => {
  const f=fixture(),goal=f.context.goals[0].id,date=f.request.day_budgets[0].date;
  const request={...f.request,goal_ids:[goal],day_budgets:[{date,minutes:120,windows:[{start:'13:00',end:'14:00'},{start:'15:00',end:'16:00'}]}],rules:{...f.request.rules,method_minimums:{},break_after_minutes:90,carryover:false}};
  const proposal={summary:'task',items:[{goal_id:goal,topic_id:null,method_code:f.context.methods[0].code,title:'One indivisible task',planned_date:date,start_time:'13:00',planned_minutes:120,reason:'Scope',completion_criteria:{schema_version:1,task_scope:'one exercise',observable_check:'one result',evidence_ids:[]}}],deferred_goals:[]};
  assert.throws(()=>fitProposalSchedule(proposal,request,{...f.context,blocked_events:[],recurring_blocks:[]}));
});

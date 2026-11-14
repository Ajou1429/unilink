import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { createDatabase, createClient, createBrowser, moduleLoader, root } from '../scripts/simulation/runtime.mjs';
import { parseCoachingRequest, fitProposalSchedule, validateProposal } from '../supabase/functions/_shared/coaching/contract.ts';
import { loadCoachingContext, modelContext } from '../supabase/functions/_shared/coaching/context.ts';
import { loadKnowledge } from '../supabase/functions/_shared/courseKnowledgeStore.ts';
import { CHAT_INSTRUCTIONS } from '../supabase/functions/_shared/chatRecord.ts';
import { BANK_STAGE_LABELS, SELF_RATING_LABELS } from '../supabase/functions/_shared/learningScales.ts';

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const A=id(1), B=id(2), G=id(3), C=id(4), DAY='2030-11-18';
const request = (minutes=60,windows=[{start:'09:00',end:'10:00'}]) => parseCoachingRequest({
  goal_ids:[G],intent:'weekly_plan',period_start:DAY,period_end:DAY,desired_outcome:'',constraints:'',
  day_budgets:[{date:DAY,minutes,windows}],rules:{transition_minutes:0,break_minutes:10,break_after_minutes:90,method_minimums:{},max_focus_goals:1,carryover:true},
});
const context={timezone:'Asia/Seoul',goals:[{id:G,title:'Database',course_id:C,goal_type:'course',metadata:{},importance:3}],
  topics:[],methods:[{code:'concept_review',display_name:'Review',active:true}],deadlines:[],sessions:[],existing_items:[]};
const item=(start='09:00',minutes=30)=>({goal_id:G,topic_id:null,method_code:'concept_review',title:'JOIN query',planned_date:DAY,start_time:start,planned_minutes:minutes,reason:'Concrete practice'});
const proposal=items=>({summary:'Plan',items,deferred_goals:[]});

test('valid continuous blocks are preserved, and indivisible work searches a later complete slot',()=>{
  const valid=proposal([item(),item('09:30')]);
  assert.equal(fitProposalSchedule(valid,request(),context),valid);
  assert.equal(validateProposal(valid,request(),context).items.length,2);
  const req=request(60,[{start:'09:00',end:'09:30'},{start:'10:00',end:'11:00'}]);
  const task={...item('09:00',60),completion_criteria:{task_scope:'one query',observable_check:'correct result',evidence_ids:[]}};
  const fitted=fitProposalSchedule(proposal([task]),req,context);
  assert.equal(fitted.items.length,1); assert.equal(fitted.items[0].start_time,'10:00');
  assert.equal(validateProposal(fitted,req,context).items[0].planned_minutes,60);
});

test('chat and coaching share exact ability and activity scales',()=>{
  for(const [i,label] of BANK_STAGE_LABELS.entries()) assert.ok(CHAT_INSTRUCTIONS.includes(`${i}=${label}`));
  for(const [i,label] of SELF_RATING_LABELS.entries()) assert.ok(CHAT_INSTRUCTIONS.includes(`${i+1}=${label}`));
  assert.ok(CHAT_INSTRUCTIONS.includes('not a generic understanding score'));
});

test('state integrity against complete SQL schema and real browser storage',async t=>{
  const {db}=await createDatabase();
  try {
    await db.query('insert into auth.users(id,email) values ($1,$2),($3,$4)',[A,'a@example.invalid',B,'b@example.invalid']);
    await db.query(`insert into courses(id,user_id,name,term) values ($1,$2,'Database','2030년 2학기')`,[C,A]);
    await db.query(`insert into learning_goals(id,user_id,title,goal_type,course_id) values ($1,$2,'Database','course',$3)`,[G,A,C]);
    const admin=createClient(db,{admin:true}),student=createClient(db,{userId:A}),other=createClient(db,{userId:B});
    const app=createBrowser(student,A),chat=app.lib('chat-record/apply'),timetable=app.lib('timetable-storage');
    const course={id:'local-db',name:'Database',term:'2030년 2학기',credits:3,days:[],startTime:'',endTime:'',schedules:[],professor:'',location:'',color:'red'};
    const ctx=()=>({signedIn:true,userId:A,courses:[course],goals:new Map([[course.id,G]]),topics:new Map(),files:new Map(),subjects:new Map()});
    const action={kind:'topic',course_id:course.id,date:null,topic:'JOIN',status:'needs_review',rating:2,quote:'PRIVATE_RAW_TEXT only today',
      progress_title:null,page_start:null,page_end:null,difficulty:null,pace:null,problem_file:null,problem_labels:[],problem_level:null};
    const identity=(n,minutes=n)=>({requestId:id(100+n),observedAt:`2030-11-18T00:${String(minutes).padStart(2,'0')}:00Z`});
    // SQL disallows future observations: use fixed, already-past message times for state chronology.
    const past=n=>({requestId:id(100+n),observedAt:`2026-10-01T00:${String(n).padStart(2,'0')}:00Z`});
    let first;

    await t.test('a delayed older message reuses one topic, never persists raw text or replaces later mastery',async()=>{
      const newer=await chat.applyAction(ctx(),{...action,status:'understood',rating:5},past(2));
      first=await chat.applyAction(ctx(),action,past(1));
      assert.equal(first.topicId,newer.topicId);
      const rows=(await db.query('select * from topic_learning_states where topic_id=$1',[first.topicId])).rows;
      assert.equal(rows.length,1);assert.equal(rows[0].self_rating,5);
      assert.equal((await db.query('select count(*)::int n from goal_topics where goal_id=$1',[G])).rows[0].n,1);
      assert.ok((await db.query('select memo from topic_observations where user_id=$1',[A])).rows.every(r=>r.memo===''));
    });

    await t.test('retry is idempotent; undo an older card leaves the topic and subsequent records intact',async()=>{
      const replay=await chat.applyAction(ctx(),action,past(1));
      assert.equal(replay.observationId,first.observationId);
      await chat.undoApplied(first);
      const state=(await db.query('select self_rating from topic_learning_states where topic_id=$1',[first.topicId])).rows[0];
      assert.equal(state.self_rating,5);
      assert.equal((await db.query('select status from goal_topics where id=$1',[first.topicId])).rows[0].status,'confirmed');
      const model=modelContext(await loadCoachingContext(admin,A,request()));
      assert.ok(!model.understanding_history.records.some(r=>r.observation_id===first.observationId));
      assert.equal((await db.query('select count(*)::int n from learner_personalization_events where event_id=$1',[first.observationId])).rows[0].n,0);
    });

    await t.test('editing a historical card does not rewrite message chronology or add fake learning changes',async()=>{
      const old=await chat.applyAction(ctx(),{...action,rating:1},past(3));
      const newer=await chat.applyAction(ctx(),{...action,rating:4},past(4));
      const revised=await chat.editApplied(old,{kind:'topic',status:'understood',rating:5});
      assert.notEqual(old.observationId,revised.observationId);
      assert.equal(new Date((await db.query('select observed_at from topic_observations where id=$1',[revised.observationId])).rows[0].observed_at).toISOString(),past(3).observedAt.replace('Z','.000Z'));
      await chat.undoApplied(revised);
      const state=(await db.query('select id,self_rating from topic_learning_states where topic_id=$1',[old.topicId])).rows[0];
      assert.equal(state.id,newer.observationId);assert.equal(state.self_rating,4);
      const evidence=modelContext(await loadCoachingContext(admin,A,request()));
      assert.ok(!evidence.understanding_history.records.some(r=>[old.observationId,revised.observationId].includes(r.observation_id)));
    });

    await t.test('new observation operations isolate owners and reject reused different requests',async()=>{
      const denied=await other.rpc('void_chat_topic_observation',{p_observation:first.observationId});
      assert.equal(denied.error.code,'42501');
      await assert.rejects(chat.applyAction(ctx(),{...action,rating:3},past(2)),/already|changed/i);
      await assert.rejects(chat.applyAction(ctx(),action,identity(9)),/Invalid chat observation/);
      let local,calls=0;
      const load=moduleLoader({window:app.window,process},name=>{
        if(/(?:supabase-client|supabase[\\/]client)(?:\.ts)?$/.test(name))return {getSupabaseBrowserClient:()=>({
          auth:{getUser:async()=>{local.setStorageUser(B);local.setStorageUser(A);return {data:{user:{id:A}}};}},
          rpc:async()=>{calls++;return {data:null,error:null};},
        })};
      });
      local=load(path.join(root,'src/lib/private-storage.ts'));local.setStorageUser(A);
      const guarded=load(path.join(root,'src/lib/chat-record/apply.ts'));
      await assert.rejects(guarded.undoApplied(first),/계정/);
      await assert.rejects(guarded.editApplied(first,{kind:'topic',status:'understood',rating:5}),/계정/);
      assert.equal(calls,0,'A to B to A account changes cannot revive an old card operation');
    });

    await t.test('deleted progress is absent from both coaching and knowledge; archive histories do not exhaust state caps',async()=>{
      await db.query(`insert into course_sessions(user_id,course_id,session_date,memo,metadata)
        values ($1,$2,$3,'Deleted topic','{"schema_version":1,"deleted":true,"legacy_record":{"progressTitle":"Deleted topic"}}')`,[A,C,DAY]);
      const loaded=await loadCoachingContext(admin,A,request());
      assert.equal(loaded.course_progress.length,0);
      assert.equal((await loadKnowledge(admin,A,G,DAY,'test',null)).context.actual_class_progress.length,0);
      await db.query(`insert into goal_topics(user_id,goal_id,title,status) select $1,$2,'Hidden '||n,'archived' from generate_series(1,101)n`,[A,G]);
      await db.query(`insert into topic_observations(user_id,goal_id,topic_id,learning_status,self_rating,observed_at,request_id)
        select user_id,goal_id,id,'needs_review',1,now(),gen_random_uuid() from goal_topics where goal_id=$1 and status='archived'`,[G]);
      assert.equal((await loadCoachingContext(admin,A,request())).topic_learning_states.length,1);
    });

    await t.test('prior terms do not block current windows; current classes and explicit overrides still do',async()=>{
      const old=id(40);
      await db.query(`insert into courses(id,user_id,name,term) values ($1,$2,'Old course','2020년 1학기')`,[old,A]);
      await db.query(`insert into course_schedules(user_id,course_id,day_of_week,start_time,end_time) values ($1,$2,1,'09:00','10:00')`,[A,old]);
      let loaded=await loadCoachingContext(admin,A,request());
      assert.equal(validateProposal(proposal([item()]),request(),loaded).items.length,1);
      await db.query(`update course_schedules set effective_from='2030-11-01',effective_to='2030-12-01' where course_id=$1`,[old]);
      loaded=await loadCoachingContext(admin,A,request());
      assert.throws(()=>validateProposal(proposal([item()]),request(),loaded),e=>e.status===502);
      await db.query('delete from courses where id=$1',[old]);
    });

    await t.test('unreported pace stays unknown and stale session cards cannot undo a newer update',async()=>{
      const session=await chat.applyAction(ctx(),{...action,kind:'session',date:'2026-10-01',progress_title:'JOIN'});
      assert.equal(session.current.difficulty,null);assert.equal(session.current.pace,null);
      timetable.saveCourseSession({...session.current,progressTitle:'Newer content',updatedAt:'2026-10-02T00:00:00Z'});
      await assert.rejects(chat.undoApplied(session),/이후에/);
      assert.equal(timetable.getCourseSession(course.id,session.date,session.startTime).progressTitle,'Newer content');
    });

    await t.test('batch problem stage writes are atomic and version-bound, and preserve source files in coaching',async()=>{
      const subject=id(50);
      await db.query(`insert into problem_bank_subjects(id,user_id,name) values ($1,$2,'DB problems')`,[subject,A]);
      await db.query(`insert into problem_bank_coaching_links(subject_id,user_id,goal_id) values ($1,$2,$3)`,[subject,A,G]);
      await db.query(`insert into problem_bank_problems(id,user_id,subject_id,label,source_file,level)
        values ($1,$3,$4,'1','midterm::old.pdf',1),($2,$3,$4,'1','final::current.pdf',5)`,[id(51),id(52),A,subject]);
      const rows=(await db.query('select * from problem_bank_problems where subject_id=$1 order by id',[subject])).rows;
      const failed=await student.rpc('set_chat_problem_levels',{p_changes:[{id:rows[0].id,expected:rows[0].updated_at,level:3},
        {id:rows[1].id,expected:'2000-01-01T00:00:00Z',level:3}]});
      assert.equal(failed.error.code,'40001');
      assert.equal((await db.query('select level from problem_bank_problems where id=$1',[rows[0].id])).rows[0].level,1);
      const model=modelContext(await loadCoachingContext(admin,A,request()));
      assert.deepEqual(model.problem_bank.records.map(r=>r.exam_period).sort(),['final','midterm']);
      assert.ok(model.problem_bank.records.every(r=>r.source_file.endsWith('.pdf')));
      const original=(await db.query('select updated_at from problem_bank_problems where id=$1',[rows[0].id])).rows[0].updated_at;
      const changes={p_changes:[{id:rows[0].id,expected:original,level:3}]};
      assert.equal((await other.rpc('set_chat_problem_levels',changes)).error.code,'40001');
      assert.equal((await student.rpc('set_chat_problem_levels',changes)).error,null);
      assert.equal((await db.query('select level from problem_bank_problems where id=$1',[rows[0].id])).rows[0].level,3);
      const current=(await db.query('select updated_at from problem_bank_problems where id=$1',[rows[0].id])).rows[0].updated_at;
      assert.equal((await student.rpc('set_chat_problem_levels',{p_changes:[{id:rows[0].id,expected:current,level:1}]})).error,null);
    });

    let runCount=0;
    async function createRun(start=DAY,items=[item()]) {
      const run=id(500+runCount++),rev=(await db.query('select revision from coaching_state_revisions where user_id=$1',[A])).rows[0]?.revision??0;
      await db.query(`insert into coaching_runs(id,user_id,request_key,intent,status,request_payload,context_snapshot,output_payload,
        model_name,prompt_version,policy_version,contract_version,completed_at)
        values ($1,$2,$3,'weekly_plan','proposed',$4,$5,$6,'test','state-integrity-v19','state-integrity-v7',2,now())`,
        [run,A,`audit:${run}`,{schema_version:1,request:{goal_ids:[G],intent:'weekly_plan',period_start:start,period_end:start}},
          {schema_version:1,context:{timezone:'Asia/Seoul'},execution_contract:{schema_version:1,revision:Number(rev),scope:'confirmed_execution_only_no_free_text',
            timezone:'Asia/Seoul',period_start:start,period_end:start,day_budgets:[...request().day_budgets,{date:'2030-11-19',minutes:60,windows:[{start:'09:00',end:'10:00'}]}],rules:request().rules,exams:[]}},
          {schema_version:2,proposal:proposal(items)}]);
      return run;
    }
    await t.test('flushing pending browser changes before approval makes the DB reject stale proposals',async()=>{
      const sync=app.lib('p0-sync');await sync.initializeP0Account(A);
      const stop=sync.startP0SyncListener();
      try {
        const run=await createRun();
        timetable.saveMonthlyEvents([{id:'pending',title:'Appointment',date:DAY,startTime:'09:00',endTime:'10:00',memo:'',location:'',color:'red'}]);
        await sync.flushP0Changes();
        assert.equal((await student.rpc('approve_coaching_proposal',{p_run_id:run})).error.code,'40001');
      }finally{stop();sync.stopP0Sync();}
      await db.query('delete from calendar_events where user_id=$1',[A]);
    });

    await t.test('postponement rejects class conflicts, exam cutoffs, stale versions and foreign users; valid moves are idempotent',async()=>{
      const run=await createRun();
      const approved=await student.rpc('approve_coaching_proposal',{p_run_id:run});assert.equal(approved.error,null);
      const original=(await db.query('select * from study_plan_items where plan_id=$1',[approved.data])).rows[0];
      const args={p_item:original.id,p_expected_start:original.scheduled_start,p_request:id(600)};
      await db.query(`insert into course_schedules(user_id,course_id,day_of_week,start_time,end_time,effective_from,effective_to)
        values ($1,$2,2,'09:00','10:00','2030-11-01','2030-12-01')`,[A,C]);
      assert.equal((await student.rpc('postpone_coaching_plan_item',args)).error.code,'23514');
      await db.query('delete from course_schedules where user_id=$1',[A]);
      await db.query(`insert into calendar_events(user_id,goal_id,event_type,title,starts_at,ends_at,is_blocking)
        values ($1,$2,'exam','Exam','2030-11-19T08:00:00+09:00','2030-11-19T08:30:00+09:00',false)`,[A,G]);
      assert.equal((await student.rpc('postpone_coaching_plan_item',args)).error.code,'23514');
      await db.query('delete from calendar_events where user_id=$1',[A]);
      assert.equal((await other.rpc('postpone_coaching_plan_item',args)).error.code,'42501');
      assert.equal((await student.rpc('postpone_coaching_plan_item',{...args,p_expected_start:'2000-01-01T00:00:00Z'})).error.code,'40001');
      assert.equal((await student.rpc('postpone_coaching_plan_item',args)).error,null);
      assert.equal((await student.rpc('postpone_coaching_plan_item',args)).error,null);
      const shifted=(await db.query('select * from study_plan_items where id=$1',[original.id])).rows[0];
      assert.equal(shifted.metadata.postpone_count,1);assert.equal(Date.parse(shifted.scheduled_start),Date.parse('2030-11-19T09:00:00+09:00'));
      assert.equal(new Date((await db.query('select period_end from study_plans where id=$1',[approved.data])).rows[0].period_end).toISOString().slice(0,10),'2030-11-19');
      assert.equal((await student.rpc('postpone_coaching_plan_item',{p_item:original.id,p_expected_start:shifted.scheduled_start,p_request:id(601)})).error.code,'23514','unconfirmed next-day capacity is not invented');
    });

    await t.test('file work started by A is canceled on identity change before any B writes; classification corrections preserve stages',async()=>{
      let principal=A,entered,release;
      const started=new Promise(resolve=>{entered=resolve;}),gate=new Promise(resolve=>{release=resolve;});
      const clients=new Map([[A,student],[B,other]]),live=new Proxy({},{get:(_t,key)=>clients.get(principal)[key]});
      const load=moduleLoader({window:app.window,process},name=>{
        if(/(?:supabase-client|supabase[\\/]client)(?:\.ts)?$/.test(name))return {getSupabaseBrowserClient:()=>live,getSupabaseClient:()=>live,isSupabaseConfigured:true};
        if(name==='./extract'||/file-intake[\\/]extract(?:\.ts)?$/.test(name))return {MAX_INTAKE_BYTES:20*1024*1024,detectKind:()=> 'pdf',normalizedFile:f=>f,
          extractContent:async()=>{entered();await gate;return {kind:'pdf',text:'private account A notes'};}};
        if(/problem-bank[\\/]analyze(?:\.ts)?$/.test(name))return {getProblemConsent:()=> 'declined',problemAiAvailable:async()=>false};
      });
      const local=load(path.join(root,'src/lib/private-storage.ts'));local.setStorageUser(A);
      const pipeline=load(path.join(root,'src/lib/file-intake/pipeline.ts'));
      const work=pipeline.processUpload(new File(['%PDF-1.7\nprivate A'],'private-A.pdf',{type:'application/pdf'}),{useAi:false,uploadToDrive:false},()=>{});
      const rejected=assert.rejects(work,/계정/);await started;principal=B;local.setStorageUser(B);release();await rejected;
      assert.equal((await db.query('select count(*)::int n from notes where user_id=$1',[B])).rows[0].n,0);
      assert.equal(local.privateStorage.getItem('unilink:file-intake-log'),null);
      principal=A;local.setStorageUser(A);local.privateStorage.setItem('unilink:courses',JSON.stringify([course]));
      const note=id(700),record={id:'persisted-old-intake',fileName:'problem.pdf',source:'drive',status:'done',docType:'problem_set',
        noteId:note,courseId:course.id,problemSubjectId:id(50),problemSourceFile:'midterm::old.pdf'};
      await db.query(`insert into notes(id,user_id,title,course_name,linked_type,linked_id,source,sync_status,file_name)
        values ($1,$2,'Problems','Database','course',$3,'Google Drive','synced','problem.pdf')`,[note,A,course.id]);
      const result=await pipeline.reassignRecord(record,{docType:'lecture'});
      assert.equal(result.docType,'lecture');
      assert.equal((await db.query('select level from problem_bank_problems where id=$1',[id(51)])).rows[0].level,1);
      assert.equal(result.problemSubjectId,record.problemSubjectId);
    });

    await t.test('chat queue serializes requests and cancels waiting work after new chat or account changes',async()=>{
      const queue=app.lib('chat-record/queue').createChatQueue(),seen=[];
      let release,entered;const gate=new Promise(resolve=>{release=resolve;}),started=new Promise(resolve=>{entered=resolve;});
      const one=queue.enqueue(async check=>{seen.push(1);entered();await gate;check();seen.push(2);});
      const two=queue.enqueue(async()=>{seen.push(3);});await started;release();await one;await two;
      assert.deepEqual(seen,[1,2,3]);
      const canceled=queue.enqueue(async()=>{throw new Error('must not run');});queue.cancel();await assert.rejects(canceled,/중단/);
      const ownerCheck=queue.enqueue(async()=>{throw new Error('must not run');});app.local.setStorageUser(B);
      await assert.rejects(ownerCheck,/계정/);app.local.setStorageUser(A);
    });
  }finally{await db.close();}
});

test('approval flush and supported prompt versions are wired in the UI',()=>{
  const ui=readFileSync(path.join(root,'src/components/coaching/CoachingRequestPanel.tsx'),'utf8');
  const approve=ui.slice(ui.indexOf('async function approve()'));
  assert.ok(approve.indexOf('await flushP0Changes()')<approve.indexOf('db.rpc("approve_coaching_proposal"'));
  assert.ok(ui.includes('"diagnostic-manual-preservation-v18", "state-integrity-v19"'));
});

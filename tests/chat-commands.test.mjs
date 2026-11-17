import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase,createClient,createBrowser,moduleLoader,root } from '../scripts/simulation/runtime.mjs';
import { parseCommands,commandDate,commandTime,commandsSchema } from '../supabase/functions/_shared/chatCommands.ts';
import path from 'node:path';

const A='00000000-0000-4000-8000-000000007001',B='00000000-0000-4000-8000-000000007002';
const cmd=(kind,patch={})=>parseCommands([{kind,...patch}],{courses:[{id:'math'}],notes:[]})[0];
const context={signedIn:true,userId:A,courses:[{id:'math',name:'수학'}],goals:new Map(),topics:new Map(),files:new Map(),subjects:new Map()};

test('draft parsing rejects invented IDs and invalid dates/times; no operation comes from free text',()=>{
  assert.equal(commandDate('2026-02-30'),null);assert.equal(commandTime('25:00'),null);assert.equal(commandTime('24:00',true),'24:00');
  assert.deepEqual(parseCommands([{kind:'delete_everything'}],{courses:[],notes:[]}),[]);
  assert.deepEqual(parseCommands([{kind:'add_task',course_id:'foreign'}],{courses:[],notes:[]}),[]);
  assert.equal(commandsSchema.items.additionalProperties,false);
  assert.deepEqual([...commandsSchema.items.required].sort(),Object.keys(commandsSchema.items.properties).sort());
});

test('yes/no command execution uses real storage, P0 SQL, cancellation and account guards',async t=>{
  const {db}=await createDatabase();let stop;
  try {
    await db.query('insert into auth.users(id) values($1),($2)',[A,B]);
    const student=createClient(db,{userId:A}),app=createBrowser(student,A),sync=app.lib('p0-sync');
    await sync.initializeP0Account(A);stop=sync.startP0SyncListener();
    const run=app.lib('chat-command-executor'),noop=()=>{};
    await t.test('preparing and declining have zero writes; copied or canceled drafts cannot execute',async()=>{
      const prepared=(await run.prepareChatCommand(cmd('add_event',{title:'독서',date:'2030-11-18',start_time:'14:00',end_time:'15:00'}),context,[],'2030-11-17',noop,'일정 추가')).prepared;
      assert.ok(prepared);assert.equal((await db.query('select count(*)::int n from calendar_events')).rows[0].n,0);
      await assert.rejects(run.executePreparedCommand({...prepared},noop),/유효하지/);
      run.discardPreparedCommand(prepared);await assert.rejects(run.executePreparedCommand(prepared,noop),/취소/);
      assert.equal(app.lib('timetable-storage').getMonthlyEvents().length,0);
    });
    await t.test('one yes creates exactly one event locally and remotely, including concurrent/repeated confirmation',async()=>{
      const prepared=(await run.prepareChatCommand(cmd('add_event',{title:'공부 약속',date:'2030-11-18',start_time:'14:00',end_time:'15:00'}),context,[],'2030-11-17',noop,'등록해줘')).prepared;
      const results=await Promise.all([run.executePreparedCommand(prepared,noop),run.executePreparedCommand(prepared,noop)]);
      assert.equal(results[0].message,results[1].message);
      await run.executePreparedCommand(prepared,noop);
      assert.equal(app.lib('timetable-storage').getMonthlyEvents().length,1);
      assert.equal((await db.query('select count(*)::int n from calendar_events')).rows[0].n,1);
    });
    await t.test('goals/manual plans are added to DB only after confirmation; same manual plan ID never duplicates',async()=>{
      let p=(await run.prepareChatCommand(cmd('add_goal',{title:'선형대수 복습',date:'2030-12-01'}),context,[],'2030-11-17',noop,'목표추가')).prepared;
      const before=(await db.query('select count(*)::int n from learning_goals')).rows[0].n;
      await run.executePreparedCommand(p,noop);
      assert.equal((await db.query('select count(*)::int n from learning_goals')).rows[0].n,before+1);
      p=(await run.prepareChatCommand(cmd('add_plan',{title:'미분 1문제',date:'2030-11-18'}),context,[],'2030-11-17',noop,'계획추가')).prepared;
      await run.executePreparedCommand(p,noop);await run.executePreparedCommand(p,noop);
      assert.equal(app.lib('study-storage').getWeeklyStudyPlans().filter(x=>x.id===p.id).length,1);
      assert.equal((await db.query("select count(*)::int n from study_plans where source_type='manual'")).rows[0].n,1);
      assert.throws(()=>app.lib('study-storage').addWeeklyStudyPlan({id:p.id,title:'다른 제목',dueDate:'2030-11-18'}),/변경/);
    });
    await t.test('course confirmation creates its real goal/schedule and course tasks use the existing owned DB path',async()=>{
      const courseCommand=cmd('add_course',{title:'통계학',credits:3,term:'2030년 2학기',weekdays:[1,3],start_time:'10:00',end_time:'11:00'});
      const p=(await run.prepareChatCommand(courseCommand,context,[],'2030-11-17',noop,'통계학 수업 추가')).prepared;
      assert.equal((await db.query('select count(*)::int n from courses')).rows[0].n,0);
      await run.executePreparedCommand(p,noop);
      assert.equal((await db.query('select count(*)::int n from courses')).rows[0].n,1);
      assert.equal((await db.query('select count(*)::int n from course_schedules')).rows[0].n,2);
      const local=app.lib('course-storage').getAllStoredCourses()[0],goal=(await db.query("select id from learning_goals where goal_type='course'")).rows[0];
      const ctx={...context,courses:[local],goals:new Map([[local.id,goal.id]])};
      const task=parseCommands([{kind:'add_task',course_id:local.id,title:'과제 제출',date:'2030-11-20',start_time:'17:00',event_type:'assignment'}],{courses:ctx.courses,notes:[]})[0];
      const before=(await db.query('select count(*)::int n from calendar_events')).rows[0].n;
      const draft=(await run.prepareChatCommand(task,ctx,[],'2030-11-17',noop,'과제등록')).prepared;
      assert.equal((await db.query('select count(*)::int n from calendar_events')).rows[0].n,before);
      await run.executePreparedCommand(draft,noop);
      const saved=(await db.query("select goal_id,event_type,due_at from calendar_events where title='과제 제출'")).rows[0];
      assert.equal(saved.goal_id,goal.id);assert.equal(saved.event_type,'assignment');assert.ok(saved.due_at);
      assert.equal(new Date(saved.due_at).getTime(),new Date('2030-11-20T17:00:00').getTime());
      for (const event_type of ['assignment','project']) {
        const command={...task,title:`시각미지정-${event_type}`,start_time:null,event_type};
        const prepared=(await run.prepareChatCommand(command,ctx,[],'2030-11-17',noop,'20일까지 제출')).prepared;
        assert.ok(prepared);assert.ok(prepared.summary.some(line=>line.includes('23:59')));
        await run.executePreparedCommand(prepared,noop);
        const row=(await db.query('select due_at from calendar_events where id=$1',[prepared.id])).rows[0];
        assert.equal(new Date(row.due_at).getTime(),new Date('2030-11-20T23:59:00').getTime());
      }
      const exam=await run.prepareChatCommand({...task,event_type:'exam',start_time:null},ctx,[],'2030-11-17',noop,'시험 등록');
      assert.ok(exam.question);assert.equal(exam.prepared,undefined);

    });
    await t.test('grade confirmation remains local and preserves fractional credits',async()=>{
      const p=(await run.prepareChatCommand(cmd('add_grade',{title:'세미나',term:'2학년 2학기',credits:0.5,grade:'P'}),context,[],'2030-11-17',noop,'성적추가')).prepared;
      assert.equal(app.lib('record-storage').getGradeRecords().length,0);
      await run.executePreparedCommand(p,noop);await run.executePreparedCommand(p,noop);
      const rows=app.lib('record-storage').getGradeRecords();assert.equal(rows.length,1);assert.equal(rows[0].credits,0.5);assert.equal(rows[0].grade,'P');
    });
    await t.test('switching A to B to A invalidates the original confirmation; missing data never writes',async()=>{
      const p=(await run.prepareChatCommand(cmd('add_goal',{title:'취소할 목표'}),context,[],'2030-11-17',noop,'목표추가')).prepared;
      app.local.setStorageUser(B);app.local.setStorageUser(A);
      await assert.rejects(run.executePreparedCommand(p,noop),/계정/);
      const q=await run.prepareChatCommand(cmd('add_event',{title:'시간 미정'}),context,[],'2030-11-17',noop,'추가해줘');
      assert.ok(q.question);assert.equal(q.prepared,undefined);
      assert.equal((await db.query("select count(*)::int n from learning_goals where title='취소할 목표'")).rows[0].n,0);
    });
    await t.test('text confirmation is exact and cannot mistake a correction for approval',()=>{
      assert.equal(run.parseConfirmation('네, 해줘!'),'yes');assert.equal(run.parseConfirmation('아니오'),'no');
      assert.equal(run.parseConfirmation('아니 내일 3시로 바꿔줘'),null);assert.equal(run.parseConfirmation('예라고 하지 않았어'),null);
    });
  }finally{stop?.();await db.close();}
});

test('PDF transmission requires the registered yes draft and source changes invalidate approval',async()=>{
  let sends=0;
  let note={id:'pdf',title:'강의자료',fileName:'lecture.pdf',filePath:'owned/lecture.pdf',version:1,updatedAt:'2026-11-16T00:00:00Z',linkedType:'course',linkedId:'math'};
  const db={auth:{getUser:async()=>({data:{user:{id:A}}})},functions:{invoke:async()=>{sends++;return {data:{analysis_id:'analysis'},error:null};}},
    from:()=>{const q={select(){return q;},eq(){return q;},single:async()=>({data:{id:'analysis',status:'completed',note_version:note.version,note_updated_at:note.updatedAt},error:null}),order:async()=>({data:[{kind:'topic',title:'미분',date_text:''},{kind:'assignment',title:'연습 1',date_text:'다음 주'}],error:null})};return q;}};
  const loader=moduleLoader({window:{},structuredClone},name=>{
    if(/(?:supabase-client|supabase\/client)(?:\.ts)?$/.test(name))return {getSupabaseBrowserClient:()=>db,getSupabaseClient:()=>db,isSupabaseConfigured:()=>true};
    if(name.endsWith('private-storage'))return {captureStorageScope:()=>()=>{},getStorageUser:()=>A};
    if(name.endsWith('my-notes-storage'))return {getMyNotes:async()=>[note]};
    if(name.endsWith('file-intake/lecture-registration'))return {compareExistingLecture:async()=>{}};
  });
  const exec=loader(path.join(root,'src/lib/chat-command-executor.ts'));
  const command=parseCommands([{kind:'analyze_pdf',note_id:'pdf'}],{courses:context.courses,notes:[note]})[0];
  let p=(await exec.prepareChatCommand(command,context,[note],'2026-11-16',()=>{},'PDF 분석')).prepared;
  assert.equal(sends,0);exec.discardPreparedCommand(p);await assert.rejects(exec.executePreparedCommand(p,()=>{}));assert.equal(sends,0);
  p=(await exec.prepareChatCommand(command,context,[note],'2026-11-16',()=>{},'PDF 분석')).prepared;
  note={...note,version:2};await assert.rejects(exec.executePreparedCommand(p,()=>{}),/변경/);assert.equal(sends,0);
  p=(await exec.prepareChatCommand(command,context,[note],'2026-11-16',()=>{},'PDF 분석')).prepared;
  const result=await exec.executePreparedCommand(p,()=>{});assert.equal(sends,1);assert.match(result.message,/분석 완료/);assert.match(result.message,/강의 내용/);assert.match(result.message,/아직 일정으로 등록하지 않았어요/);
});

test('expired confirmation does not even begin an authenticated mutation',async()=>{
  let now=Date.now(),authCalls=0;
  class Clock extends Date {static now(){return now;}}
  const loader=moduleLoader({window:{},Date:Clock,structuredClone},name=>{
    if(/(?:supabase-client|supabase\/client)(?:\.ts)?$/.test(name))return {getSupabaseBrowserClient:()=>({auth:{getUser:async()=>{authCalls++;return {data:{user:{id:A}}};}}}),getSupabaseClient:()=>null,isSupabaseConfigured:()=>true};
    if(name.endsWith('private-storage'))return {captureStorageScope:()=>()=>{},getStorageUser:()=>A};
  });
  const exec=loader(path.join(root,'src/lib/chat-command-executor.ts'));
  const p=(await exec.prepareChatCommand(cmd('add_goal',{title:'만료 목표'}),context,[],'2026-11-16',()=>{},'목표추가')).prepared;
  now+=6*60000;await assert.rejects(exec.executePreparedCommand(p,()=>{}),/확인 시간이/);assert.equal(authCalls,0);
});

test('AI planning is generated as a preview, then only yes invokes approval RPC',async()=>{
  let approvals=0,generations=0,user=A,expectedStart='14:00',expectedEnd='15:00',expectedMinutes=30;
  const item={goal_id:'goal',topic_id:null,method_code:'concept_review',title:'미분 연습',planned_date:'2030-11-18',start_time:'14:00',planned_minutes:30,reason:'연습'};
  const db={auth:{getUser:async()=>({data:{user:{id:user}}})},
    from:()=>{const q={select(){return q;},eq(){return q;},in(){return Promise.resolve({data:[{id:'goal',title:'수학'}],error:null});}};return q;},
    functions:{invoke:async(name,{body})=>{assert.equal(name,'coaching-propose');generations++;assert.equal(body.day_budgets[0].windows[0].start,expectedStart);assert.equal(body.day_budgets[0].windows[0].end,expectedEnd);assert.equal(body.day_budgets[0].minutes,expectedMinutes);return {data:{schema_version:2,persisted:false,proposal_run_id:'run',proposal:{summary:'제안',items:[item],deferred_goals:[]}},error:null};}},
    rpc:async(name,args)=>{assert.equal(name,'approve_coaching_proposal');assert.equal(args.p_run_id,'run');approvals++;return {data:'plan',error:null};}};
  const loader=moduleLoader({window:{},structuredClone},name=>{
    if(/(?:supabase-client|supabase\/client)(?:\.ts)?$/.test(name))return {getSupabaseBrowserClient:()=>db,getSupabaseClient:()=>db,isSupabaseConfigured:()=>true};
    if(name.endsWith('private-storage'))return {captureStorageScope:()=>{const original=user;return ()=>{if(original!==user)throw new Error('계정 변경');};},getStorageUser:()=>user};
    if(name.endsWith('p0-sync'))return {flushP0Changes:async()=>{}};
    if(name.endsWith('course-knowledge'))return {courseKnowledgeEnabled:false,prepareCourseKnowledge:async()=>{}};
  });
  const exec=loader(path.join(root,'src/lib/chat-command-executor.ts'));
  const result=await exec.prepareChatCommand(cmd('generate_plan',{course_id:'math',minutes:30,start_time:'14:00',end_time:'15:00',date:'2030-11-18',period_end:'2030-11-18',intent:'weekly_plan'}),{...context,goals:new Map([['math','goal']])},[],'2030-11-17',()=>{},'미분계획');
  assert.equal(generations,1);assert.equal(approvals,0);assert.equal(result.prepared.phase,'approve_plan');
  await exec.executePreparedCommand(result.prepared,()=>{});await exec.executePreparedCommand(result.prepared,()=>{});
  assert.equal(approvals,1);
  for(const [patch,start,end,minutes] of [
    [{},'09:00','22:00',60],
    [{start_time:'14:30',end_time:'15:00'},'14:30','15:00',30],
    [{minutes:90},'09:00','22:00',90],
    [{start_time:'18:00'},'18:00','22:00',60],
  ]) {
    expectedStart=start;expectedEnd=end;expectedMinutes=minutes;
    const result=await exec.prepareChatCommand(cmd('generate_plan',{course_id:'math',date:'2030-11-18',period_end:'2030-11-18',...patch}),{...context,goals:new Map([['math','goal']])},[],'2030-11-17',()=>{},'복습 계획 만들어줘');
    assert.equal(result.question,undefined);assert.equal(result.prepared.phase,'approve_plan');
    assert.ok(result.prepared.summary.some(line=>line.startsWith('임시 추천 조건:')));
    assert.equal(approvals,1);
  }
  const conflict=await exec.prepareChatCommand(cmd('generate_plan',{course_id:'math',start_time:'15:00',end_time:'14:00'}),{...context,goals:new Map([['math','goal']])},[],'2030-11-17',()=>{},'계획');
  assert.ok(conflict.question);assert.equal(generations,5);
});

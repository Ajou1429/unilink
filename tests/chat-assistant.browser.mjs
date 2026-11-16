import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { parseCommands } from '../supabase/functions/_shared/chatCommands.ts';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.AJOU_PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.AJOU_BROWSER_EXECUTABLE?{executablePath:process.env.AJOU_BROWSER_EXECUTABLE}:{})});
const base=process.env.AJOU_TEST_URL||'http://127.0.0.1:3041';
const output=process.env.AJOU_SCREENSHOTS||'/tmp/unilink-chat-browser';mkdirSync(output,{recursive:true});
const uid='00000000-0000-4000-8000-000000006001',cid='00000000-0000-4000-8000-000000006002',gid='00000000-0000-4000-8000-000000006003';
const user={id:uid,aud:'authenticated',role:'authenticated',email:'browser-test@example.invalid',user_metadata:{display_name:'테스트'},app_metadata:{provider:'email'},created_at:'2026-01-01T00:00:00Z'};
const course={id:cid,name:'수학',term:'2026년 2학기',professor:'',credits:3,courseCode:'MATH101',days:[],startTime:'',endTime:'',location:'',color:'#2563eb',createdAt:'2026-01-01T00:00:00Z'};
try{
 for(const [name,viewport] of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
  const context=await browser.newContext({viewport}),page=await context.newPage(),errors=[],calls=[],consoleErrors=[];
  let approvals=0,eventWrites=0,observations=0;
  const calendar=new Map();
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});
  await context.addInitScript(({uid,user})=>{
   const encode=v=>btoa(JSON.stringify(v)).replaceAll('=','').replaceAll('+','-').replaceAll('/','_');
   const access_token=encode({alg:'HS256',typ:'JWT'})+'.'+encode({sub:uid,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated',aud:'authenticated'})+'.mock';
   localStorage.setItem('sb-lqwpcwzjbqeunqfliaso-auth-token',JSON.stringify({access_token,refresh_token:'test-only',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user}));
  },{uid,user});
  // Every Supabase request is intercepted: no production DB writes or paid model calls.
  await context.route('https://*.supabase.co/**',async route=>{
   const req=route.request(),url=new URL(req.url());
   const json=async(data,status=200)=>route.fulfill({status,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(data)});
   if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'}});
   if(url.pathname==='/auth/v1/user')return json(user);
   if(url.pathname.includes('/functions/v1/chat-record')){
    const body=req.postDataJSON();calls.push(body);
    if(body.files?.length){assert.ok(body.files.every(f=>f.status==='error'));return json({result:{protocol_version:2,reply:'첨부 파일을 읽지 못했어요. 정상 PDF로 다시 첨부해 주세요.',actions:[],tools:[],commands:[],dropped:0}});}
    if(body.message.includes('이해했어'))return json({result:{protocol_version:2,reply:'이해도 기록을 확인해 주세요.',tools:[],commands:[],dropped:0,actions:[{kind:'topic',course_id:cid,date:null,topic:'미분',status:'understood',rating:null,progress_title:null,page_start:null,page_end:null,difficulty:null,pace:null,problem_file:null,problem_labels:[],problem_level:null,quote:'미분 이해했어'}]}});
    const next=new Date(body.today+'T12:00:00Z');next.setUTCDate(next.getUTCDate()+1);const date=next.toISOString().slice(0,10);
    let command=null;
    if(body.message.includes('계획')||body.pending_command?.kind==='generate_plan')command={kind:'generate_plan',course_id:cid,date,period_end:date,intent:'weekly_plan',
      ...(body.message.includes('90')?{minutes:90,start_time:'14:00',end_time:'17:00'}:{})};
    if(body.message.includes('약속'))command={kind:'add_event',title:'공부 약속',date,start_time:'14:00',end_time:'15:00'};
    return json({result:{protocol_version:2,reply:command?'요청을 정리했어요. 추가 전에 예/아니오로 확인할게요.':'안녕하세요! 공부 질문도 편하게 해 주세요.',actions:[],dropped:0,
      commands:command?parseCommands([command],{courses:body.courses,notes:body.notes}):[],
      tools:body.message.includes('시간표')?[{feature:'timetable',course_id:null,note_id:null,intent:null}]:[]}});
   }
   if(url.pathname.includes('/functions/v1/course-knowledge'))return json({status:'ready',pdf_count:0,pdf_ready:0,pending_steps:0,research_status:'disabled',overview_complete:true,detail_complete:true});
   if(url.pathname.includes('/functions/v1/coaching-propose')){const body=req.postDataJSON();return json({schema_version:2,persisted:false,proposal_run_id:'00000000-0000-4000-8000-000000006004',proposal:{summary:'수학 미분 계획 제안',items:[{goal_id:gid,topic_id:null,method_code:'concept_review',title:'미분 1문제',planned_date:body.period_start,start_time:'14:00',planned_minutes:30,reason:'연습',completion_criteria:{task_scope:'미분 한 문제',observable_check:'풀이를 설명한다',evidence_ids:[]}}],deferred_goals:[]}});}
   if(url.pathname.includes('/functions/'))return json({connected:false});
   const table=url.pathname.split('/').at(-1);
   if(table==='approve_coaching_proposal'){approvals++;return json('00000000-0000-4000-8000-000000006005');}
   if(table==='record_chat_topic_observation'){observations++;return json({observation_id:'00000000-0000-4000-8000-000000006006',topic_id:'00000000-0000-4000-8000-000000006007',title:'미분',created:true});}
   if(req.method()!=='GET'){
    if(table==='calendar_events'){const body=req.postDataJSON();for(const row of Array.isArray(body)?body:[body])calendar.set(row.id,row);eventWrites++;}
    return json([]);
   }
   if(table==='courses')return json([{id:cid,user_id:uid,name:course.name,term:course.term,status:'active',credits:3,metadata:{schema_version:1,legacy_bucket:'unilink:courses',legacy_record:course}}]);
   if(table==='learning_goals')return json([{id:gid,user_id:uid,title:'수학',course_id:cid,goal_type:'course',status:'active',metadata:{schema_version:1,legacy_record:{courseId:cid}}}]);
   if(table==='calendar_events'){
    const type=url.searchParams.get('event_type');
    return json([...calendar.values()].filter(row=>!type||!type.startsWith('eq.')||row.event_type===type.slice(3)));
   }
   return json([]);
  });
  await page.goto(base+'/dashboard');await page.getByRole('textbox',{name:'메시지 입력'}).waitFor();
  async function send(text){await page.getByRole('textbox',{name:'메시지 입력'}).fill(text);await page.getByRole('button',{name:'보내기',exact:true}).click();}
  await send('안녕');await page.getByRole('button',{name:'동의하고 대화',exact:true}).click();
  await page.getByText('안녕하세요! 공부 질문도 편하게 해 주세요.',{exact:true}).waitFor();assert.equal(calls.length,1);
  await send('수학 이번 주 공부 계획을 세워줘');
  await page.getByText('09:00 ~ 22:00 중 하루 최대 60분',{exact:false}).waitFor();
  assert.equal(await page.getByRole('dialog').count(),0);
  await send('수학 계획을 오후 2~5시, 90분으로 수정해줘');
  await page.getByText('새 요청으로 이전 미확정 제안은 취소했어요.',{exact:true}).waitFor();
  const plan=page.getByRole('region',{name:'채팅 요청 확인'}).last();await plan.getByRole('button',{name:'예',exact:true}).waitFor();
  assert.equal(approvals,0);assert.ok(calls.at(-1).message.includes('90분'));
  await page.screenshot({path:`${output}/${name}-plan.png`,fullPage:true});
  const beforeYes=calls.length;await send('예');await page.getByText('확인한 시간표를 학습 계획에 저장했어요.',{exact:true}).waitFor();
  assert.equal(approvals,1);assert.equal(calls.length,beforeYes);
  await send('내일 오후 2~3시 공부 약속 추가해줘');
  let card=page.getByRole('region',{name:'채팅 요청 확인'}).last();await card.getByRole('button',{name:'아니오',exact:true}).click();assert.equal(eventWrites,0);
  await send('내일 오후 2~3시 공부 약속 추가해줘');
  card=page.getByRole('region',{name:'채팅 요청 확인'}).last();await card.getByRole('button',{name:'예',exact:true}).waitFor();
  await card.getByRole('button',{name:'예',exact:true}).evaluate(button=>{button.click();button.click();});
  await page.getByText('공부 약속을(를) 시간표에 등록했어요.',{exact:true}).waitFor();assert.equal(calendar.size,1);
  await send('수학 미분 이해했어');await page.getByText('확인된 내용을 기록할까요?',{exact:true}).waitFor();assert.equal(observations,0);
  await send('아니오');assert.equal(observations,0);
  await send('수학 미분 이해했어');await page.getByText('확인된 내용을 기록할까요?',{exact:true}).waitFor();
  await page.getByRole('button',{name:'예',exact:true}).click();await page.getByText('새 주제',{exact:true}).waitFor();assert.equal(observations,1);
  await send('시간표 열어줘');const timetable=page.getByRole('region',{name:'시간표·일정'});await timetable.waitFor();
  await timetable.getByRole('button',{name:'실행 화면 열기'}).click();
  await page.frameLocator('iframe').getByRole('heading',{name:'시간표',exact:true}).waitFor();await page.keyboard.press('Escape');
  await page.locator('input[type="file"]').first().setInputFiles({name:'broken.pdf',mimeType:'application/pdf',buffer:Buffer.from('not a PDF')});
  // File-only upload followed immediately by a separate request must wait for the file.
  await page.getByRole('button',{name:'보내기',exact:true}).click();
  await send('이 파일 분석해줘');await page.getByText('첨부 파일을 읽지 못했어요. 정상 PDF로 다시 첨부해 주세요.',{exact:true}).waitFor();
  assert.equal(calls.at(-1).files[0].status,'error');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:`${output}/${name}-chat.png`,fullPage:true});
  await page.evaluate(()=>window.dispatchEvent(new Event('unilink:newChat')));
  assert.equal(await page.getByText('안녕하세요! 공부 질문도 편하게 해 주세요.',{exact:true}).count(),0);
  assert.deepEqual(errors,[]);assert.deepEqual(consoleErrors,[]);await context.close();
 }
 console.log('PASS: desktop/mobile optional planning times without forms, plan preview and typed yes, no means zero writes, duplicate yes creates one event, feature browsing, failed attachment sequencing and reset');
}finally{await browser.close();}

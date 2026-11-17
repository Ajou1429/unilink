import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { parseCommands } from '../supabase/functions/_shared/chatCommands.ts';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.AJOU_PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.AJOU_BROWSER_EXECUTABLE?{executablePath:process.env.AJOU_BROWSER_EXECUTABLE}:{})});
const base=process.env.AJOU_TEST_URL||'http://127.0.0.1:3041';
const output=process.env.AJOU_SCREENSHOTS||'/tmp/unilink-chat-analysis-browser';mkdirSync(output,{recursive:true});
const uid='00000000-0000-4000-8000-000000006001',cid='00000000-0000-4000-8000-000000006002',gid='00000000-0000-4000-8000-000000006003';
const user={id:uid,aud:'authenticated',role:'authenticated',email:'browser-test@example.invalid',user_metadata:{display_name:'테스트'},app_metadata:{provider:'email'},created_at:'2026-01-01T00:00:00Z'};
const noteId='00000000-0000-4000-8000-000000006008', analysisId='00000000-0000-4000-8000-000000006009', updatedAt='2026-11-17T00:00:00Z';
const course={id:cid,name:'철근 콘크리트 설계',term:'2026년 2학기',professor:'',credits:3,courseCode:'MATH101',days:[],startTime:'',endTime:'',location:'',color:'#2563eb',createdAt:'2026-01-01T00:00:00Z'};
try{
 for(const [name,viewport] of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
  const context=await browser.newContext({viewport}),page=await context.newPage(),errors=[],calls=[],consoleErrors=[];
  let eventWrites=0,analysisCalls=0;
  const calendar=new Map(), rows=new Map();
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});
  await context.addInitScript(({uid,user})=>{
   const encode=v=>btoa(JSON.stringify(v)).replaceAll('=','').replaceAll('+','-').replaceAll('/','_');
   const access_token=encode({alg:'HS256',typ:'JWT'})+'.'+encode({sub:uid,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated',aud:'authenticated'})+'.mock';
   localStorage.setItem('sb-lqwpcwzjbqeunqfliaso-auth-token',JSON.stringify({access_token,refresh_token:'test-only',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user}));
   localStorage.setItem(`unilink:private:user:${uid}:unilink:chat-assistant-consent:v3`,'granted');
  },{uid,user});
  // Every Supabase request is intercepted: no production DB writes or paid model calls.
  await context.route('https://*.supabase.co/**',async route=>{
   const req=route.request(),url=new URL(req.url());
   const json=async(data,status=200)=>route.fulfill({status,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(data)});
   if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'}});
   if(url.pathname==='/auth/v1/user')return json(user);
   if(url.pathname.includes('/functions/v1/chat-record')){
    const body=req.postDataJSON();calls.push(body);
    const overview=JSON.parse(body.overview),evidence=overview.document_analysis;
    let draft=null,reply='';
    if(body.message.includes('분류만'))draft={kind:'classify_note',note_id:noteId,course_id:cid};
    else if(evidence) {
      assert.equal(evidence.candidates[0].description,'빨간 테두리: 전체 조 응시');
      if(body.message.includes('범위'))reply='보·기둥 설계 범위예요.';
      else draft={kind:'add_task',course_id:cid,event_type:'exam',title:'보 설계 시험',date:'2030-12-15',start_time:'09:00',end_time:'10:30',exam_scope:evidence.candidates[0].exam_scope};
    } else draft={kind:'analyze_pdf',note_id:noteId};
    return json({result:{protocol_version:2,reply,actions:[],tools:[],dropped:0,commands:draft?parseCommands([draft],{courses:body.courses,notes:body.notes}):[]}});
   }
   if(url.pathname.includes('/functions/v1/note-analyze')){analysisCalls++;return json({analysis_id:analysisId});}
   if(url.pathname.includes('/functions/v1/course-knowledge'))return json({status:'ready',pdf_count:0,pdf_ready:0,pending_steps:0,research_status:'disabled',overview_complete:true,detail_complete:true});
   if(url.pathname.includes('/functions/v1/coaching-propose')){const body=req.postDataJSON();return json({schema_version:2,persisted:false,proposal_run_id:'00000000-0000-4000-8000-000000006004',proposal:{summary:'수학 미분 계획 제안',items:[{goal_id:gid,topic_id:null,method_code:'concept_review',title:'미분 1문제',planned_date:body.period_start,start_time:'14:00',planned_minutes:30,reason:'연습',completion_criteria:{task_scope:'미분 한 문제',observable_check:'풀이를 설명한다',evidence_ids:[]}}],deferred_goals:[]}});}
   if(url.pathname.includes('/functions/'))return json({connected:false});
   const table=url.pathname.split('/').at(-1);
   if(table==='save_chat_conversation') {
    const body=req.postDataJSON(),old=rows.get(body.p_id);
    if((old?.revision??0)!==body.p_revision)return json({code:'40001',message:'conflict'},409);
    const revision=body.p_revision+1;rows.set(body.p_id,{id:body.p_id,user_id:uid,title:body.p_title,items:body.p_items,revision,updated_at:new Date().toISOString()});return json(revision);
   }
   if(table==='chat_conversations') {
    const id=url.searchParams.get('id');if(id)return json(rows.get(id.replace('eq.',''))||null);
    return json([...rows.values()].map(({id,title,updated_at})=>({id,title,updated_at})));
   }

   if(req.method()!=='GET'){
    if(table==='calendar_events'){const body=req.postDataJSON();for(const row of Array.isArray(body)?body:[body])calendar.set(row.id,row);eventWrites++;}
    return json([]);
   }
   if(table==='notes')return json([{id:noteId,user_id:uid,title:'실험자료',file_name:'실험자료.pdf',file_path:'owned/test.pdf',version:1,updated_at:updatedAt,created_at:updatedAt,linked_type:'personal',course_name:course.name,content:'',source:'직접 작성',sync_status:'manual',tags:[]}]);
   if(table==='note_analyses') {
    const row={id:analysisId,summary:'시험 안내',status:'completed',note_version:1,note_updated_at:updatedAt};
    return json(url.searchParams.has('id')?row:analysisCalls?[row]:[]);
   }
   if(table==='note_analysis_candidates')return json([{kind:'exam',title:'보 설계 시험',description:'빨간 테두리: 전체 조 응시',exam_scope:'보·기둥 설계',date_text:'12월 15일 오전 9시',page:1}]);
   if(table==='courses')return json([{id:cid,user_id:uid,name:course.name,term:course.term,status:'active',credits:3,metadata:{schema_version:1,legacy_bucket:'unilink:courses',legacy_record:course}}]);
   if(table==='learning_goals')return json([{id:gid,user_id:uid,title:'수학',course_id:cid,goal_type:'course',status:'active',metadata:{schema_version:1,legacy_record:{courseId:cid}}}]);
   if(table==='calendar_events'){
    const type=url.searchParams.get('event_type');
    return json([...calendar.values()].filter(row=>!type||!type.startsWith('eq.')||row.event_type===type.slice(3)));
   }
   return json([]);
  });
  await page.goto(base+'/dashboard');await page.getByRole('textbox',{name:'메시지 입력'}).waitFor();
  const send=async text=>{await page.getByRole('textbox',{name:'메시지 입력'}).fill(text);await page.getByRole('button',{name:'보내기',exact:true}).click();};
  await send('실험자료.pdf 분류만 해줘');
  let card=page.getByRole('region',{name:'반영 전 요청 확인'});await card.getByRole('button',{name:'아니오',exact:true}).click();assert.equal(analysisCalls,0);
  await send('실험자료.pdf에서 빨간 테두리 시험 일정을 등록해줘');
  card=page.getByRole('region',{name:'반영 전 요청 확인'});await card.getByRole('heading',{name:'철근 콘크리트 설계 시험 일자',exact:true}).waitFor();
  assert.equal(analysisCalls,1);assert.equal(eventWrites,0);
  assert.equal(await page.getByRole('region',{name:'반영 전 요청 확인'}).count(),1);
  assert.ok(calls.at(-1).message.includes('빨간 테두리'));
  assert.ok((await card.innerText()).includes('보·기둥 설계'));
  await page.screenshot({path:output+'/'+name+'-analysis-confirmation.png',fullPage:true});
  await card.getByRole('button',{name:'예',exact:true}).click();await page.waitForFunction(()=>[...document.querySelectorAll('[role="status"]')].some(el=>el.textContent.includes('수업 일정에 등록했어요')));assert.equal(eventWrites,1);
  await send('그 시험 범위 알려줘');await page.getByText('보·기둥 설계 범위예요.',{exact:true}).waitFor();assert.equal(analysisCalls,1);assert.equal(eventWrites,1);
  assert.deepEqual(errors,[]);
  console.log('PASS '+name+': classification has no analysis, needed PDF analysis runs automatically, original request continues with evidence, approval is required only for registration, completed analysis is reused');
  await context.close();
 }
}finally{await browser.close();}

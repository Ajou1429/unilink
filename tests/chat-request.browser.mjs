import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { parseCommands } from '../supabase/functions/_shared/chatCommands.ts';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.AJOU_PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.AJOU_BROWSER_EXECUTABLE?{executablePath:process.env.AJOU_BROWSER_EXECUTABLE}:{})});
const base=process.env.AJOU_TEST_URL||'http://127.0.0.1:3041';
const output=process.env.AJOU_SCREENSHOTS||'/tmp/unilink-chat-request-browser';mkdirSync(output,{recursive:true});
const uid='00000000-0000-4000-8000-000000006001',cid='00000000-0000-4000-8000-000000006002',gid='00000000-0000-4000-8000-000000006003';
const user={id:uid,aud:'authenticated',role:'authenticated',email:'browser-test@example.invalid',user_metadata:{display_name:'테스트'},app_metadata:{provider:'email'},created_at:'2026-01-01T00:00:00Z'};
const course={id:cid,name:'철근 콘크리트 설계',term:'2026년 2학기',professor:'',credits:3,courseCode:'MATH101',days:[],startTime:'',endTime:'',location:'',color:'#2563eb',createdAt:'2026-01-01T00:00:00Z'};
try{
 for(const [name,viewport] of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
  const context=await browser.newContext({viewport}),page=await context.newPage(),errors=[],calls=[],consoleErrors=[];
  let eventWrites=0,recordWrites=0;
  const calendar=new Map(), rows=new Map();
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});
  await context.addInitScript(({uid,user})=>{
   const encode=v=>btoa(JSON.stringify(v)).replaceAll('=','').replaceAll('+','-').replaceAll('/','_');
   const access_token=encode({alg:'HS256',typ:'JWT'})+'.'+encode({sub:uid,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated',aud:'authenticated'})+'.mock';
   localStorage.setItem('sb-lqwpcwzjbqeunqfliaso-auth-token',JSON.stringify({access_token,refresh_token:'test-only',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user}));
   localStorage.setItem(`unilink:private:user:${uid}:unilink:chat-assistant-consent:v2`,'granted');
  },{uid,user});
  // Every Supabase request is intercepted: no production DB writes or paid model calls.
  await context.route('https://*.supabase.co/**',async route=>{
   const req=route.request(),url=new URL(req.url());
   const json=async(data,status=200)=>route.fulfill({status,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(data)});
   if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'}});
   if(url.pathname==='/auth/v1/user')return json(user);
   if(url.pathname.includes('/functions/v1/chat-record')){
    const body=req.postDataJSON();calls.push(body);
    if(body.message.includes('이해했어'))return json({result:{protocol_version:2,reply:'학습 기록을 확인해 주세요.',tools:[],commands:[],dropped:0,actions:[{kind:'topic',course_id:cid,date:null,topic:'보 설계',status:'understood',rating:3,problem_labels:[],quote:body.message}]}});
    let draft=null;
    if(body.message.includes('시험')||body.pending_command){
      draft={...(body.pending_command??{kind:'add_task',course_id:cid,event_type:'exam',title:'철근 콘크리트 설계 시험이 12월 15일 오전 9시에 1시간 반 동안 봐',date:'2030-12-15',start_time:'09:00',exam_scope:'보·기둥 설계'}),...(body.message.includes('30분')?{end_time:'10:30'}:{})};
    }
    return json({result:{protocol_version:2,reply:draft?'### 철근 콘크리트 설계 시험이 12월 15일 오전 9시에 봐':'이전 시험 일정 이야기를 이어가고 있어요.',actions:[],tools:[],dropped:0,commands:draft?parseCommands([draft],{courses:body.courses,notes:body.notes}):[]}});
   }
   if(url.pathname.includes('/functions/v1/course-knowledge'))return json({status:'ready',pdf_count:0,pdf_ready:0,pending_steps:0,research_status:'disabled',overview_complete:true,detail_complete:true});
   if(url.pathname.includes('/functions/v1/coaching-propose')){const body=req.postDataJSON();return json({schema_version:2,persisted:false,proposal_run_id:'00000000-0000-4000-8000-000000006004',proposal:{summary:'수학 미분 계획 제안',items:[{goal_id:gid,topic_id:null,method_code:'concept_review',title:'미분 1문제',planned_date:body.period_start,start_time:'14:00',planned_minutes:30,reason:'연습',completion_criteria:{task_scope:'미분 한 문제',observable_check:'풀이를 설명한다',evidence_ids:[]}}],deferred_goals:[]}});}
   if(url.pathname.includes('/functions/'))return json({connected:false});
   const table=url.pathname.split('/').at(-1);
   if(table==='record_chat_topic_observation'){recordWrites++;return json({observation_id:'00000000-0000-4000-8000-000000006006',topic_id:'00000000-0000-4000-8000-000000006007',title:'보 설계',created:true});}
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
  const settle=()=>new Promise(r=>setTimeout(r,900));
  await send('철근 콘크리트 설계 시험이 12월 15일 오전 9시에 있어');
  await page.getByText('종료 시각을 알려주세요. 시작 시각보다 뒤여야 해요.',{exact:true}).waitFor();
  assert.equal(await page.getByRole('region',{name:'반영 전 요청 확인'}).count(),0);assert.equal(eventWrites,0);
  await settle();await page.reload();await page.getByText('종료 시각을 알려주세요. 시작 시각보다 뒤여야 해요.',{exact:true}).waitFor();
  assert.equal(eventWrites,0);
  await send('10시 30분에 끝나');
  let card=page.getByRole('region',{name:'반영 전 요청 확인'});await card.getByRole('heading',{name:'철근 콘크리트 설계 시험 일자',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'이전 요청 이어서 확인',exact:true}).count(),0);
  assert.equal(calls.at(-1).pending_command.start_time,'09:00');assert.ok(calls.at(-1).history.some(turn=>turn.text.includes('12월 15일')));
  assert.equal(await card.locator('h3').count(),1);assert.equal(await card.locator('ul[aria-label="내용"] li').innerText(),'시험 범위: 보·기둥 설계');
  assert.ok((await card.locator('footer').innerText()).includes('09:00–10:30'));
  const heading=await card.locator('h3').boundingBox(),footer=await card.locator('footer').boundingBox();assert.ok(footer.y>heading.y);
  await page.screenshot({path:output+'/'+name+'-confirmation.png',fullPage:true});
  await settle();await page.reload();await page.getByRole('button',{name:'이전 요청 이어서 확인',exact:true}).waitFor();
  assert.equal(eventWrites,0);assert.equal(await page.getByRole('region',{name:'반영 전 요청 확인'}).count(),0);
  const before=calls.length;await page.getByRole('button',{name:'이전 요청 이어서 확인',exact:true}).click();
  card=page.getByRole('region',{name:'반영 전 요청 확인'});await card.getByRole('button',{name:'예',exact:true}).waitFor();assert.equal(calls.length,before);assert.equal(eventWrites,0);
  await card.getByRole('button',{name:'예',exact:true}).evaluate(button=>{button.click();button.click();});
  await page.waitForFunction(()=>[...document.querySelectorAll('[role="status"]')].some(el=>el.textContent.includes('수업 일정에 등록했어요')));
  assert.equal(eventWrites,1);assert.equal(calendar.size,1);
  await settle();await page.reload();await page.getByRole('textbox',{name:'메시지 입력'}).waitFor();await settle();
  assert.equal(eventWrites,1);assert.equal(await page.getByRole('region',{name:'반영 전 요청 확인'}).count(),0);assert.equal(await page.getByRole('button',{name:'이전 요청 이어서 확인',exact:true}).count(),0);
  await send('그 일정에 대해 이어서 알려줘');await page.getByText('이전 시험 일정 이야기를 이어가고 있어요.',{exact:true}).waitFor();
  assert.ok(calls.at(-1).history.some(turn=>turn.text.includes('수업 일정에 등록했어요')));assert.ok(!calls.at(-1).pending_command);
  await send('철근 콘크리트 설계 보 설계를 이해했어');await page.getByText('확인된 내용을 기록할까요?',{exact:true}).waitFor();assert.equal(recordWrites,0);
  await settle();await page.reload();await page.getByRole('button',{name:'학습 기록 이어서 확인',exact:true}).waitFor();assert.equal(recordWrites,0);
  await send('예');await page.getByText('확인된 내용을 기록할까요?',{exact:true}).waitFor();assert.equal(recordWrites,0);
  await page.getByRole('button',{name:'예',exact:true}).click();await page.getByText('새 주제',{exact:true}).waitFor();assert.equal(recordWrites,1);
  await settle();await page.reload();await page.getByRole('textbox',{name:'메시지 입력'}).waitFor();await settle();assert.equal(recordWrites,1);assert.equal(await page.getByRole('button',{name:'학습 기록 이어서 확인',exact:true}).count(),0);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);
  console.log('PASS '+name+': noun title, bullet/time sections, conversational clarification, reopen missing/ready/done, fresh review, single approval and continued history');
  await context.close();
 }
}finally{await browser.close();}

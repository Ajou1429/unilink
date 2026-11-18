import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { moduleLoader,root } from '../scripts/simulation/runtime.mjs';
import { CHAT_FEATURES,ASSISTANT_INSTRUCTIONS,assistantSchema,parseAssistantRequest,parseAssistantOutput,assistantModelInput } from '../supabase/functions/_shared/chatAssistant.ts';
import { chatFeatureUrl } from '../src/lib/chat-feature-url.ts';

const body={consent:true,message:'이 강의 노트로 공부 계획을 세워줘',today:'2026-11-16',history:[],
  courses:[{id:'math',name:'수학',days:'월',code:null}],topics:[],problems:[],
  notes:[{id:'pdf-1',title:'미분 강의.pdf',course_id:'math'}],
  files:[{name:'미분 강의.pdf',status:'done',course_id:'math',note_id:'pdf-1'}],overview:'본인 일정'};

test('casual chat and tutoring keep long replies without requiring fake learning records',()=>{
  const reply='미분은 변화율을 뜻해요. '.repeat(60);
  const result=parseAssistantOutput({reply,actions:[],tools:[]},parseAssistantRequest({...body,message:'미분을 쉽게 알려줘'}));
  assert.equal(result.reply,reply.trim());assert.deepEqual(result.actions,[]);assert.deepEqual(result.tools,[]);
  assert.ok(!ASSISTANT_INSTRUCTIONS.includes('Do not explain concepts or solve problems'));
  assert.match(ASSISTANT_INSTRUCTIONS,/future plans.*NOT learning observations/);
});

test('execution requests are allowlisted and references must exist, including prototype keys',()=>{
  const request=parseAssistantRequest(body);
  const valid={feature:'study_plan',course_id:'math',note_id:'pdf-1',intent:'weekly_plan'};
  const result=parseAssistantOutput({reply:'조건을 확인하고 생성해요.',actions:[],tools:[valid,{...valid,feature:'__proto__'},{...valid,note_id:'foreign'}]},request);
  assert.deepEqual(result.tools,[valid]);assert.equal(result.dropped,2);
  assert.equal(assistantSchema.properties.tools.items.additionalProperties,false);
  assert.deepEqual(assistantSchema.required,['reply','actions','tools']);
});

test('attached file context distinguishes errors and excludes file bytes or injected fields',()=>{
  const request=parseAssistantRequest({...body,notes:[{...body.notes[0],content:'PRIVATE_PDF_CONTENT'}],
    files:[{...body.files[0],status:'error',fileDataUrl:'SECRET_BYTES'},{...body.files[0],status:'processing'}]});
  assert.equal(request.files.length,1);assert.equal(request.files[0].status,'error');
  const input=JSON.stringify(assistantModelInput(request));
  assert.ok(!input.includes('PRIVATE_PDF_CONTENT'));assert.ok(!input.includes('SECRET_BYTES'));
  assert.match(ASSISTANT_INSTRUCTIONS,/NOT a fully analyzed PDF/);
});

test('only valid plan time drafts are forwarded; reversed/partial windows do not become availability',()=>{
  const request=parseAssistantRequest(body),base={feature:'study_plan',course_id:'math',note_id:null,intent:'weekly_plan'};
  let result=parseAssistantOutput({actions:[],tools:[{...base,daily_minutes:90,start_hour:14,end_hour:17}]},request);
  assert.equal(result.tools[0].daily_minutes,90);assert.equal(result.tools[0].start_hour,14);
  result=parseAssistantOutput({actions:[],tools:[{...base,daily_minutes:900,start_hour:18,end_hour:14}]},request);
  assert.equal(result.tools[0].daily_minutes,undefined);assert.equal(result.tools[0].start_hour,undefined);
});

test('all service workspaces use trusted routes and Pages URLs encode IDs without path injection',()=>{
  for(const feature of Object.keys(CHAT_FEATURES)){
    const url=chatFeatureUrl({feature,course_id:'x&unsafe=1',note_id:null,intent:null},'/unilink');
    assert.ok(url.startsWith('/unilink/'));assert.ok(url.includes('.html?chatEmbed=1'));
    if(feature==='courses')assert.ok(url.includes('courseId=x%26unsafe%3D1'));
  }
  assert.throws(()=>chatFeatureUrl({feature:'https://evil.invalid',course_id:null}),/지원하지/);
});

test('assistant endpoint uses the richer protocol while preserving record-only clients and quota guard',async()=>{
  let sent;
  const load=moduleLoader({Deno:{env:{get:key=>key==='OPENAI_API_KEY'?'mock':undefined}},console:{...console,error(){}},fetch:async(_url,init)=>{
    sent=JSON.parse(init.body);return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({reply:'안녕하세요! 무엇을 도와드릴까요?',actions:[],tools:[]})}]}],usage:{input_tokens:10,output_tokens:20}});
  }},name=>{
    if(name.endsWith('supabaseAdmin.ts'))return {getUserFromAuthHeader:async()=>({id:'owner'}),getAdminClient:()=>({rpc:async()=>({data:true,error:null})})};
    if(name.endsWith('coachingSettings.ts'))return {loadCoachingSettings:async()=>({analysis_model:'configured-model'})};
  });
  const {handleChatRecord}=load(path.join(root,'supabase/functions/chat-record/index.ts'));
  const send=raw=>handleChatRecord(new Request('https://example.test/chat-record',{method:'POST',body:JSON.stringify(raw)}));
  let response=await send({...body,message:'안녕',assistant_protocol:1});
  assert.equal(response.status,200);assert.equal((await response.json()).result.protocol_version,1);
  assert.equal(sent.store,false);assert.equal(sent.max_output_tokens,3500);assert.ok(sent.text.format.schema.properties.tools);
  assert.equal(sent.model,'gpt-6.1-terra');
  response=await send(body);assert.equal(response.status,200);assert.equal((await response.json()).result.protocol_version,undefined);
  assert.equal(sent.max_output_tokens,1200);assert.equal(sent.text.format.schema.properties.tools,undefined);
  assert.equal(sent.model,'configured-model');
  response=await send({...body,assistant_protocol:2});assert.equal(response.status,200);
  const confirmed=(await response.json()).result;assert.equal(confirmed.protocol_version,2);assert.deepEqual(confirmed.commands,[]);
  assert.ok(sent.text.format.schema.properties.commands);assert.match(sent.instructions,/NEVER a tool that merely opens a form/);
  assert.equal(sent.model,'gpt-6.1-terra');assert.match(sent.instructions,/수업 시간 중/);
});

test('assistant metadata expansion requires fresh consent; old server cannot silently pretend tool support',async()=>{
  const storage=new Map([['unilink:chat-record-consent','granted']]);let mode='old',captured,scope=true;
  const query={select(){return this;},eq(){return this;},in(){return this;},gte(){return this;},order(){return this;},limit:async()=>({data:[],error:null})};
  const loader=moduleLoader({window:{},process},name=>{
    if(name.endsWith('private-storage')||name.endsWith('private-storage.ts'))return {privateStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},captureStorageScope:()=>()=>{if(!scope)throw new Error('계정 변경');}};
    if(name.endsWith('supabase-client')||name.endsWith('supabase-client.ts'))return {getSupabaseBrowserClient:()=>({from:()=>query,functions:{invoke:async(_name,{body})=>{captured=body;return {data:{result:mode==='old'?{reply:'기록만 가능',actions:[]}:{protocol_version:2,reply:'안녕',actions:[],tools:[],commands:[]}},error:null};}}})};
    if(name.endsWith('my-notes-storage')||name.endsWith('my-notes-storage.ts'))return {getMyNotes:async()=>[{id:'n',title:'note.pdf',content:'secret content',linkedId:'math',fileDataUrl:'secret bytes'}]};
    if(name.endsWith('timetable-storage')||name.endsWith('timetable-storage.ts'))return {getMonthlyEvents:()=>[]};
    if(name.endsWith('study-storage')||name.endsWith('study-storage.ts'))return {getWeeklyStudyPlans:()=>[]};
  });
  const client=loader(path.join(root,'src/lib/chat-assistant.ts'));
  assert.equal(client.getAssistantConsent(),null);client.setAssistantConsent('granted');assert.equal(client.getAssistantConsent(),'granted');
  const ctx={signedIn:true,userId:'owner',courses:[{id:'math',name:'수학',days:[]}],goals:new Map(),topics:new Map(),files:new Map()};
  await assert.rejects(client.converse(ctx,'안녕',[],'2026-11-16'),/업데이트/);
  mode='new';await client.converse(ctx,'안녕',[],'2026-11-16');
  assert.ok(!JSON.stringify(captured).includes('secret content'));assert.ok(!JSON.stringify(captured).includes('secret bytes'));
  scope=false;await assert.rejects(client.converse(ctx,'안녕',[],'2026-11-16'),/계정 변경/);
});

test('canceling an in-flight attachment does not discard the next chat attachment queue',async()=>{
  let release;
  const gate=new Promise(resolve=>{release=resolve;}),started=[];
  const loader=moduleLoader({window:{},process},name=>{
    if(name==='react')return {useRef:value=>({current:value}),useState:value=>[value,()=>{}],useCallback:fn=>fn,useEffect:()=>{}};
    if(name.includes('file-intake/pipeline'))return {
      processUpload:async(file,context)=>{
        started.push(file.name);if(file.name==='old.pdf')await gate;
        context.assertActive();return {id:file.name,fileName:file.name,status:'done'};
      },
    };
    if(name.startsWith('@/lib/'))return {};
  });
  const intake=loader(path.join(root,'src/components/home/useFileIntake.ts')).useFileIntake();
  const old=intake.addAndWait([{name:'old.pdf'}]);
  const rejected=assert.rejects(old,/중단/);
  intake.cancel();
  const fresh=intake.addAndWait([{name:'new.pdf'}]);
  release();await rejected;
  assert.deepEqual(started,['old.pdf','new.pdf']);
  assert.equal((await fresh)[0].fileName,'new.pdf');
});

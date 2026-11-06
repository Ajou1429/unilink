import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { KNOWLEDGE_VERSION, planKnowledge, parseExtraction, parseResearch, knowledgeContext } from "../supabase/functions/_shared/courseKnowledge.ts";
import { modelContext } from "../supabase/functions/_shared/coaching/context.ts";
import { createDatabase, createClient, moduleLoader, root } from "../scripts/simulation/runtime.mjs";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { featureEnabled } from "../supabase/functions/_shared/coachingSettings.ts";
import { knowledgeModels } from "../supabase/functions/_shared/courseKnowledgeStore.ts";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const note = (n) => ({ id:id(n),title:`Lecture ${n}`,version:1,updated_at:"2026-10-30T00:00:00Z",file_path:`owner/${n}.pdf`,file_name:`${n}.pdf`,drive_file_id:null,drive_modified_time:null });
const unit = { title:"SQL JOIN", page_start:3,page_end:5,week:3,concepts:["SQL JOIN"],prerequisites:["SQL SELECT"],objectives:["Write a two-table query"],formulas:[],examples:["Customer-order join"],exercises:["Predict output rows"],relationships:["SELECT before JOIN"],required_depth:"Write and explain two-table JOIN queries",methods:["SQL coding"],quote:"JOIN combines tables" };
const extraction = { summary:"Actual lecture tasks",readable:true,sections:[{kind:"lecture",page_start:1,page_end:10,quote:"JOIN combines tables"}],syllabus:[],units:[unit],uncertainty:"No exam evidence" };
const progress = (n,a=3,b=5) => ({id:id(n),session_date:"2026-10-30",memo:"SQL JOIN",metadata:{schema_version:1,legacy_record:{progressTitle:"SQL JOIN",noteTitle:"Lecture 1",pageStart:String(a),pageEnd:String(b)}}});

test("server-only DB feature controls preserve explicit environment overrides and model selection",()=>{
  const settings={knowledge_enabled:true,research_enabled:true,topic_check_enabled:true,analysis_model:null,research_model:"search-model"};
  assert.equal(featureEnabled(undefined,true),true);assert.equal(featureEnabled("false",true),false);
  assert.deepEqual(knowledgeModels(k=>({COACHING_MODEL:"existing-model"})[k],settings),{model:"existing-model",searchModel:"search-model"});
  assert.deepEqual(knowledgeModels(k=>({COACHING_MODEL:"existing-model",COURSE_RESEARCH_ENABLED:"false"})[k],settings),{model:"existing-model",searchModel:null});
});

function harness() {
  const saved=[];const calls={ index:0,overview:0,detail:0,research:0 };
  const run=async(notes,progressRows=[],search="search-test")=>{
    for(let i=0;i<100;i++) {
      const plan=await planKnowledge(notes,progressRows,saved,"pdf-test",search);
      const task=plan.tasks[0]; if(!task)return plan;
      calls[task.kind]++;
      const payload = task.kind==="index" ? {page_count:10,source_hash: (notes.find(n=>n.id===task.note_id).version===2?"b":"a").repeat(64)} :
        task.kind==="research" ? {research:{required_depth:"Two-table queries",sources:[{url:"https://example.edu/sql"}]}} :
        {extraction:{...structuredClone(extraction),sections:[{kind:"lecture",page_start:task.page_start,page_end:task.page_end,quote:unit.quote}],units:[{...unit,page_start:task.page_start,page_end:task.page_end}]}};
      saved.push({...task,id:id(100+saved.length),status:"ready",payload:{...payload,analysis_epoch:task.analysis_epoch??null,model:task.kind==="research"?search:"pdf-test",version:KNOWLEDGE_VERSION}});
    }
    assert.fail("Planner did not converge");
  };
  return{saved,calls,run};
}

test("first plan indexes ALL PDFs, persists per-slice evidence and research; second plan has zero analysis/search calls",async()=>{
  const h=harness(); const notes=[note(1),note(2)];
  const first=await h.run(notes,[progress(10)]);
  assert.equal(first.overview_complete,true);assert.equal(first.detail_complete,true);
  assert.deepEqual(h.calls,{index:2,overview:2,detail:1,research:1});
  const counts={...h.calls}; await h.run(notes,[progress(10)]); assert.deepEqual(h.calls,counts);
  const context=knowledgeContext(first);
  assert.equal(context.actual_class_progress[0].mapped,true);
  assert.ok(JSON.stringify(context.content).includes("Write and explain two-table"));
  assert.ok(context.research.length);
});

test("new actual class progress on UNCHANGED PDF analyses only uncovered pages and then reuses them",async()=>{
  const h=harness(); const notes=[note(1)]; await h.run(notes,[progress(10,1,2)]);
  const before={...h.calls};
  const plan=await planKnowledge(notes,[progress(11,3,5),progress(10,1,2)],h.saved,"pdf-test","search-test");
  assert.deepEqual(plan.tasks.map(t=>[t.kind,t.page_start,t.page_end]),[["detail",3,5]]);
  await h.run(notes,[progress(11,3,5),progress(10,1,2)]);
  assert.equal(h.calls.overview,before.overview);assert.equal(h.calls.research,before.research);
  assert.equal(h.calls.detail,before.detail+1);
  const after={...h.calls};await h.run(notes,[progress(11,3,5)]);assert.deepEqual(h.calls,after);
  const overlap=await planKnowledge(notes,[progress(12,3,7)],h.saved,"pdf-test","search-test");
  assert.deepEqual(overlap.tasks.map(t=>[t.kind,t.page_start,t.page_end]),[["detail",6,7]]);
});

test("only new/changed PDFs miss cache; identical-byte metadata changes reuse expensive analysis",async()=>{
  const h=harness();await h.run([note(1)]);
  await h.run([note(1),note(2)]);assert.deepEqual(h.calls,{index:2,overview:2,detail:0,research:1});
  await h.run([{...note(1),updated_at:"2026-10-30T01:00:00Z"},note(2)]);
  assert.deepEqual(h.calls,{index:3,overview:2,detail:0,research:1});
  await h.run([{...note(1),version:2},note(2)]);assert.deepEqual(h.calls,{index:4,overview:3,detail:0,research:1});
});

test("learner rating/time changes do not invalidate course knowledge; progress upload/completion remain separate",async()=>{
  const h=harness();const first=await h.run([note(1)]); const before={...h.calls};
  const changed=await h.run([note(1)]);assert.deepEqual(h.calls,before);
  assert.deepEqual(changed.actual_progress,[]);assert.ok(changed.pdf_ready);
  const base={timezone:"Asia/Seoul",goals:[],topics:[],methods:[],deadlines:[],existing_items:[],course_knowledge:[knowledgeContext(first)]};
  const a=modelContext({...base,sessions:[{goal_id:id(8),topic_id:null,actual_minutes:20,completion_status:"completed",mastery_after:2,metadata:{}}]});
  const b=modelContext({...base,sessions:[{goal_id:id(8),topic_id:null,actual_minutes:80,completion_status:"completed",mastery_after:4,metadata:{}}]});
  assert.deepEqual(a.course_knowledge,b.course_knowledge);assert.notDeepEqual(a.recent_study,b.recent_study);
});

test("ambiguous progress is not inferred from upload date; missing research remains visibly disabled",async()=>{
  const h=harness();await h.run([note(1)],[],null);
  const p=await planKnowledge([note(1)],[{id:id(8),session_date:"2026-10-30",memo:"Unknown topic",metadata:{}}],h.saved,"pdf-test",null);
  assert.equal(p.detail_complete,false);assert.equal(p.actual_progress[0].mapped,false);
  assert.equal(p.tasks.length,0);assert.ok(p.warnings.length);assert.equal(p.research_status,"disabled");
});

test("failed steps keep successful artifacts, expose retry and do not pretend search succeeded",async()=>{
  const h=harness();await h.run([note(1)]);
  h.saved.find(t=>t.kind==="research").status="failed";
  const p=await planKnowledge([note(1)],[],h.saved,"pdf-test","search-test");
  assert.equal(p.tasks.length,1);assert.equal(p.tasks[0].kind,"research");assert.equal(p.research_status,"failed");
  assert.ok(p.active.some(t=>t.kind==="overview"));assert.equal(knowledgeContext(p).research.length,0);
});

test("explicit reanalysis affects only the selected PDF and preserves old versions and unchanged research",async()=>{
  const h=harness();const notes=[note(1),note(2)];await h.run(notes,[progress(10)]);const before={...h.calls};const old=h.saved.length;
  h.saved.push({task_key:"f".repeat(64),kind:"refresh",status:"ready",note_id:notes[0].id,source_revision:JSON.stringify([notes[0].version,notes[0].updated_at,notes[0].file_path,null,null]),created_at:"2026-10-30T02:00:00Z",payload:{}});
  await h.run(notes,[progress(10)]);
  assert.equal(h.calls.index,before.index+1);assert.equal(h.calls.overview,before.overview+1);assert.equal(h.calls.detail,before.detail+1);assert.equal(h.calls.research,before.research);
  assert.ok(h.saved.length>old);assert.equal(h.saved.filter(t=>t.kind==="overview"&&t.note_id===notes[1].id).length,1);
  const counts={...h.calls};await h.run([{...notes[0],updated_at:"2026-10-30T03:00:00Z"},notes[1]],[progress(10)]);
  assert.equal(h.calls.index,counts.index+1);assert.equal(h.calls.overview,counts.overview);assert.equal(h.calls.detail,counts.detail);
});

test("research cache ignores concept ordering and capitalization",async()=>{
  const h=harness();await h.run([note(1)],[],null);
  const overview=h.saved.find(t=>t.kind==="overview");overview.payload.extraction.units[0].concepts=["SQL SELECT","SQL JOIN"];
  const first=await planKnowledge([note(1)],[],h.saved,"pdf-test","search-test");
  overview.payload.extraction.units[0].concepts=["sql join","sql select"];
  const second=await planKnowledge([note(1)],[],h.saved,"pdf-test","search-test");
  assert.equal(first.tasks[0].task_key,second.tasks[0].task_key);
});

test("extraction rejects fabricated page references; research URLs must come from a completed real search",()=>{
  assert.ok(parseExtraction(extraction,1,10));
  assert.throws(()=>parseExtraction({...extraction,units:[{...unit,page_end:11}]},1,10));
  assert.throws(()=>parseExtraction({...extraction,units:[{...unit,quote:""}]},1,10));
  assert.throws(()=>parseExtraction({...extraction,readable:false},1,10));
  const research={required_depth:"SQL queries",prerequisites:["SELECT"],methods:["coding"],difficulty:{theory:2,lab:3,assignment:null,exam:null},minutes_low:30,minutes_high:90,time_basis:"Estimated exercise workload, not a measured average",uncertainty:"No learner history",sources:[{url:"https://example.edu/sql",title:"SQL",relevance:"Same concept",reliability:"University teaching material",evidence:"Query exercises"}]};
  assert.ok(parseResearch(research,new Set([research.sources[0].url]),"2026-10-30"));
  assert.throws(()=>parseResearch(research,new Set(),"2026-10-30"));
  assert.throws(()=>parseResearch({...research,minutes_low:100},new Set([research.sources[0].url]),"2026-10-30"));
});

test("knowledge SQL: owner-only reads, service-only writes, lease fencing, resumable steps and atomic source check",async()=>{
  const db=new PGlite();const user=id(1),other=id(2),goal=id(3),nid=id(4);
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema public,auth to anon,authenticated,service_role;alter default privileges in schema public grant all on tables to service_role;`);
    for(const file of ["0001_notes_and_drive.sql","0010_core_learning.sql","0020_note_analysis.sql","0026_course_knowledge.sql","0027_coaching_service_settings.sql","0028_coaching_synthesis_model.sql"]) await db.exec(readFileSync(new URL(`../supabase/migrations/${file}`,import.meta.url),"utf8").replace('create extension if not exists "pgcrypto";',""));
    await db.exec(`insert into auth.users values('${user}'),('${other}');insert into notes(id,user_id,title) values('${nid}','${user}','PDF');
      insert into learning_goals(id,user_id,goal_type,title) values('${goal}','${user}','personal','Study');set role service_role;`);
    const task={task_key:"a".repeat(64),kind:"index",note_id:nid,source_revision:"r1",source_hash:null,page_start:null,page_end:null};
    const claim=(t=task,owner=user,retry=false)=>db.query(`select * from claim_course_knowledge_task($1,$2,$3,$4)`,[owner,goal,JSON.stringify(t),retry]);
    await assert.rejects(claim(task,other));
    const first=(await claim()).rows[0];assert.ok(first.id);
    assert.equal((await claim()).rows[0].id,null);
    assert.equal((await claim({...task,task_key:"b".repeat(64)})).rows[0].id,null);
    const n=(await db.query(`select version,updated_at from notes where id='${nid}'`)).rows[0];
    const payload={note_version:n.version,note_updated_at:n.updated_at,source_hash:"f".repeat(64),page_count:10};
    const publish=(lease=first.lease_token,p=payload)=>db.query(`select publish_course_knowledge_task($1,$2,$3,$4,'{}')`,[user,first.id,lease,JSON.stringify(p)]);
    await assert.rejects(publish(id(90)));await assert.rejects(publish(first.lease_token,{}));
    await db.exec(`update notes set version=2 where id='${nid}'`);await assert.rejects(publish());
    await db.exec(`update course_knowledge_tasks set lease_until=now()-interval '1 second' where id='${first.id}'`);
    const second=(await claim()).rows[0];assert.notEqual(second.lease_token,first.lease_token);await assert.rejects(publish());
    const current=(await db.query(`select version,updated_at from notes where id='${nid}'`)).rows[0];
    await publish(second.lease_token,{...payload,note_version:current.version,note_updated_at:current.updated_at});
    assert.equal((await claim()).rows[0].id,null);
    await db.exec(`reset role;set role authenticated;set request.jwt.claim.sub='${other}'`);
    await assert.rejects(db.exec("select * from coaching_service_settings"));
    await assert.rejects(db.exec("update coaching_service_settings set knowledge_enabled=true"));
    assert.equal((await db.query("select * from course_knowledge_tasks")).rows.length,0);
    await assert.rejects(claim());await assert.rejects(db.exec("update course_knowledge_tasks set status='failed'"));
    await db.exec(`set request.jwt.claim.sub='${user}'`);assert.equal((await db.query("select * from course_knowledge_tasks")).rows.length,1);
    await db.exec("reset role;set role service_role");
    const next=(await claim({...task,task_key:"c".repeat(64)})).rows[0];
    await db.exec(`update course_knowledge_tasks set status='failed' where id='${next.id}'`);
    assert.equal((await claim({...task,task_key:"c".repeat(64)})).rows[0].id,null);
    assert.ok((await claim({...task,task_key:"c".repeat(64)},user,true)).rows[0].id);
    assert.equal((await db.query("select count(*)::integer as n from course_knowledge_tasks where status='ready'")).rows[0].n,1);
  }finally{await db.close();}
});

test("actual Edge handler + PostgreSQL: first preparation, incremental PDF slicing, DB reuse and real coaching context",async()=>{
  const {db}=await createDatabase();const user=id(51),goal=id(52),course=id(53),nid=id(54),session=id(55);
  try{
    await db.query("insert into auth.users(id) values($1)",[user]);
    await db.query("insert into courses(id,user_id,name,term,metadata) values($1,$2,'Databases','2026-2',$3)",[course,user,JSON.stringify({schema_version:1,legacy_record:{id:"legacy-course"}})]);
    await db.query("insert into learning_goals(id,user_id,goal_type,title,course_id,metadata) values($1,$2,'course','Databases',$3,$4)",[goal,user,course,JSON.stringify({schema_version:1,legacy_record:{courseId:"legacy-course"}})]);
    await db.query("insert into notes(id,user_id,title,file_name,file_path,linked_type,linked_id) values($1,$2,'Lecture 1','lecture.pdf',$3,'course','legacy-course')",[nid,user,`${user}/lecture.pdf`]);
    const pdf=await PDFDocument.create();for(let i=0;i<10;i++)pdf.addPage();const bytes=await pdf.save();
    let handler;const pending=[];const calls={pdf:0,search:0,coaching:0};const submittedPages=[];const modelContexts=[];
    let researchAnswer;let assessmentCalls=0;
    const env={COURSE_KNOWLEDGE_ENABLED:"true",COURSE_RESEARCH_ENABLED:"true",COURSE_RESEARCH_MODEL:"search-test",COACHING_MODEL:"pdf-test",COACHING_HARNESS_ENABLED:"true",OPENAI_API_KEY:"mock-only"};
    const admin=createClient(db,{admin:true});
    const scalarRpc=admin.rpc;
    admin.rpc=async(name,args)=>{
      // PostgREST emits a composite as JSON; PGlite's scalar RPC adapter returns raw PG text.
      if(name!=="claim_course_knowledge_task")return scalarRpc(name,args);
      try{const rows=await db.query("select * from claim_course_knowledge_task($1,$2,$3,$4)",[args.p_user,args.p_goal,JSON.stringify(args.p_task),args.p_retry]);return{data:rows.rows[0],error:null};}
      catch(e){return{data:null,error:{message:e.message}};}
    };
    const fetchMock=async(url,options)=>{
      assert.equal(url,"https://api.openai.com/v1/responses");const body=JSON.parse(options.body);
      let parsed,extra=[];
      if(body.tools){
        calls.search++;assert.ok(body.input.includes("SQL JOIN"));assert.ok(!body.input.includes("Lecture 1"));
        parsed={required_depth:unit.required_depth,prerequisites:["SELECT"],methods:["SQL coding"],difficulty:{theory:2,lab:3,assignment:null,exam:null},minutes_low:30,minutes_high:90,time_basis:"Estimated query exercises, not a measured peer average",uncertainty:"Learner-specific adjustment still required",sources:[{url:"https://example.edu/sql",title:"SQL teaching",relevance:"Same query task",reliability:"Test university fixture",evidence:"Exercises for JOIN"}]};
        researchAnswer=parsed;
        extra=[{type:"web_search_call",status:"completed",action:{sources:[{url:"https://example.edu/sql"}]}}];
      }else if(body.text.format.name==="course_research"){
        assessmentCalls++;assert.deepEqual(body.text.format.schema.properties.sources.items.properties.url.enum,["https://example.edu/sql"]);
        if(assessmentCalls===1)throw new Error("Simulated assessment failure");
        parsed=researchAnswer;
      }else if(body.text.format.name==="course_knowledge"){
        calls.pdf++;const input=body.input[0].content;const range=input[0].text.match(/Original physical PDF pages (\d+)-(\d+)/);const a=Number(range[1]),b=Number(range[2]);
        const slice=await PDFDocument.load(Buffer.from(input[1].file_data.split(",")[1],"base64"));assert.equal(slice.getPageCount(),b-a+1);submittedPages.push([a,b]);
        parsed={...structuredClone(extraction),sections:[{kind:"lecture",page_start:a,page_end:b,quote:unit.quote}],units:[{...unit,page_start:a,page_end:b}]};
      }else{
        calls.coaching++;const input=JSON.parse(body.input.at(-1).content);modelContexts.push(input.goal_briefs[0]);
        const method=body.text.format.schema.properties.items.items.properties.method_code.enum[0];
        parsed={summary:"SQL JOIN query practice based on the lecture",items:[{goal_id:goal,topic_id:null,method_code:method,title:"Write a two-table SQL JOIN query",planned_date:"2026-10-30",start_time:"13:00",planned_minutes:30,reason:"Lecture pages and recorded class progress support query-writing practice."}],deferred_goals:[]};
      }
      return new Response(JSON.stringify({status:"completed",usage:{input_tokens:100,output_tokens:100},output:[...extra,{type:"message",content:[{type:"output_text",text:JSON.stringify(parsed)}]}]}),{headers:{"Content-Type":"application/json"}});
    };
    const load=moduleLoader({fetch:fetchMock,Deno:{env:{get:k=>env[k]},serve:fn=>{handler=fn;}},EdgeRuntime:{waitUntil:p=>pending.push(p)}},name=>{
      if(/supabaseAdmin\.ts$/.test(name))return{getAdminClient:()=>admin,getUserFromAuthHeader:async()=>({id:user})};
      if(/noteSource\.ts$/.test(name))return{readNotePdf:async()=>bytes,pdfBase64:b=>Buffer.from(b).toString("base64")};
      if(name==="npm:pdf-lib@1.17.1")return{PDFDocument:{load:(...args)=>PDFDocument.load(...args),create:async()=>{
        const doc=await PDFDocument.create();const copy=doc.copyPages.bind(doc);doc.copyPages=(source,indices)=>copy(source,Array.from(indices));return doc;
      }}};
    });
    load(path.join(root,"supabase/functions/course-knowledge/index.ts"));
    const invoke=async(extra={})=>{
      const res=await handler(new Request("https://test/functions/v1/course-knowledge",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({goal_id:goal,as_of:"2026-10-30",consent:true,research_consent:true,...extra})}));
      const payload=await res.json();assert.ok(res.ok,JSON.stringify(payload));await Promise.all(pending.splice(0));return payload;
    };
    const active=(await admin.rpc("claim_course_knowledge_task",{p_user:user,p_goal:goal,p_task:{task_key:"e".repeat(64),kind:"index",note_id:nid,source_revision:"test"},p_retry:false})).data;
    const working=await invoke({consent:false});assert.equal(working.status,"working");assert.equal(working.knowledge,undefined);
    await db.query("update course_knowledge_tasks set status='failed' where id=$1",[active.id]);
    assert.equal((await invoke({consent:false})).status,"consent_required");assert.deepEqual(calls,{pdf:0,search:0,coaching:0});
    await invoke();await invoke();
    assert.equal((await invoke({consent:false,research_consent:false})).status,"research_consent_required");
    assert.deepEqual(calls,{pdf:1,search:0,coaching:0});
    await invoke();
    const failed=await invoke({action:"status"});assert.equal(failed.research_status,"failed");
    const checkpoint=(await db.query("select payload from course_knowledge_tasks where user_id=$1 and kind='research'",[user])).rows[0].payload;
    assert.ok(checkpoint.retrieved_evidence.urls.length);
    await invoke({retry:true});
    const researched=await invoke();assert.equal(researched.research_status,"ready");assert.equal(assessmentCalls,2);
    assert.deepEqual(calls,{pdf:1,search:1,coaching:0});await invoke();assert.equal(calls.pdf,1);assert.equal(calls.search,1);
    assert.equal((await invoke({consent:false,research_consent:false})).status,"ready");
    await db.query("insert into course_sessions(id,user_id,course_id,session_date,metadata) values($1,$2,$3,'2026-10-30',$4)",[session,user,course,JSON.stringify(progress(1).metadata)]);
    for(let i=0;i<5;i++){const s=await invoke();if(s.status==="ready")break;}
    assert.deepEqual(submittedPages,[[1,10],[3,5]]);assert.equal(calls.search,1);
    await invoke();assert.equal(calls.pdf,2);
    const {handleCoachingProposal}=load(path.join(root,"supabase/functions/coaching-propose/index.ts"));
    const req={request_key:"integration-1",goal_ids:[goal],intent:"weekly_plan",period_start:"2026-10-30",period_end:"2026-10-30",day_budgets:[{date:"2026-10-30",minutes:120,windows:[{start:"13:00",end:"16:00"}]}],desired_outcome:"",constraints:"",rules:{transition_minutes:10,break_minutes:10,break_after_minutes:90,method_minimums:{},max_focus_goals:1,carryover:true}};
    const result=await handleCoachingProposal(new Request("https://test/functions/v1/coaching-propose",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(req)}));
    const proposal=await result.json();assert.equal(result.status,200,JSON.stringify(proposal));assert.equal(proposal.persisted,false);
    assert.ok(modelContexts[0].course_knowledge[0].content.some(t=>t.kind==="detail"));assert.ok(JSON.stringify(modelContexts[0]).includes(unit.required_depth));
    assert.deepEqual(calls,{pdf:2,search:1,coaching:1});
    const refresh={action:"refresh",note_id:nid,refresh_request_id:id(88)};
    await invoke(refresh);
    for(let i=0;i<10;i++){const s=await invoke();if(s.status==="ready")break;}
    assert.deepEqual(calls,{pdf:4,search:1,coaching:1});await invoke(refresh);await invoke();assert.equal(calls.pdf,4);
  }finally{await db.close();}
});

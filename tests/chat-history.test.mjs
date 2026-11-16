import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {createDatabase,createClient,createBrowser,moduleLoader,root} from '../scripts/simulation/runtime.mjs';

const A='00000000-0000-4000-8000-000000009001',B='00000000-0000-4000-8000-000000009002';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const items=[{id:'u1',kind:'user',text:'미분 계획 만들어줘',fileNames:[]},{id:'a1',kind:'assistant',text:'계획을 제안해요.'}];

test('chat history stores owned conversations, paginates summaries, rejects cross-account access and stale revisions',async()=>{
 const {db}=await createDatabase();
 try {
  await db.query('insert into auth.users(id) values($1),($2)',[A,B]);
  const a=createClient(db,{userId:A}),b=createClient(db,{userId:B}),anon=createClient(db);
  const save=(client,n,revision=0,body=items)=>client.rpc('save_chat_conversation',{p_id:id(n),p_title:`대화 ${n}`,p_items:body,p_revision:revision});
  for(let n=1;n<=5;n++)assert.equal((await save(a,n)).data,1);
  const app=createBrowser(a,A),history=app.lib('chat-history');
  const first=await history.listConversations();assert.equal(first.items.length,3);assert.equal(first.more,true);assert.equal('items' in first.items[0],false);
  const all=await history.listConversations(6);assert.equal(all.items.length,5);assert.equal(all.more,false);
  const loaded=await history.loadConversation(id(1));assert.deepEqual(JSON.parse(JSON.stringify(loaded.items)),items);assert.equal(loaded.revision,1);
  assert.deepEqual((await b.from('chat_conversations').select('*')).data,[]);
  assert.ok((await save(b,1,1)).error);assert.ok((await save(b,1,0)).error);
  assert.ok((await save(anon,6)).error);assert.ok((await anon.from('chat_conversations').select('*')).error);
  assert.ok((await a.from('chat_conversations').update({items:[]}).eq('id',id(1))).error);
  assert.equal((await save(a,1,1)).data,2);assert.equal((await save(a,1,1)).error.code,'40001');
  const results=await Promise.all([save(a,1,2),save(a,1,2)]);assert.equal(results.filter(r=>r.data===3).length,1);assert.equal(results.filter(r=>r.error?.code==='40001').length,1);
  for(const body of [[],{},[{id:'long',kind:'user',text:'x'.repeat(2100000)}]])assert.ok((await save(a,7,0,body)).error);
  assert.ok((await b.from('chat_conversations').delete().eq('id',id(1))).error===null);
  assert.equal((await a.from('chat_conversations').select('id').eq('id',id(1)).single()).data.id,id(1));
 }finally{await db.close();}
});

test('history snapshots retain plan criteria and outcomes but never restore executable approvals or file bytes',()=>{
 const lib=moduleLoader()(path.join(root,'src/lib/chat-history-snapshot.ts'));
 const source=[...items,{id:'cmd',kind:'command',source:'미분 계획',command:{title:'미분'},status:'done',message:'학습 계획에 저장했어요.',prepared:{id:'CAPABILITY',userId:A,payload:{runId:'RUN',secret:'SECRET'},summary:['수학 계획'],proposal:{proposal:{items:[{title:'도함수 연습',planned_date:'2030-11-18',start_time:'14:30',planned_minutes:30,reason:'복습',completion_criteria:{task_scope:'3문제',observable_check:'혼자 풀이'}}]}}}},
 {id:'pending',kind:'command',source:'약속',command:{},status:'running',prepared:{payload:{secret:'NO'},summary:[]}},
 {id:'file',kind:'files',recordIds:['pdf']},{id:'pending-reply',kind:'assistant',pending:true,text:''}];
 const result=lib.snapshotThread(source,[{id:'pdf',fileName:'강의.pdf',status:'done',filePath:'PRIVATE/PATH',bytes:'BYTES'}]);
 const text=JSON.stringify(result);
 for(const expected of ['도함수 연습','2030-11-18','14:30','3문제','혼자 풀이','저장했어요','실행 결과 확인 필요','강의.pdf'])assert.ok(text.includes(expected));
 for(const secret of ['CAPABILITY','SECRET','PRIVATE/PATH','BYTES','runId','pending-reply'])assert.ok(!text.includes(secret));
 assert.ok(result.every(row=>['user','assistant','archive'].includes(row.kind)));
});

test('writer serializes saves, retains failures for retry, prevents old accounts writing and detects conflicts',async()=>{
 let user=A,version=0,calls=0,revision=0,fail=false,conflict=false;const errors=[];
 const db={rpc:async(name,args)=>{
  calls++;assert.equal(name,'save_chat_conversation');assert.equal(args.p_revision,revision);
  if(fail)return {error:{code:'NETWORK'}};
  if(conflict)return {error:{code:'40001'}};
  return {data:++revision,error:null};
 }};
 const load=moduleLoader({},name=>{
  if(name.endsWith('supabase-client'))return {getSupabaseBrowserClient:()=>db};
  if(name.endsWith('private-storage'))return {getStorageUser:()=>user,captureStorageScope:()=>{const current=version;return ()=>{if(current!==version)throw new Error('계정 변경');};}};
 });
 const history=load(path.join(root,'src/lib/chat-history.ts'));
 const writer=history.createConversationWriter(id(10),0,msg=>errors.push(msg));
 writer.queue(items);writer.queue([...items,{id:'3',kind:'assistant',text:'새 답변'}]);await writer.flush();assert.equal(calls,1);
 writer.queue([...items,{id:'3',kind:'assistant',text:'새 답변'}]);await writer.flush();assert.equal(calls,1);
 fail=true;writer.queue(items);await writer.flush();assert.equal(errors.length,1);
 fail=false;await writer.flush();assert.equal(revision,2);
 conflict=true;writer.queue([...items,{id:'4',kind:'assistant',text:'다른 답변'}]);await writer.flush();const before=calls;await writer.flush();assert.equal(calls,before);assert.ok(errors.at(-1).includes('다른 창'));
 const old=history.createConversationWriter(id(11));old.queue(items);user=B;version++;await old.flush();assert.equal(calls,before);
});

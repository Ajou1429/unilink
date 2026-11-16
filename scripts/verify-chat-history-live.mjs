// One-off real DB smoke test. Creates only temporary users; no model calls.
// Credentials stay in process memory and are never logged or written to disk.
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const project='lqwpcwzjbqeunqfliaso',base=`https://${project}.supabase.co`;
const keys=JSON.parse(execFileSync('supabase',['projects','api-keys','--project-ref',project,'--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
const admin=keys.find(k=>k.name==='service_role')?.api_key,anon=keys.find(k=>k.name==='anon')?.api_key;
assert.ok(admin&&anon,'Project API credentials unavailable');
const users=[];
async function request(path,token,body,method=body?'POST':'GET') {
 const response=await fetch(base+path,{method,headers:{apikey:anon,Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 const text=await response.text();let data;try{data=JSON.parse(text);}catch{data=text;}
 return {status:response.status,data};
}
try {
 for(let i=0;i<2;i++) {
  const email=`chat-history-smoke-${randomUUID()}@example.invalid`,password=`Aa!${randomUUID()}`;
  const created=await request('/auth/v1/admin/users',admin,{email,password,email_confirm:true});assert.equal(created.status,200);users.push({id:created.data.id});
  const signed=await request('/auth/v1/token?grant_type=password',anon,{email,password});assert.equal(signed.status,200);users[i].token=signed.data.access_token;
 }
 const [a,b]=users,id=randomUUID(),items=[{id:'u1',kind:'user',text:'임시 검증 대화'},{id:'p1',kind:'archive',text:'계획 당시 기록 · 실행 완료 · 30분'}];
 const save=(token,revision)=>request('/rest/v1/rpc/save_chat_conversation',token,{p_id:id,p_title:'임시 검증 대화',p_items:items,p_revision:revision});
 let result=await save(a.token,0);assert.equal(result.status,200);assert.equal(result.data,1);
 result=await request(`/rest/v1/chat_conversations?id=eq.${id}&select=id,title,items,revision`,a.token);assert.equal(result.status,200);assert.equal(result.data[0].revision,1);assert.deepEqual(result.data[0].items,items);
 result=await request(`/rest/v1/chat_conversations?id=eq.${id}&select=id`,b.token);assert.equal(result.status,200);assert.deepEqual(result.data,[]);
 result=await save(b.token,1);assert.ok(result.status>=400);assert.equal(result.data.code,'40001');
 result=await save(a.token,1);assert.equal(result.status,200);assert.equal(result.data,2);
 result=await save(a.token,1);assert.ok(result.status>=400);assert.equal(result.data.code,'40001');
 result=await request('/rest/v1/chat_conversations?select=id',anon);assert.ok([401,403].includes(result.status));
 result=await request('/rest/v1/rpc/save_chat_conversation',anon,{p_id:randomUUID(),p_title:'anon',p_items:items,p_revision:0});assert.ok([401,403].includes(result.status));
 result=await request(`/rest/v1/chat_conversations?id=eq.${id}`,a.token,{title:'직접 수정'},'PATCH');assert.ok(result.status>=400);
 console.log('PASS live DB: owned save/load, account isolation, stale revision rejection, anon denial, direct write denial; zero AI calls');
} finally {
 for(const user of users) {
  const deleted=await request(`/auth/v1/admin/users/${user.id}`,admin,undefined,'DELETE');assert.equal(deleted.status,200,'Temporary account cleanup failed');
  const check=await request(`/auth/v1/admin/users/${user.id}`,admin);assert.equal(check.status,404,'Temporary account still exists');
 }
 console.log(`Cleaned up ${users.length} temporary users and their conversation rows`);
}

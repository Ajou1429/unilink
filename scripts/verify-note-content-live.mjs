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
 const [a,b]=users,id=randomUUID();
 let result=await request('/rest/v1/notes',a.token,{id,user_id:a.id,title:'0041 temporary smoke'});assert.equal(result.status,201);
 result=await request(`/rest/v1/notes?id=eq.${id}&select=*`,a.token);assert.equal(result.status,200);const original=result.data[0];
 const args={p_note:id,p_version:original.version,p_updated_at:original.updated_at,p_profile:{version:1,fileHash:'a'.repeat(64),textHash:null,characters:1000,unique:500,samples:[1,2,3],complete:true}};
 const save=(token,override={})=>request('/rest/v1/rpc/save_note_content_profile',token,{...args,...override});
 result=await save(a.token);assert.equal(result.status,204);
 result=await request(`/rest/v1/note_content_profiles?note_id=eq.${id}&select=*`,a.token);assert.equal(result.status,200);assert.equal(result.data.length,1);
 result=await request(`/rest/v1/note_content_profiles?note_id=eq.${id}&select=*`,b.token);assert.equal(result.status,200);assert.deepEqual(result.data,[]);
 result=await save(b.token);assert.equal(result.data.code,'42501');
 result=await save(a.token,{p_version:0});assert.equal(result.status,409);assert.equal(result.data.code,'40001');
 result=await save(a.token,{p_updated_at:'2000-01-01T00:00:00Z'});assert.equal(result.status,409);
 result=await save(anon);assert.ok([401,403].includes(result.status));
 result=await request('/rest/v1/note_content_profiles',a.token,{note_id:id,user_id:a.id,source_version:1,source_updated_at:original.updated_at,profile:args.p_profile});assert.ok(result.status>=400);
 result=await request(`/rest/v1/notes?id=eq.${id}&select=*`,a.token);assert.deepEqual(result.data[0],original);
 result=await request(`/rest/v1/notes?id=eq.${id}`,a.token,undefined,'DELETE');assert.equal(result.status,204);
 result=await request(`/rest/v1/note_content_profiles?note_id=eq.${id}&select=*`,a.token);assert.deepEqual(result.data,[]);
 console.log('PASS 0041 live: owned save/read, RLS isolation, stale version/timestamp HTTP409, anonymous/direct-write denial, original unchanged, cascade deletion; zero AI calls');
} finally {
 for(const user of users) {
  const deleted=await request(`/auth/v1/admin/users/${user.id}`,admin,undefined,'DELETE');assert.equal(deleted.status,200,'Temporary account cleanup failed');
  const check=await request(`/auth/v1/admin/users/${user.id}`,admin);assert.equal(check.status,404,'Temporary account still exists');
 }
 console.log(`Cleaned up ${users.length} temporary users and their temporary rows`);
}

import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync} from 'node:fs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.AJOU_PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.AJOU_BROWSER_EXECUTABLE||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const base=process.env.AJOU_TEST_URL||'http://localhost:3000';
const output='/tmp/unilink-history-browser/screenshots';mkdirSync(output,{recursive:true});
const uid='00000000-0000-4000-8000-000000009101';
const user={id:uid,aud:'authenticated',role:'authenticated',email:'history-test@example.invalid',user_metadata:{displayName:'테스트'},app_metadata:{provider:'email'},created_at:'2026-01-01T00:00:00Z'};
try {
 for(const [name,viewport] of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]) {
  const context=await browser.newContext({viewport}),page=await context.newPage(),errors=[],calls=[];
  const rows=new Map(Array.from({length:5},(_,i)=>{
   const id=`00000000-0000-4000-8000-${String(9102+i).padStart(12,'0')}`;
   return [id,{id,user_id:uid,title:`보관 계획 ${i+1}`,revision:1,updated_at:`2026-11-16T0${i}:00:00Z`,items:[{id:'u',kind:'user',text:`미분 ${i+1} 복습 계획`,fileNames:['강의.pdf']},{id:'a',kind:'assistant',text:'복습 계획을 제안했어요.'},{id:'p',kind:'archive',text:`요청 내역 · 실행 완료\n2030-11-18 14:30 · 30분 · 도함수 연습 ${i+1}\n학습 범위: 3문제\n완료 기준: 혼자 풀이\n학습 계획에 저장했어요.`}]}];
  }));
  let failSave=false,writes=0,executionCalls=0;
  page.on('pageerror',error=>errors.push(error.message));
  await context.addInitScript(({uid,user})=>{
   const encode=v=>btoa(JSON.stringify(v)).replaceAll('=','').replaceAll('+','-').replaceAll('/','_');
   const token=encode({alg:'HS256',typ:'JWT'})+'.'+encode({sub:uid,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated',aud:'authenticated'})+'.mock';
   localStorage.setItem('sb-lqwpcwzjbqeunqfliaso-auth-token',JSON.stringify({access_token:token,refresh_token:'test-only',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user}));
   localStorage.setItem(`unilink:private:user:${uid}:unilink:chat-assistant-consent:v2`,'granted');
  },{uid,user});
  await context.route('https://*.supabase.co/**',async route=>{
   const req=route.request(),url=new URL(req.url()),table=url.pathname.split('/').at(-1);
   const json=(data,status=200)=>route.fulfill({status,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(data)});
   if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'}});
   if(url.pathname==='/auth/v1/user')return json(user);
   if(table==='save_chat_conversation') {
    if(failSave)return json({message:'offline',code:'NETWORK'},503);
    const body=req.postDataJSON(),old=rows.get(body.p_id);
    if((old?.revision??0)!==body.p_revision)return json({code:'40001',message:'conflict'},409);
    const revision=body.p_revision+1;rows.set(body.p_id,{id:body.p_id,user_id:uid,title:body.p_title,items:body.p_items,revision,updated_at:new Date().toISOString()});writes++;return json(revision);
   }
   if(table==='chat_conversations') {
    const id=url.searchParams.get('id');
    if(id)return json(rows.get(id.replace('eq.',''))||null);
    return json([...rows.values()].sort((a,b)=>b.updated_at.localeCompare(a.updated_at)||b.id.localeCompare(a.id)).slice(0,Number(url.searchParams.get('limit')||4)).map(({id,title,updated_at})=>({id,title,updated_at})));
   }
   if(table==='chat-record') {const body=req.postDataJSON();calls.push(body);return json({result:{protocol_version:2,reply:`계속 답변: ${body.message}`,commands:[],tools:[],actions:[],dropped:0}});}
   if(url.pathname.includes('/functions/')){executionCalls++;return json({connected:false});}
   return json([]);
  });
  await page.goto(base+'/dashboard');await page.getByRole('textbox',{name:'메시지 입력'}).waitFor();
  async function sidebar(){
   if(name==='mobile')await page.getByRole('button',{name:/목록 (열기|닫기)/}).filter({visible:true}).first().click();
   const list=page.locator('[aria-label="이전 채팅"]:visible');await list.getByRole('link',{name:'보관 계획 5',exact:true}).waitFor();return list;
  }
  let list=await sidebar();assert.equal(await list.getByRole('link').count(),3);
  await list.getByRole('button',{name:'더보기',exact:true}).click();await list.getByRole('link',{name:'보관 계획 1',exact:true}).waitFor();assert.equal(await list.getByRole('link').count(),5);
  await list.getByRole('button',{name:'접기',exact:true}).click();await page.waitForFunction(()=>[...document.querySelectorAll('[aria-label="이전 채팅"]')].some(el=>el.querySelectorAll('a').length===3));
  list=page.locator('[aria-label="이전 채팅"]:visible');await list.getByRole('link',{name:'보관 계획 5',exact:true}).click();
  await page.getByText('도함수 연습 5',{exact:false}).waitFor();assert.equal(await page.getByRole('button',{name:'예',exact:true}).count(),0);assert.equal(writes,0);
  await page.reload();await page.getByText('도함수 연습 5',{exact:false}).waitFor();assert.equal(writes,0);
  async function send(text){await page.getByRole('textbox',{name:'메시지 입력'}).fill(text);await page.getByRole('button',{name:'보내기',exact:true}).click();}
  await send('이 계획 다음 단계 알려줘');await page.getByText('계속 답변: 이 계획 다음 단계 알려줘',{exact:true}).waitFor();
  assert.ok(calls.at(-1).history.some(row=>row.text.includes('도함수 연습 5')));
  await page.waitForFunction(()=>!document.querySelector('[role="alert"]'));await new Promise(r=>setTimeout(r,650));
  await page.reload();await page.getByText('계속 답변: 이 계획 다음 단계 알려줘',{exact:true}).waitFor();
  if(name==='mobile')await page.getByRole('button',{name:/목록 (열기|닫기)/}).filter({visible:true}).first().click();
  await page.getByRole('link',{name:'채팅하기',exact:true}).filter({visible:true}).click();
  await page.getByRole('textbox',{name:'메시지 입력'}).waitFor();assert.equal(await page.getByText('도함수 연습 5',{exact:false}).count(),0);
  failSave=true;await send('새로운 대화 첫 요청');await page.getByText('계속 답변: 새로운 대화 첫 요청',{exact:true}).waitFor();
  await page.getByRole('button',{name:'저장 재시도',exact:true}).waitFor();failSave=false;
  await page.getByRole('button',{name:'저장 재시도',exact:true}).click();await page.getByRole('button',{name:'저장 재시도',exact:true}).waitFor({state:'hidden'});
  assert.equal(rows.size,6);
  await page.reload();await page.getByText('계속 답변: 새로운 대화 첫 요청',{exact:true}).waitFor();
  assert.equal(executionCalls,0);assert.deepEqual(errors,[]);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  if(name==='mobile')await page.getByRole('button',{name:/목록 (열기|닫기)/}).filter({visible:true}).first().click();
  await page.screenshot({path:`${output}/${name}-history.png`,fullPage:true});
  console.log(`PASS ${name}: recent 3, more/collapse, reload/resume, archived plan without replay, retry, new conversation (${writes} saves)`);
  await context.close();
 }
}finally{await browser.close();}

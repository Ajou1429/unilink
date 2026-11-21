// Isolated browser regression; AI responses are mocked to avoid paid calls.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.AJOU_PLAYWRIGHT_MODULE || 'playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.AJOU_BROWSER_EXECUTABLE || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const base=process.env.AJOU_TEST_URL || 'http://localhost:3000';
mkdirSync('/tmp/unilink-public-demo',{recursive:true});
try {
 for(const [device,viewport] of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]) {
  const context=await browser.newContext({viewport}),page=await context.newPage();
  let remaining=3;
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/functions/v1/demo-chat',async route=>{
    const body=route.request().postDataJSON();
    if(body.status) return route.fulfill({json:{quota:{remaining,day:'2026-11-21'}}});
    const result={reply:'요청하신 내용을 준비했어요. 확인 후 반영해 주세요.',action:'reply',title:'',details:[],date:'',time:'',minutes:0,target:'',plans:[]};
    if(/계획|추천/.test(body.message)) {
      if(!remaining) return route.fulfill({status:429,json:{error:'오늘 계획 생성 3회를 모두 사용했어요.'}});
      remaining--;
      Object.assign(result,{action:'plan',title:'운영체제 복습 계획',details:['교착상태 복습'],plans:[{title:'교착상태 핵심 복습',course:'운영체제',date:'2026-11-21',time:'19:00',minutes:60,description:'4가지 조건 설명과 연습문제'}]});
    } else if(/과제/.test(body.message)) Object.assign(result,{action:'event',title:'운영체제 보고서 제출',details:['예방과 회피 비교'],date:'2026-11-23',time:'23:59'});
    else if(/문제은행/.test(body.message)) Object.assign(result,{action:'navigate',target:'problems'});
    return route.fulfill({json:{result,quota:{remaining,day:'2026-11-21'}}});
  });
  await context.addInitScript(()=>{if (window === window.top && window.localStorage) localStorage.setItem('unilink:private:user:real-user:unilink:courses','PRIVATE_SENTINEL');});
  await page.goto(base+'/dashboard?demo=1');
  const feature=name=>page.getByRole('navigation',{name:'데모 기능'}).getByRole('button',{name,exact:true});
  await feature('AI 대화').waitFor();
  assert.equal(await page.getByText(/Google Drive 연결 체험/).count(),0);
  await page.getByRole('button',{name:'과제 일정을 등록해줘',exact:true}).click();
  await page.getByRole('heading',{name:'운영체제 보고서 제출',exact:true}).waitFor();
  const events=()=>page.evaluate(()=>JSON.parse(sessionStorage.getItem('unilink:private:demo:unilink:monthly-events')));
  assert.equal((await events()).filter(x=>x.title==='운영체제 보고서 제출').length,0);
  await page.getByRole('button',{name:'예, 반영하기'}).click();
  assert.equal((await events()).find(x=>x.title==='운영체제 보고서 제출').startTime,'23:59');
  for(let i=0;i<3;i++) {
    await page.getByRole('button',{name:'공부 계획을 추천해줘',exact:true}).click();
    await page.getByRole('heading',{name:'운영체제 복습 계획',exact:true}).waitFor();
    await page.getByRole('button',{name:'예, 반영하기'}).click();
  }
  const plans=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('unilink:private:demo:unilink:weekly-study-plans')));
  assert.ok(plans.some(x=>x.id==='1'));
  assert.equal(plans.filter(x=>x.title==='교착상태 핵심 복습').length,3);
  await page.getByRole('button',{name:'공부 계획을 추천해줘',exact:true}).click();
  await page.getByRole('button',{name:'보내기',exact:true}).waitFor();
  await page.waitForTimeout(100);
  assert.ok((await page.locator('body').innerText()).includes('오늘 계획 생성 3회를 모두 사용했어요.'), await page.locator('body').innerText());
  assert.equal(await page.getByRole('button',{name:'예, 반영하기'}).count(),0);
  await page.getByRole('button',{name:'문제은행을 보여줘',exact:true}).click();
  await page.getByRole('button',{name:'예시 해설 확인'}).waitFor();
  await feature('강의노트').click();
  await page.getByRole('button',{name:'PDF 미리보기',exact:true}).click();
  await page.getByTitle('샘플 강의노트 PDF').waitFor();
  await page.screenshot({path:`/tmp/unilink-public-demo/${device}-real-ai.png`,fullPage:true});
  assert.equal(await page.locator('body').evaluate(el=>el.scrollWidth>innerWidth+2),false);
  await page.getByRole('button',{name:'처음부터 체험'}).click();
  await page.getByText(/남은 횟수: 0\/3회/).waitFor();
  assert.equal(await page.evaluate(()=>localStorage.getItem('unilink:private:user:real-user:unilink:courses')),'PRIVATE_SENTINEL');
  assert.deepEqual(errors,[]);
  await context.close();
  console.log(`${device}: real-AI contract, approvals, quota/reset, Drive removal, isolation passed`);
 }
} finally {await browser.close();}

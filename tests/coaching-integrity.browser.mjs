import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.AJOU_PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({channel:'msedge',headless:true});
const base=process.env.AJOU_TEST_URL||'http://127.0.0.1:3041';
const output=process.env.AJOU_SCREENSHOTS||'../.docx-work/integrity-browser';
mkdirSync(output,{recursive:true});
try {
  for(const [name,viewport] of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
    const context=await browser.newContext({viewport}),page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(base+'/dashboard?demo=1');
    await page.getByRole('textbox',{name:'메시지 입력'}).waitFor();
    await page.getByRole('textbox',{name:'메시지 입력'}).fill('운영체제 동기화 부분이 어려워요');
    await page.getByRole('button',{name:'보내기',exact:true}).click();
    await page.getByText('대화 원문은 서버에 남기지 않아요.',{exact:false}).waitFor();
    await page.getByRole('button',{name:'기록하지 않기',exact:true}).click();
    assert.ok(!(await page.locator('body').innerText()).includes('이해도 2/5'));
    if(name==='mobile')await page.getByRole('button',{name:/^목록 (열기|닫기)$/}).filter({visible:true}).click();
    await page.getByRole('link',{name:'새 채팅',exact:true}).filter({visible:true}).click();
    await page.getByRole('textbox',{name:'메시지 입력'}).waitFor();
    assert.ok(!(await page.locator('body').innerText()).includes('동기화 부분이 어려워요'));
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await page.screenshot({path:`${output}/${name}.png`,fullPage:true,animations:'disabled'});
    await page.goto(base+'/ai-coaching');
    await page.getByRole('button',{name:'계획 추천',exact:true}).waitFor();
    await page.getByRole('button',{name:'계획 추천',exact:true}).click();
    await page.getByRole('dialog').waitFor();
    await page.screenshot({path:`${output}/${name}-coaching.png`,fullPage:true,animations:'disabled'});
    assert.deepEqual(errors,[]);
    await context.close();
  }
  console.log('PASS: desktop/mobile chat consent, new-chat reset, coaching dialog and no horizontal overflow or browser errors');
}finally{await browser.close();}

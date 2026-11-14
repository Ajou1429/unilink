import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.AJOU_PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const output = process.env.AJOU_SCREENSHOTS || '../.docx-work/drive-browser';
mkdirSync(output, { recursive: true });
try {
  for (const [name, viewport] of [['desktop', { width: 1440, height: 1000 }], ['mobile', { width: 390, height: 844 }]]) {
    const context = await browser.newContext({ viewport }), page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto((process.env.AJOU_TEST_URL || 'http://127.0.0.1:3041') + '/notes?demo=1');
    const success = page.getByText('이 브라우저의 마지막 수동 동기화 성공:', { exact: false });
    await success.waitFor();
    assert.ok((await success.innerText()).includes('성공 기록 없음'));
    await page.reload();
    await success.waitFor();
    assert.ok((await success.innerText()).includes('성공 기록 없음'));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: `${output}/${name}.png`, fullPage: true, animations: 'disabled' });
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log('PASS: desktop/mobile notes, reload does not claim sync success, no overflow or browser errors');
} finally { await browser.close(); }

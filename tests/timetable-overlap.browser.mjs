import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.AJOU_PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const base = process.env.AJOU_TEST_URL || 'http://localhost:3000';
const output = '/tmp/unilink-overlap-browser'; mkdirSync(output, { recursive: true });
try {
  for (const [name, viewport] of [['desktop', { width: 1440, height: 1000 }], ['mobile', { width: 390, height: 844 }]]) {
    const context = await browser.newContext({ viewport }), page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await context.addInitScript(() => {
      sessionStorage.setItem('unilink:demo-mode', '1');
      const prefix = 'unilink:private:demo:';
      const now = new Date(), monday = new Date(now); monday.setDate(now.getDate() - (now.getDay() + 6) % 7);
      const date = `${monday.getFullYear()}-${String(monday.getMonth()+1).padStart(2,'0')}-${String(monday.getDate()).padStart(2,'0')}`;
      const course = { id: 'overlap', name: '겹침 수업', term: '2026년 2학기', days: ['월'], startTime: '10:00', endTime: '12:00', credits: 3, professor: '', location: '', color: '#2563eb' };
      sessionStorage.setItem(prefix+'unilink:courses', JSON.stringify([course]));
      sessionStorage.setItem(prefix+'unilink:work-schedules', JSON.stringify([{ id: 'work', title: '겹침 고정 일정', days: ['월'], startTime: '11:00', endTime: '12:00', color: '#16a34a' }]));
      sessionStorage.setItem(prefix+'unilink:monthly-events', JSON.stringify([
        { id: 'exam', title: '겹침 시험', date, startTime: '10:30', endTime: '11:30', color: '#e11d48', createdAt: new Date().toISOString() },
        { id: 'later', title: '단독 일정', date, startTime: '12:00', endTime: '13:00', color: '#a855f7', createdAt: new Date().toISOString() },
      ]));
    });
    await context.route('https://*.supabase.co/**', route => route.abort());
    await page.goto(base+'/timetable?demo=1');
    const boxes = [];
    for (const text of ['겹침 수업', '겹침 시험', '겹침 고정 일정']) {
      const block = page.locator('button.absolute').filter({ has: page.getByText(text, { exact: true }) }).last();
      await block.waitFor();
      const box = await block.boundingBox(); assert.ok(box.width > 0); boxes.push(box);
    }
    boxes.sort((a,b)=>a.x-b.x);
    await page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
    assert.ok(boxes[0].x+boxes[0].width <= boxes[1].x+1);
    assert.ok(boxes[1].x+boxes[1].width <= boxes[2].x+1);
    const solo = await page.locator('button.absolute').filter({ has: page.getByText('단독 일정', { exact: true }) }).last().boundingBox();
    assert.ok(solo.width > boxes[0].width*2);
    await page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
    await page.locator('button.absolute').filter({ has: page.getByText('겹침 수업', { exact: true }) }).last().click();
    await page.waitForURL(/\/course\?/);
    assert.deepEqual(errors, []);
    await context.close(); console.log(`PASS ${name}: class/exam/commitment share separate lanes, disjoint event full width, class navigation`);
  }
} finally { await browser.close(); }

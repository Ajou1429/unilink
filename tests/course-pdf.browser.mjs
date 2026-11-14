import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.AJOU_PLAYWRIGHT_MODULE || 'playwright');
const pdf = await PDFDocument.create();
for (const text of ['Course PDF page one', 'Course PDF page two']) pdf.addPage([480, 640]).drawText(text, { x: 35, y: 550, size: 24 });
const fileDataUrl = 'data:application/pdf;base64,' + Buffer.from(await pdf.save()).toString('base64');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const output = '../.docx-work/course-pdf-browser';
mkdirSync(output, { recursive: true });
try {
  for (const [name, viewport] of [['desktop', { width: 1440, height: 1000 }], ['mobile', { width: 390, height: 844 }]]) {
    const context = await browser.newContext({ viewport }), page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(({ fileDataUrl }) => {
      sessionStorage.setItem('unilink:demo-mode', '1');
      sessionStorage.setItem('unilink:private:demo:unilink:courses', JSON.stringify([{ id: 'pdf-test-course', name: 'PDF test course', term: '2026년 2학기', days: ['월'], startTime: '09:00', endTime: '10:00', credits: 3, professor: '', location: '', color: 'blue' }]));
      sessionStorage.setItem('unilink:private:demo:unilink:my-notes', JSON.stringify([{ id: 'pdf-test-note', title: 'Course PDF fixture', linkedType: 'course', linkedId: 'pdf-test-course', courseName: 'PDF test course', source: '직접 작성', syncStatus: 'manual', content: '', fileName: 'lecture.pdf', fileDataUrl, version: 1, tags: [], updatedAt: '2026-11-14T00:00:00Z', createdAt: '2026-11-14T00:00:00Z' }]));
    }, { fileDataUrl });
    await page.goto((process.env.AJOU_TEST_URL || 'http://127.0.0.1:3041') + '/course?courseId=pdf-test-course&demo=1');
    await page.getByRole('button', { name: /직접 추가한 노트.*1개 노트/ }).click();
    await page.getByRole('button', { name: '노트 열기', exact: true }).click();
    await page.getByText('1 / 2', { exact: true }).waitFor();
    await page.getByRole('button', { name: '다음 페이지', exact: true }).click();
    await page.getByText('2 / 2', { exact: true }).waitFor();
    const canvas = page.locator('canvas').first();
    await canvas.waitFor();
    await page.waitForFunction(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas?.width) return false;
      const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      let dark = 0;
      for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 3] && pixels[i] < 100 && pixels[i + 1] < 100 && pixels[i + 2] < 100) dark++;
      return dark > 100;
    });
    await page.screenshot({ path: `${output}/${name}.png`, animations: 'disabled' });
    await page.evaluate(() => {
      const key = 'unilink:private:demo:unilink:my-notes';
      const notes = JSON.parse(sessionStorage.getItem(key));
      delete notes[0].fileDataUrl;
      sessionStorage.setItem(key, JSON.stringify(notes));
    });
    // Do not reseed on reload: validate that a missing source is visible, not blank.
    await page.getByRole('dialog').press('Escape');
    await page.evaluate(() => window.dispatchEvent(new Event('unilink:myNotesChanged')));
    await page.getByRole('button', { name: '노트 열기', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: '원본 파일이 연결되어 있지 않습니다' }).waitFor();
    await page.getByRole('button', { name: '다시 불러오기', exact: true }).waitFor();
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log('PASS: course PDF opens and renders two pages on desktop/mobile');
} finally { await browser.close(); }

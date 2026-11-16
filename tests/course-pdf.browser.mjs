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
    // 과목 화면: 11월 자료는 기말고사 탭의 강의자료 칸에 있다
    await page.getByRole('tab', { name: /기말고사/ }).click();
    await page.getByLabel('정렬', { exact: true }).selectOption('name');
    await page.getByLabel('정렬 순서').selectOption('asc');
    assert.equal(await page.getByLabel('정렬 순서').inputValue(), 'asc');
    // 강의자료 이름을 누르면 원본 PDF가 브라우저 새 탭에서 바로 열린다(팝업 보기 창 없음)
    const [tab] = await Promise.all([
      context.waitForEvent('page'),
      page.getByRole('button', { name: 'Course PDF fixture', exact: true }).click(),
    ]);
    await tab.waitForURL(/^blob:/);
    const opened = await tab.evaluate(async () => {
      const blob = await (await fetch(location.href)).blob();
      return { type: blob.type, head: new TextDecoder().decode(await blob.slice(0, 5).arrayBuffer()) };
    });
    assert.deepEqual(opened, { type: 'application/pdf', head: '%PDF-' });
    await tab.close();
    await page.screenshot({ path: `${output}/${name}.png`, animations: 'disabled' });
    await page.evaluate(() => {
      const key = 'unilink:private:demo:unilink:my-notes';
      const notes = JSON.parse(sessionStorage.getItem(key));
      delete notes[0].fileDataUrl;
      sessionStorage.setItem(key, JSON.stringify(notes));
    });
    // Do not reseed on reload: without an original file the title is plain text, not a dead link.
    await page.evaluate(() => window.dispatchEvent(new Event('unilink:myNotesChanged')));
    await page.getByText('Course PDF fixture', { exact: true }).waitFor();
    await page.waitForFunction(() => ![...document.querySelectorAll('button')].some((b) => b.textContent === 'Course PDF fixture'));
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log('PASS: course PDF opens as the original file in a new tab on desktop/mobile');
} finally { await browser.close(); }

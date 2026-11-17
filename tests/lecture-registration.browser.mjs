import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.AJOU_PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.AJOU_TEST_URL || 'http://localhost:3000';
async function pdfFor(chapters) {
  const pdf = await PDFDocument.create();
  for (const chapter of chapters) {
    const page = pdf.addPage([600, 800]);
    page.drawText('Operating System lecture', { x: 30, y: 760, size: 15 });
    for (let row = 0; row < 30; row++) page.drawText(createHash('sha256').update(`${chapter}-${row}`).digest('hex').slice(0, 55), { x: 30, y: 730 - row * 21, size: 12 });
  }
  return Buffer.from(await pdf.save());
}
const original = await pdfFor(['chapter1', 'chapter2', 'chapter3']);
const rich = await pdfFor(['chapter1', 'chapter2', 'chapter3', 'details']);
const different = await pdfFor(['chapter1', 'chapter2', 'different']);
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
try {
  const context = await browser.newContext(), page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await context.addInitScript(({ original }) => {
    sessionStorage.setItem('unilink:demo-mode', '1');
    const prefix = 'unilink:private:demo:';
    if (sessionStorage.getItem(prefix+'unilink:courses')) return;
    sessionStorage.setItem(prefix+'unilink:courses', JSON.stringify([{ id: 'content-course', name: 'Operating System', term: '2026년 2학기', days: ['월'], startTime: '09:00', endTime: '10:00', credits: 3, professor: '', location: '', color: '#2563eb' }]));
    sessionStorage.setItem(prefix+'unilink:my-notes', JSON.stringify([{ id: 'legacy', title: 'original slides', linkedType: 'course', linkedId: 'content-course', courseName: 'Operating System', source: '직접 작성', syncStatus: 'manual', content: '', fileName: 'original.pdf', fileDataUrl: 'data:application/pdf;base64,'+original, version: 1, tags: ['강의자료'], createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z' }]));
  }, { original: original.toString('base64') });
  await context.route('https://*.supabase.co/**', route => route.abort());
  await page.goto(base+'/dashboard?demo=1');
  async function upload(name, buffer, expected) {
    await page.locator('input[type=file]').first().setInputFiles({ name, mimeType: 'application/pdf', buffer });
    await page.getByRole('button', { name: '보내기', exact: true }).click();
    await page.waitForFunction(count => {
      const notes = JSON.parse(sessionStorage.getItem('unilink:private:demo:unilink:my-notes') || '[]');
      return notes.length === count && notes.every(note => !!note.contentProfile);
    }, expected);
    await page.waitForFunction(() => {
      const records = JSON.parse(sessionStorage.getItem('unilink:private:demo:unilink:file-intake-log') || '[]');
      return records[0]?.status === 'done';
    });
  }
  await upload('Operating System detailed lecture.pdf', rich, 2);
  await upload('Operating System renamed lecture.pdf', original, 2);
  await page.getByText(/내용이 더 풍부한 기존 강의노트/).waitFor();
  await upload('Operating System different lecture.pdf', different, 3);
  await page.goto(base+'/course?courseId=content-course&demo=1');
  const list = page.getByRole('region', { name: '강의자료', exact: true });
  await list.getByText('Operating System detailed lecture', { exact: true }).waitFor();
  await list.getByText('Operating System different lecture', { exact: true }).waitFor();
  assert.equal(await list.getByText('original slides', { exact: true }).count(), 0);
  await page.reload(); await list.getByText('Operating System detailed lecture', { exact: true }).waitFor();
  assert.equal(await list.getByText('original slides', { exact: true }).count(), 0);
  assert.equal(await page.evaluate(() => JSON.parse(sessionStorage.getItem('unilink:private:demo:unilink:my-notes')).length), 3);
  assert.deepEqual(errors, []);
  console.log('PASS real multi-page PDFs: legacy backfill, detailed source selection, smaller renamed file reused, shared introduction kept distinct, original preservation and reload');
  await context.close();
} finally { await browser.close(); }

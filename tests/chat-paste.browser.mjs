import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.AJOU_PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, executablePath: process.env.AJOU_BROWSER_EXECUTABLE || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const base = process.env.AJOU_TEST_URL || 'http://localhost:3000';
try {
  for (const [name, viewport] of [['desktop', { width: 1440, height: 1000 }], ['mobile', { width: 390, height: 844 }]]) {
    const context = await browser.newContext({ viewport }), page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await context.addInitScript(() => sessionStorage.setItem('unilink:demo-mode', '1'));
    await context.route('https://*.supabase.co/**', route => route.abort());
    await page.goto(`${base}/dashboard?demo=1`);
    const input = page.getByRole('textbox', { name: '메시지 입력' });
    await input.waitFor(); await input.fill('이 노트로 복습 계획을 세워줘');
    // Dispatch real browser ClipboardEvent/File objects without changing the OS clipboard.
    async function paste(files, fallback = false, text = '') {
      return input.evaluate((element, { files, fallback, text }) => {
        const data = new DataTransfer();
        for (const file of files) data.items.add(new File([file.content || 'fixture'], file.name, { type: file.type }));
        if (text) data.setData('text/plain', text);
        const event = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true });
        if (fallback) Object.defineProperty(event, 'clipboardData', { value: { files: new DataTransfer().files, items: data.items } });
        element.dispatchEvent(event);
        return event.defaultPrevented;
      }, { files, fallback, text });
    }
    assert.equal(await paste([{ name: 'lecture.pdf', type: 'application/pdf' }, { name: 'capture.png', type: 'image/png' }]), true);
    const attachments = page.getByRole('list', { name: '첨부한 파일' });
    await attachments.getByText('lecture.pdf', { exact: true }).waitFor();
    await attachments.getByText('capture.png', { exact: true }).waitFor();
    assert.equal(await attachments.getByRole('listitem').count(), 2, 'files and items must not duplicate each other');
    assert.equal(await input.inputValue(), '이 노트로 복습 계획을 세워줘');
    assert.equal(await paste([{ name: 'clipboard.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }], true), true);
    await attachments.getByText('clipboard.docx', { exact: true }).waitFor();
    assert.equal(await attachments.getByRole('listitem').count(), 3);
    assert.equal(await paste([], false, '일반 텍스트'), false, 'plain text keeps the browser default paste');
    assert.equal(await attachments.getByRole('listitem').count(), 3);
    await page.getByRole('button', { name: 'lecture.pdf 첨부 취소', exact: true }).click();
    assert.equal(await attachments.getByRole('listitem').count(), 2);
    await page.getByRole('button', { name: 'capture.png 첨부 취소', exact: true }).click();
    await page.getByRole('button', { name: 'clipboard.docx 첨부 취소', exact: true }).click();
    await input.fill('');
    assert.equal(await page.getByRole('button', { name: '보내기', exact: true }).isDisabled(), true);
    await paste([{ name: 'only-file.pdf', type: 'application/pdf' }]);
    assert.equal(await page.getByRole('button', { name: '보내기', exact: true }).isEnabled(), true);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`PASS ${name}: PDF/image/document paste, items fallback, no duplicates, text preservation, cancellation and file-only submission readiness`);
  }
} finally { await browser.close(); }

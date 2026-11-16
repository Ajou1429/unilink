// No live model/DB calls: authenticated browser integration with intercepted HTTP.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.AJOU_PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.AJOU_TEST_URL || 'http://127.0.0.1:3057';
const output = '../.docx-work/service-agent-browser';
mkdirSync(output, { recursive: true });
const A = '00000000-0000-4000-8000-000000000001', C = '00000000-0000-4000-8000-000000000002', G = '00000000-0000-4000-8000-000000000003';
const user = { id: A, aud: 'authenticated', role: 'authenticated', email: 'fixture@example.invalid', user_metadata: { display_name: '테스트 사용자' }, app_metadata: { provider: 'email' }, created_at: '2026-11-01T00:00:00Z' };
const token = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: A, aud: 'authenticated', exp: 2051222400, role: 'authenticated' })).toString('base64url')}.test`;
const course = { id: 'test-course', name: '품질공학', term: '2026년 2학기', credits: 3, days: [], startTime: '', endTime: '', professor: '', location: '', color: 'blue' };
const goal = { id: G, user_id: A, title: '품질공학', course_id: C, goal_type: 'course', status: 'active', metadata: { schema_version: 1, legacy_record: { courseId: course.id } } };
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  for (const [name, viewport] of [['desktop', { width: 1440, height: 1000 }], ['mobile', { width: 390, height: 844 }]]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage(), errors = [], writes = [], calls = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('requestfailed', req => console.log('FAILED', req.url(), req.failure()));
    await context.addInitScript(({ user, token }) => localStorage.setItem('sb-agent-test-auth-token', JSON.stringify({ access_token: token, refresh_token: 'test-refresh', expires_at: 2051222400, expires_in: 3600, token_type: 'bearer', user })), { user, token });
    await context.route('https://agent-test.supabase.co/**', async route => {
      const req = route.request(), url = new URL(req.url()), body = req.postDataJSON();
      const respond = value => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(value), headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS' } });
      if (req.method() === 'OPTIONS') return respond({});
      if (url.pathname.startsWith('/auth/v1/user')) return respond(user);
      if (url.pathname.endsWith('/functions/v1/service-agent')) {
        calls.push(body);
        if (body.attachments?.some(a => a.status === 'pending')) return respond({ version: 'service-agent-v1', request_id: body.request_id, result: {
          route: 'assistant', reply: '첨부 자료를 등록하지 않았습니다. 저장 없이 PDF를 읽는 기능은 아직 연결되지 않았습니다.', record_learning: false, process_attachments: false, clarification: null, calendar: [], coaching: null,
        } });
        return respond({ version: 'service-agent-v1', request_id: body.request_id, result: {
          route: 'coaching', reply: '과제 일정을 먼저 확인한 뒤 품질공학 계획을 이어갑니다.', record_learning: false, process_attachments: false, clarification: null,
          calendar: [{ goal_id: G, kind: 'assignment', title: '품질공학 보고서', description: '실습 결과 정리', exam_scope: '', starts_at: null, ends_at: null, due_at: '2026-11-20T23:00:00+09:00' }],
          coaching: { intent: 'weekly_plan', goal_ids: [G], daily_minutes: 45, period_start: '2026-11-18', period_end: '2026-11-20' },
        } });
      }
      if (url.pathname.includes('/functions/')) return respond({ connected: false, result: { actions: [], reply: '', dropped: 0 } });
      const table = url.pathname.split('/').at(-1);
      if (url.pathname.includes('/rpc/')) return respond(null);
      if (table === 'learning_goals') return respond([goal]);
      if (table === 'courses') return respond([{ id: C, user_id: A, name: course.name, term: course.term, credits: 3, status: 'active', metadata: { schema_version: 1, source: 'browser-local-storage', legacy_bucket: 'unilink:courses', legacy_id: course.id, legacy_record: course } }]);
      if (table === 'calendar_events') {
        if (req.method() === 'POST') { writes.push(body); return respond({ ...body, id: body.id }); }
        const specific = url.searchParams.get('id');
        if (specific) return respond(writes.find(row => `eq.${row.id}` === specific) ?? null);
        return respond(writes);
      }
      return respond([]);
    });
    await page.goto(`${base}/dashboard`);
    const textbox = page.getByRole('textbox', { name: '메시지 입력' });
    await textbox.waitFor();
    await textbox.fill('품질공학 보고서 20일 밤 11시 마감 등록하고 18일부터 20일까지 하루 45분 계획 잡아줘');
    await page.getByRole('button', { name: '보내기', exact: true }).click();
    await page.getByRole('button', { name: '동의하고 계속', exact: true }).click();
    const save = page.getByRole('button', { name: '확인하고 일정 추가', exact: true });
    await save.waitFor();
    assert.equal(writes.length, 0, 'preview is not a write');
    assert.equal(await page.getByRole('button', { name: '계획 추천', exact: true }).count(), 0, 'coach waits for prerequisite');
    await page.screenshot({ path: `${output}/${name}-preview.png`, fullPage: true });
    await save.click();
    try { await page.getByText('DB 저장 완료', { exact: true }).waitFor({ timeout: 10000 }); }
    catch (error) { console.log((await page.locator('body').innerText()).slice(-5000), { writes, errors }); throw error; }
    assert.equal(writes.length, 1);
    assert.equal(writes[0].user_id, A);
    await page.getByRole('button', { name: '계획 추천', exact: true }).click();
    await page.getByRole('dialog').waitFor();
    assert.equal(await page.getByLabel('하루 목표 순공시간 (분)').inputValue(), '45');
    assert.ok(await page.getByRole('checkbox', { name: '품질공학', exact: true }).isChecked());
    await page.getByText('2026-11-18 ~ 2026-11-20', { exact: false }).waitFor();
    await page.screenshot({ path: `${output}/${name}-coaching.png`, fullPage: true });
    await page.getByRole('dialog').press('Escape');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    if (name === 'mobile') await page.getByRole('button', { name: /^목록 (열기|닫기)$/ }).filter({ visible: true }).click();
    await page.getByRole('link', { name: '새 채팅', exact: true }).filter({ visible: true }).click();
    assert.equal(await page.getByText('DB 저장 완료', { exact: true }).count(), 0);
    assert.equal(calls.length, 1);
    if (name === 'mobile') await page.getByRole('dialog', { name: '전체 메뉴' }).waitFor({ state: 'hidden' });
    await textbox.fill('저장하지 말고 이 PDF 확인만 해줘');
    await page.locator('input[type=file]').setInputFiles({ name: 'notes.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n') });
    await page.getByRole('button', { name: '보내기', exact: true }).click();
    await page.getByText('첨부 자료는 등록하지 않았습니다.', { exact: true }).waitFor();
    assert.equal(writes.length, 1);
    assert.equal(calls.length, 2);
    await page.goto(`${base}/timetable`);
    await page.getByText('품질공학 · 품질공학 보고서', { exact: false }).first().waitFor();
    await page.screenshot({ path: `${output}/${name}-timetable.png`, fullPage: true });
    // Bare files use existing intake only, including in guest/demo mode.
    await page.goto(`${base}/dashboard?demo=1`);
    const pdf = await PDFDocument.create(); pdf.addPage([300, 400]).drawText('Course lecture notes');
    await page.locator('input[type=file]').setInputFiles({ name: 'standalone-notes.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await pdf.save()) });
    await page.getByRole('button', { name: '보내기', exact: true }).click();
    await page.waitForFunction(() => {
      const rows = JSON.parse(sessionStorage.getItem('unilink:private:demo:unilink:file-intake-log') || '[]');
      return rows.some(row => row.fileName === 'standalone-notes.pdf' && row.status === 'done');
    });
    assert.equal(calls.length, 2, 'file-only upload never invokes classifier/coach');
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log('PASS: desktop/mobile chat -> consent -> preview -> approved DB write -> original coaching prefill; calendar visibility, no-save attachments, bare PDF intake, reset/no overflow. HTTP mocked, no paid calls.');
} finally { await browser.close(); }

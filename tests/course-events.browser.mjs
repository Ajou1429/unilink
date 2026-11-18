import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.AJOU_PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, executablePath: process.env.AJOU_BROWSER_EXECUTABLE || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const base = process.env.AJOU_TEST_URL || 'http://localhost:3000';
const output = '/tmp/unilink-course-events-browser';
mkdirSync(output, { recursive: true });
const uid = '00000000-0000-4000-8000-000000007001', cid = '00000000-0000-4000-8000-000000007002', gid = '00000000-0000-4000-8000-000000007003';
const user = { id: uid, aud: 'authenticated', role: 'authenticated', email: 'course-test@example.invalid', user_metadata: { display_name: '테스트' }, app_metadata: { provider: 'email' }, created_at: '2026-01-01T00:00:00Z' };
const course = { id: cid, name: '운영체제', term: '2026년 2학기', professor: '', credits: 3, days: [], startTime: '', endTime: '', location: '', color: '#2563eb' };
try {
  for (const [name, viewport] of [['desktop', { width: 1440, height: 1000 }], ['mobile', { width: 390, height: 844 }]]) {
    const context = await browser.newContext({ viewport }), page = await context.newPage(), errors = [], writes = [];
    const rows = new Map([
      ['assignment', { id: 'assignment', user_id: uid, goal_id: gid, title: '완료 보고서', event_type: 'assignment', description: '기존 과제 내용', exam_scope: '', due_at: '2026-11-20T14:59:00Z', starts_at: null, ends_at: null, status: 'completed' }],
      ['exam', { id: 'exam', user_id: uid, goal_id: gid, title: '중간고사', event_type: 'exam', description: '시험 설명', exam_scope: '1~5장', due_at: null, starts_at: '2026-10-20T05:00:00Z', ends_at: '2026-10-20T06:00:00Z', status: 'scheduled' }],
    ]);
    rows.set('ongoing', { id: 'ongoing', user_id: uid, goal_id: gid, title: '진행 중 시험', event_type: 'exam', description: '', exam_scope: '', due_at: null, starts_at: new Date(Date.now() - 3600000).toISOString(), ends_at: new Date(Date.now() + 3600000).toISOString(), status: 'scheduled' });
    rows.set('future', { id: 'future', user_id: uid, goal_id: gid, title: '다음 시험', event_type: 'exam', description: '', exam_scope: '', due_at: null, starts_at: '2030-12-20T05:00:00Z', ends_at: '2030-12-20T06:00:00Z', status: 'scheduled' });
    rows.set('quiz', { id: 'quiz', user_id: uid, goal_id: gid, title: '지난 퀴즈', event_type: 'quiz', description: '', exam_scope: '', due_at: null, starts_at: '2026-10-10T05:00:00Z', ends_at: null, status: 'scheduled' });
    let failSave = false;
    page.on('pageerror', error => errors.push(error.message));
    await context.addInitScript(({ user }) => {
      const encode = value => btoa(JSON.stringify(value)).replaceAll('=', '').replaceAll('+', '-').replaceAll('/', '_');
      const access_token = encode({ alg: 'HS256', typ: 'JWT' }) + '.' + encode({ sub: user.id, exp: 2051222400, role: 'authenticated', aud: 'authenticated' }) + '.mock';
      localStorage.setItem('sb-lqwpcwzjbqeunqfliaso-auth-token', JSON.stringify({ access_token, refresh_token: 'test-only', expires_at: 2051222400, expires_in: 3600, token_type: 'bearer', user }));
    }, { user });
    // All backend traffic is mocked. This test performs no production writes.
    await context.route('https://*.supabase.co/**', async route => {
      const request = route.request(), url = new URL(request.url());
      const json = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(data) });
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' } });
      if (url.pathname === '/auth/v1/user') return json(user);
      if (url.pathname.includes('/functions/')) return json({ connected: false });
      if (url.pathname.includes('/rpc/')) return json(null);
      const table = url.pathname.split('/').at(-1);
      if (table === 'courses') return json([{ id: cid, user_id: uid, status: 'active', ...course, metadata: { schema_version: 1, legacy_bucket: 'unilink:courses', legacy_record: course } }]);
      if (table === 'learning_goals') return json([{ id: gid, user_id: uid, course_id: cid, goal_type: 'course', title: course.name, status: 'active', metadata: {} }]);
      if (table === 'notes') return json(['2026-09-01', '2026-11-01'].map((date, index) => ({ id: `note-${index}`, user_id: uid, title: `강의노트 ${index + 1}`, course_name: course.name, linked_type: 'course', linked_id: cid, source: '직접 작성', sync_status: 'manual', content: '', tags: [], version: 1, created_at: date, updated_at: date })));
      if (table === 'calendar_events') {
        if (request.method() === 'PATCH' || request.method() === 'POST') {
          writes.push({ method: request.method(), query: Object.fromEntries(url.searchParams), body: request.postDataJSON() });
          if (failSave) return json({ message: '저장 연결 실패', code: 'TEST' }, 503);
          const id = url.searchParams.get('id')?.slice(3) || `new-${writes.length}`;
          const row = { ...rows.get(id), ...request.postDataJSON(), id };
          rows.set(id, row); return json(row);
        }
        let data = [...rows.values()];
        for (const [key, value] of url.searchParams) {
          if (value.startsWith('eq.')) data = data.filter(row => String(row[key]) === value.slice(3));
          if (value.startsWith('neq.')) data = data.filter(row => String(row[key]) !== value.slice(4));
        }
        return json(data);
      }
      return json([]);
    });
    await page.goto(`${base}/course?courseId=${cid}`);
    const materials = page.getByRole('region', { name: '강의자료', exact: true });
    for (const title of ['강의노트 1', '강의노트 2']) await materials.getByText(title, { exact: true }).waitFor();
    await page.getByRole('tab', { name: /기말고사/ }).click();
    for (const title of ['강의노트 1', '강의노트 2']) assert.equal(await materials.getByText(title, { exact: true }).count(), 1);
    const section = page.getByRole('region', { name: '과제·시험 일정' });
    assert.equal(await section.getByRole('button', { name: /완료 보고서|중간고사/ }).count(), 0);
    await section.getByRole('button', { name: /진행 중 시험/ }).waitFor();
    await section.getByRole('button', { name: /다음 시험/ }).waitFor();
    assert.equal(await section.getByRole('button', { name: /지난 퀴즈/ }).count(), 0);

    await section.getByRole('button', { name: /^완료 일정/ }).click();
    const pastExam = section.getByRole('region', { name: '완료 일정', exact: true }).getByRole('button', { name: /중간고사/ });
    await pastExam.waitFor();
    await section.getByRole('region', { name: '완료 일정', exact: true }).getByRole('button', { name: /지난 퀴즈/ }).waitFor();
    assert.equal(rows.get('exam').status, 'scheduled');
    assert.ok((await pastExam.locator('..').boundingBox()).height < 85);
    await section.getByRole('button', { name: /완료 보고서/ }).click();
    let dialog = page.getByRole('dialog');
    assert.equal(await dialog.getByLabel('과제 내용·일정 설명').inputValue(), '기존 과제 내용');
    await dialog.evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished.catch(() => {}))));
    const bounds = await dialog.boundingBox();
    assert.ok(bounds.width <= viewport.width && bounds.height <= viewport.height);
    if (name === 'desktop') assert.ok(bounds.width >= 760);
    await dialog.getByLabel('제목', { exact: true }).fill('수정 보고서');
    await dialog.getByLabel('과제 내용·일정 설명').fill('수정한 과제 내용');
    failSave = true; await dialog.getByRole('button', { name: '저장', exact: true }).click();
    await dialog.getByRole('alert').waitFor(); assert.equal(await dialog.count(), 1);
    failSave = false; await dialog.getByRole('button', { name: '저장', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    const saved = writes.at(-1);
    assert.equal(saved.query.user_id, `eq.${uid}`); assert.equal(saved.query.goal_id, `eq.${gid}`);
    assert.equal(saved.body.status, 'completed'); assert.equal(saved.body.description, '수정한 과제 내용');
    await section.getByRole('button', { name: /수정 보고서/ }).waitFor();
    await section.getByRole('button', { name: /중간고사/ }).click(); dialog = page.getByRole('dialog');
    assert.equal(await dialog.getByLabel('시험 범위').inputValue(), '1~5장');
    const originalEnd = await dialog.getByLabel('종료 일시').inputValue();
    const previousWrites = writes.length;
    await dialog.getByLabel('종료 일시').fill('2026-10-19T01:00');
    await dialog.getByRole('button', { name: '저장', exact: true }).click();
    await dialog.getByRole('alert').waitFor(); assert.equal(writes.length, previousWrites);
    await dialog.getByLabel('종료 일시').fill(originalEnd);
    await dialog.getByLabel('시험 범위').fill('1~7장');
    await dialog.getByRole('button', { name: '저장', exact: true }).click(); await dialog.waitFor({ state: 'hidden' });
    assert.equal(rows.get('exam').exam_scope, '1~7장');
    await section.getByRole('button', { name: '일정 추가', exact: true }).click(); dialog = page.getByRole('dialog');
    assert.match(await dialog.getByLabel('제출 마감').inputValue(), /T23:59$/);
    await dialog.getByLabel('제목', { exact: true }).fill('새 과제');
    const beforeCreate = writes.length;
    await dialog.getByRole('button', { name: '저장', exact: true }).evaluate(button => { button.click(); button.click(); });
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(writes.length, beforeCreate + 1);
    assert.equal(writes.at(-1).method, 'POST'); assert.equal(writes.at(-1).body.event_type, 'assignment');
    await section.getByRole('checkbox', { name: '새 과제 완료', exact: true }).click();
    await section.getByRole('region', { name: '완료 일정', exact: true }).getByRole('checkbox', { name: '새 과제 완료', exact: true }).waitFor();
    assert.equal(rows.get(writes.at(-1).query.id.slice(3)).status, 'completed');
    await page.reload();
    await section.getByRole('button', { name: /^완료 일정/ }).waitFor();
    assert.equal(await section.getByRole('button', { name: /새 과제|수정 보고서|중간고사/ }).count(), 0);
    await section.getByRole('button', { name: /^완료 일정/ }).click();
    const completed = section.getByRole('region', { name: '완료 일정', exact: true });
    assert.equal(await completed.getByRole('checkbox', { name: '새 과제 완료', exact: true }).isChecked(), true);
    await completed.getByRole('button', { name: /새 과제/ }).click();
    dialog = page.getByRole('dialog');
    assert.equal(await dialog.getByRole('checkbox', { name: '과제 완료', exact: true }).isChecked(), true);
    await dialog.getByRole('checkbox', { name: '과제 완료', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('[role="dialog"] input[type="checkbox"]').disabled);
    assert.equal(await dialog.getByRole('checkbox', { name: '과제 완료', exact: true }).isChecked(), false);
    await dialog.getByRole('button', { name: '닫기', exact: true }).click();
    await section.getByRole('button', { name: /^완료 일정/ }).click();
    failSave = true;
    await section.getByRole('checkbox', { name: '새 과제 완료', exact: true }).click();
    await section.getByRole('alert').waitFor();
    assert.equal(await section.getByRole('checkbox', { name: '새 과제 완료', exact: true }).isChecked(), false);
    failSave = false;
    await section.getByRole('checkbox', { name: '새 과제 완료', exact: true }).click();
    await section.getByRole('checkbox', { name: '새 과제 완료', exact: true }).waitFor({ state: 'hidden' });

    await section.getByRole('button', { name: /^완료 일정/ }).click();
    await section.getByRole('button', { name: /중간고사/ }).click();
    assert.equal(await page.getByRole('dialog').getByLabel('시험 범위').inputValue(), '1~7장');
    await page.screenshot({ path: `${output}/${name}-event.png`, fullPage: true });
    await page.getByRole('dialog').getByRole('button', { name: '닫기', exact: true }).click();
    await page.getByRole('button', { name: '과목 설정', exact: true }).click();
    await page.getByRole('dialog').getByRole('tab', { name: '강의자료', exact: true }).click();
    assert.equal(await page.getByRole('dialog').getByRole('combobox').count(), 0);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log('PASS course desktop/mobile: all notes across tabs, editable task/exam dialogs, scoped saves, failure retry, completion preserved, reload, date default, checkbox completion persistence, completed/past-exam disclosure, ongoing/future exams, compact cards and form size');
} finally { await browser.close(); }

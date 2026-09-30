import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createBrowser, createClient, createDatabase } from './runtime.mjs';
import { createExternalRuntime, samplePdf } from './external.mjs';

function generator(seed) {
  let state = seed >>> 0 || 1;
  return (size) => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) % size; };
}
function uuid(seed, label) {
  const hex = createHash('sha256').update(`${seed}:${label}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
const now = '2026-09-29T00:00:00Z';
const clone = (value) => JSON.parse(JSON.stringify(value));
const time = (hour, minute = 0) => `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

export function generateUsers(seed, count) {
  const random = generator(seed);
  return Array.from({ length: count }, (_, index) => {
    const id = uuid(seed, `user-${index}`);
    const courseCount = 3 + random(4);
    const courses = Array.from({ length: courseCount }, (_, ci) => {
      const hour = ci === 0 && index % 3 === 0 ? 6 : 8 + ci * 2;
      const day = ['월', '화', '수', '목', '금'][random(5)];
      const otherDay = ci === courseCount - 1 ? '토' : day === '월' ? '수' : '일';
      return { id: `sim-course-${index}-${ci}`, name: ['데이터베이스', '품질공학', '기계학습', '통계학', '알고리즘', '운영관리'][ci],
        term: '2026-2', professor: `가상 교수 ${ci + 1}`, credits: 3, location: `${100 + ci}호`, color: ['red', 'blue', 'green', 'purple'][random(4)],
        days: [day, otherDay], startTime: time(hour, 30), endTime: time(hour + 1, 45),
        schedules: [{ day, startTime: time(hour, 30), endTime: time(hour + 1, 45) }, { day: otherDay, startTime: time(hour), endTime: time(hour + 1) }] };
    });
    return { id, name: `가상 학습자 ${index + 1}`, email: `sim-${seed}-${index + 1}@example.invalid`,
      persona: ['early-start', 'working-student', 'weekend-study'][index % 3], courses,
      problemCount: 6 + random(15), difficulty: ['하', '중', '상'][random(3)] };
  });
}

export async function runSimulation({ seed = 20260929, users: userCount = 12, directory, onProgress = () => {} } = {}) {
  if (!Number.isInteger(seed) || seed < 1 || !Number.isInteger(userCount) || userCount < 2 || userCount > 50) throw new Error('Use an integer seed and 2..50 users.');
  const users = generateUsers(seed, userCount);
  const { db, applied, excluded } = await createDatabase(directory);
  const report = { seed, userCount, fixtureDate: now, generatedAt: new Date().toISOString(), applied, excluded, scenarios: [],
    externalServices: 'Google OAuth/Drive/Gemini responses are simulated; actual Edge handlers, crypto, PDF parsing and SQL run locally.',
    productionGaps: ['Hosted Auth/HTTP and real Google consent/token validity are not exercised.',
      'Grade/spec/community/notifications and some inline notes/files still use browser storage; simulation snapshots are not production persistence.',
      'Schedule overlap resolution and automatic coaching generation are not implemented in P0.',
      'Hosted cron delivery, actual object-storage signing and browser PDF rendering require separate live checks.'] };
  const files = new Map();
  const pdf = await samplePdf();
  const external = createExternalRuntime(db, users, pdf);
  const admin = createClient(db, { admin: true });
  const browsers = [];
  async function check(name, fn, mode = 'database') {
    try {
      const details = await fn();
      report.scenarios.push({ name, status: 'passed', mode, details: details ?? {} });
    } catch (error) {
      report.scenarios.push({ name, status: 'failed', mode, details: { error: error?.message ?? String(error) } });
    }
    onProgress(report.scenarios.at(-1));
  }
  const rows = async (table, userId) => {
    const result = await db.query(`select * from public."${table}"${userId ? ' where user_id=$1' : ''}`, userId ? [userId] : []);
    return clone(result.rows);
  };
  try {
    await db.query('insert into simulation.run_config(config) values ($1)', [JSON.stringify({ seed, userCount, fixtureDate: now, production: false })]);
    for (const [index, user] of users.entries()) {
      await db.query('insert into auth.users(id,email,raw_user_meta_data) values ($1,$2,$3)', [user.id, user.email, JSON.stringify({ name: user.name, simulation: true })]);
      const client = createClient(db, { userId: user.id, invoke: external.invoke, files });
      const browser = createBrowser(client, user.id);
      browsers.push(browser);
      const store = (key, value) => browser.set(`unilink:${key}`, value);
      store('courses', user.courses);
      store('work-schedules', [{ id: `work-${index}`, title: '기타 일정', location: '가상 도서관', color: 'green', days: ['금', '일'], startTime: '18:00', endTime: '21:00', createdAt: now,
        schedules: [{ day: '금', startTime: '18:00', endTime: '21:00' }, { day: '일', startTime: '09:00', endTime: '12:00' }] }]);
      const personal = [{ id: `personal-${index}`, title: 'SQL 자격증', category: '자격증', goal: '모의고사 80점', targetDate: '2026-10-20', status: 'active', color: 'blue', createdAt: now }];
      store('personal-studies', personal);
      const plans = user.courses.map((course, ci) => ({ id: `plan-${index}-${ci}`, userId: user.id, courseId: course.id, courseName: course.name,
        week: 1, weekStart: '2026-09-27', title: `${course.name} 1장 복습`, description: '예제 3문제 풀이', dueDate: '2026-10-02', isCompleted: ci === 1, createdAt: now }));
      store('course-plans', plans);
      store('weekly-study-plans', [...plans, { ...plans[0], id: `self-${index}`, courseId: 'self', courseName: '개인 학습' }]);
      store('monthly-study-plans', plans.map((plan) => ({ ...plan, id: `weekly-${plan.id}`, month: '2026-09' })));
      store('monthly-study-goals', [{ id: `goal-${index}`, month: '2026-10', title: '중간고사 준비', description: '핵심 개념 정리', isCompleted: false, createdAt: now }]);
      store('personal-study-plans', [{ id: `personal-plan-${index}`, studyId: personal[0].id, title: 'SQL 문제 풀이', description: '기출 10문제', dueDate: '2026-10-01', isCompleted: false, createdAt: now }]);
      store('monthly-events', [{ id: `event-${index}`, title: '하루 일정', date: '2026-10-03', startTime: '13:30', endTime: '15:00', location: '도서관', memo: '모임', color: 'red', createdAt: now },
        { id: `deadline-${index}`, title: '목표 기한', kind: 'personal-deadline', personalStudyId: personal[0].id, date: '2026-10-20', startTime: '09:00', endTime: '10:00', location: '', color: 'blue', memo: '', createdAt: now }]);
      store('course-sessions', user.courses.map((course, ci) => ({ id: `session-${index}-${ci}`, courseId: course.id, courseName: course.name, date: '2026-09-29', startTime: course.startTime, endTime: course.endTime,
        progressTitle: `${ci + 1}장`, progressMemo: '예제까지 진행', difficulty: ['하', '중', '상'][ci % 3], pace: user.difficulty,
        noteId: '', noteTitle: '', pageStart: '1', pageEnd: String(10 + ci * 5), updatedAt: now, createdAt: now })));
      await browser.lib('p0-sync').initializeP0Account(user.id);
      const bank = browser.lib('problem-bank-storage');
      const subject = await bank.createSubject(`${user.courses[0].name} 문제은행`);
      user.subjectId = subject.id;
      const inserted = await client.from('problem_bank_problems').insert(Array.from({ length: user.problemCount }, (_, pi) => ({
        subject_id: subject.id, user_id: user.id, label: `SIM ${pi + 1}`, level: pi % 6, source_file: 'simulation-problems.pdf',
      })));
      if (inserted.error) throw new Error(inserted.error.message);
      await browser.lib('my-notes-storage').addNote({ title: '강의 자료', courseName: user.courses[0].name, linkedType: 'course', linkedId: user.courses[0].id,
        linkedTitle: user.courses[0].name, source: '직접 작성', content: '가상 강의 자료입니다.', tags: ['simulation'], file: new File([pdf], 'lecture.pdf', { type: 'application/pdf' }) });
      const goals = await rows('learning_goals', user.id);
      const courseGoal = goals.find((goal) => goal.goal_type === 'course');
      const topicId = uuid(seed, `topic-${index}`);
      await db.query(`insert into goal_topics(id,user_id,goal_id,title,metadata) values ($1,$2,$3,'기초 개념',$4)`, [topicId, user.id, courseGoal.id, JSON.stringify({ schema_version: 1, simulation: true })]);
      const sessions = await rows('course_sessions', user.id);
      const courseSession = sessions.find((session) => session.course_id === courseGoal.course_id);
      await db.query('insert into course_session_topics(user_id,session_id,course_id,goal_id,topic_id) values ($1,$2,$3,$4,$5)', [user.id, courseSession.id, courseGoal.course_id, courseGoal.id, topicId]);
      const items = await rows('study_plan_items', user.id);
      const item = items.find((item) => item.goal_id === courseGoal.id);
      for (const [status, minutes] of [['completed', 30], ['partial', 12.5], ['abandoned', 0]]) {
        const result = await client.from('study_sessions').insert({ user_id: user.id, goal_id: courseGoal.id, topic_id: topicId, plan_item_id: item.id,
          actual_minutes: minutes, completion_status: status, source: 'manual', metadata: { schema_version: 1, simulation: true } });
        if (result.error) throw new Error(result.error.message);
      }
      onProgress({ name: `seed ${index + 1}/${userCount}`, status: 'seeded' });
    }
    const [a, b] = users;
    const [app, other] = browsers;
    const client = createClient(db, { userId: a.id, invoke: external.invoke, files });
    await check('randomized users, weekday/weekend schedules, plans and execution records persist', async () => {
      assert.equal((await rows('courses')).length, users.reduce((sum, user) => sum + user.courses.length, 0));
      assert.equal((await rows('study_sessions')).length, userCount * 3);
      assert.ok((await rows('course_schedules')).some((slot) => slot.day_of_week === 6));
      assert.ok((await rows('course_schedules')).some((slot) => slot.start_time < '08:00:00'));
      for (const user of users) assert.equal((await rows('study_plan_items', user.id)).length, user.courses.length + 2);
    });
    await check('fresh device restores timetable, per-class progress, difficulty and notes', async () => {
      const restored = createBrowser(client, a.id);
      await restored.lib('p0-sync').initializeP0Account(a.id);
      assert.equal(restored.lib('course-storage').getAllStoredCourses().length, a.courses.length);
      const sessions = restored.lib('timetable-storage').getCourseSessions();
      assert.equal(sessions.length, a.courses.length);
      assert.deepEqual(new Set(sessions.map((session) => session.difficulty)), new Set(['하', '중', '상']));
      assert.equal(sessions[0].progressMemo, '예제까지 진행');
      assert.equal((await restored.lib('my-notes-storage').getMyNotes()).length, 1);
    });
    await check('different users cannot read each other through unfiltered service queries', async () => {
      for (const user of users) {
        const scoped = createClient(db, { userId: user.id });
        for (const table of ['courses', 'course_sessions', 'calendar_events', 'study_plan_items', 'notes', 'problem_bank_subjects', 'problem_bank_problems']) {
          const { data, error } = await scoped.from(table).select('*');
          assert.equal(error, null);
          assert.ok(data.length > 0);
          assert.ok(data.every((row) => row.user_id === user.id));
        }
      }
    });
    await check('timetable edits, progress changes and event deletion survive a fresh-device restore', async () => {
      const stopListening = app.lib('p0-sync').startP0SyncListener();
      try {
        const courses = app.get('unilink:courses');
        courses[0].schedules[0].startTime = '05:30';
        courses[0].schedules[0].endTime = '06:45';
        app.set('unilink:courses', courses);
        const sessions = app.get('unilink:course-sessions');
        sessions[0].progressTitle = '3장 추가 진도';
        sessions[0].difficulty = '상';
        app.set('unilink:course-sessions', sessions);
        app.set('unilink:monthly-events', app.get('unilink:monthly-events').filter((event) => event.id !== 'event-0'));
        await app.lib('p0-sync').flushP0Changes();
        const restored = createBrowser(client, a.id);
        await restored.lib('p0-sync').initializeP0Account(a.id);
        assert.ok(restored.get('unilink:courses').find((course) => course.id === courses[0].id).schedules.some((slot) => slot.startTime === '05:30'));
        assert.ok(restored.get('unilink:course-sessions').some((session) => session.progressTitle === '3장 추가 진도' && session.difficulty === '상'));
        assert.ok(!restored.get('unilink:monthly-events').some((event) => event.id === 'event-0'));
      } finally { stopListening(); }
    });
    await check('other users cannot change ownership or reference foreign course goals', async () => {
      const foreignGoal = (await rows('learning_goals', b.id))[0];
      const { error } = await client.from('calendar_events').insert({ user_id: a.id, goal_id: foreignGoal.id, event_type: 'exam', title: 'forbidden', due_at: now });
      assert.equal(error?.code, '23503');
      const changed = await client.from('courses').update({ name: 'forbidden' }).eq('user_id', b.id).select('id');
      assert.deepEqual(changed.data, []);
    });
    await check('problem bank CRUD and 0..5 levels use the actual frontend repository', async () => {
      const bank = app.lib('problem-bank-storage');
      const problems = await bank.listProblems(a.subjectId);
      assert.equal(problems.length, a.problemCount);
      assert.equal((await bank.setProblemLevel(problems[0].id, 5)).level, 5);
      await assert.rejects(bank.setProblemLevel(problems[0].id, 6));
      await bank.deleteProblem(problems.at(-1).id);
      assert.equal((await bank.listSubjects())[0].count, a.problemCount - 1);
      assert.equal((await other.lib('problem-bank-storage').listProblems(a.subjectId)).length, 0);
    });
    await check('note files have real PDF bytes, classification updates and isolated storage paths', async () => {
      const notes = app.lib('my-notes-storage');
      const note = (await notes.getMyNotes())[0];
      assert.equal(new TextDecoder().decode(files.get(`note-files/${note.filePath}`).subarray(0, 5)), '%PDF-');
      await notes.updateNoteClassification(note.id, 'personal', 'personal-0', 'SQL 자격증');
      assert.equal((await notes.getMyNotes())[0].linkedType, 'personal');
      const attack = await createClient(db, { userId: b.id }).storage.from('note-files').upload(`${a.id}/attack.pdf`, new File([pdf], 'test.pdf', { type: 'application/pdf' }));
      assert.ok(attack.error);
    });
    const verifier = 's'.repeat(64);
    const challenge = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))).toString('base64url');
    async function connect(user) {
      const start = await external.invoke('google-auth/start', user.id, { codeChallenge: challenge });
      assert.equal(start.status, 200);
      const { state } = await start.json();
      const complete = await external.invoke('google-auth/complete', user.id, { state, verifier, code: `sim-code-${user.id}` });
      assert.equal(complete.status, 200);
      return state;
    }
    await check('OAuth PKCE completes once, stores encrypted credentials, and isolates accounts', async () => {
      const state = await connect(a);
      const connection = (await rows('drive_connections', a.id))[0];
      assert.ok(connection.refresh_token_encrypted && !connection.refresh_token_encrypted.includes(`sim-refresh-${a.id}`));
      const replay = await external.invoke('google-auth/complete', a.id, { state, verifier, code: `sim-code-${a.id}` });
      assert.equal(replay.status, 403);
      assert.ok((await client.from('drive_connections').select('refresh_token_encrypted')).error);
      assert.equal((await createClient(db, { userId: b.id }).from('drive_connections').select('account_email')).data.length, 0);
    }, 'simulated-external');
    await check('Drive folder listing includes more than nine folders across response pages', async () => {
      const response = await external.invoke('drive-folders', a.id, { parentId: `root-${a.id}` });
      assert.equal(response.status, 200);
      const result = await response.json();
      assert.equal(result.folders.length, 12);
    }, 'simulated-external');
    await check('OAuth rejects a wrong verifier and a different user without consuming the valid request', async () => {
      const start = await external.invoke('google-auth/start', a.id, { codeChallenge: challenge });
      const { state } = await start.json();
      assert.equal((await external.invoke('google-auth/complete', b.id, { state, verifier, code: `sim-code-${a.id}` })).status, 403);
      assert.equal((await external.invoke('google-auth/complete', a.id, { state, verifier: 'w'.repeat(64), code: `sim-code-${a.id}` })).status, 403);
      assert.equal((await external.invoke('google-auth/complete', a.id, { state, verifier, code: `sim-code-${a.id}` })).status, 200);
    }, 'simulated-external');
    const syncBody = { folderIds: [`root-${a.id}`], folderNames: ['GoodNotes'] };
    await check('Drive tree sync saves files once with their nested folder path', async () => {
      const response = await external.invoke('drive-sync', a.id, syncBody);
      assert.equal(response.status, 200);
      assert.equal((await response.json()).filesFound, 5);
      const driveNotes = (await rows('notes', a.id)).filter((note) => note.drive_file_id);
      assert.equal(driveNotes.length, 5);
      assert.equal(driveNotes.find((note) => note.drive_file_id === `pdf-0-${a.id}`).drive_folder_path.length, 3);
    }, 'simulated-external');
    await check('unchanged Drive sync is idempotent and preserves user classification', async () => {
      const note = (await rows('notes', a.id)).find((row) => row.drive_file_id === `pdf-0-${a.id}`);
      await app.lib('my-notes-storage').updateNoteClassification(note.id, 'course', a.courses[0].id, a.courses[0].name);
      assert.equal((await external.invoke('drive-sync', a.id, syncBody)).status, 200);
      const updated = (await rows('notes', a.id)).find((row) => row.id === note.id);
      assert.equal(updated.version, note.version);
      assert.equal(updated.linked_id, a.courses[0].id);
    }, 'simulated-external');
    await check('modified Drive PDF replaces the same note and increments its version once', async () => {
      const file = external.state.trees.get(a.id).get(`pdf-0-${a.id}`);
      const before = (await rows('notes', a.id)).find((row) => row.drive_file_id === file.id);
      file.modifiedTime = '2026-09-29T12:00:00Z';
      assert.equal((await external.invoke('drive-sync', a.id, syncBody)).status, 200);
      const after = (await rows('notes', a.id)).find((row) => row.drive_file_id === file.id);
      assert.equal(after.id, before.id);
      assert.equal(after.version, before.version + 1);
    }, 'simulated-external');
    await check('PDF opening returns valid PDF bytes; invalid IDs, unauthenticated access and non-PDFs fail', async () => {
      const good = await external.invoke('drive-file', a.id, { fileId: `pdf-0-${a.id}` });
      assert.equal(good.status, 200);
      assert.equal(good.headers.get('content-type'), 'application/pdf');
      assert.equal(new TextDecoder().decode((await good.arrayBuffer()).slice(0, 5)), '%PDF-');
      assert.equal((await external.invoke('drive-file', null, { fileId: `pdf-0-${a.id}` })).status, 401);
      assert.equal((await external.invoke('drive-file', a.id, { fileId: "../bad'" })).status, 400);
      assert.equal((await external.invoke('drive-file', a.id, { fileId: `root-${a.id}` })).status, 415);
    }, 'simulated-external');
    await check('concurrent Drive sync requests produce one version increment and no duplicate note', async () => {
      const file = external.state.trees.get(a.id).get(`pdf-2-${a.id}`);
      const before = (await rows('notes', a.id)).find((note) => note.drive_file_id === file.id);
      file.modifiedTime = '2026-09-29T13:30:00Z';
      const responses = await Promise.all([external.invoke('drive-sync', a.id, syncBody), external.invoke('drive-sync', a.id, syncBody)]);
      assert.ok(responses.every((response) => response.status === 200));
      const after = (await rows('notes', a.id)).filter((note) => note.drive_file_id === file.id);
      assert.equal(after.length, 1);
      assert.equal(after[0].version, before.version + 1);
    }, 'simulated-external');
    await check('Drive watch registration and authenticated webhook apply changes', async () => {
      assert.equal((await external.invoke('drive-watch', a.id)).status, 200);
      const connection = (await rows('drive_connections', a.id))[0];
      const file = external.state.trees.get(a.id).get(`pdf-1-${a.id}`);
      file.modifiedTime = '2026-09-29T13:00:00Z';
      external.state.changes.set(a.id, [{ ...file, bytes: undefined }]);
      const headers = { 'X-Goog-Channel-ID': connection.channel_id, 'X-Goog-Resource-State': 'change', 'X-Goog-Channel-Token': external.env.GOOGLE_DRIVE_WEBHOOK_TOKEN };
      assert.equal((await external.invoke('drive-webhook', null, {}, { headers: { ...headers, 'X-Goog-Channel-Token': 'wrong' } })).status, 403);
      assert.equal((await external.invoke('drive-webhook', null, {}, { headers })).status, 200);
      assert.equal((await rows('drive_connections', a.id))[0].page_token, 'cursor-2');
      assert.equal(Date.parse((await rows('notes', a.id)).find((row) => row.drive_file_id === file.id).drive_modified_time), Date.parse(file.modifiedTime));
    }, 'simulated-external');
    await check('failed DB writes do not acknowledge manual sync success or advance the webhook cursor', async () => {
      const file = external.state.trees.get(a.id).get(`pdf-3-${a.id}`);
      file.modifiedTime = '2026-09-29T14:00:00Z';
      external.state.changes.set(a.id, [{ ...file, bytes: undefined }]);
      await admin.from('drive_connections').update({ page_token: 'cursor-retry' }).eq('user_id', a.id);
      const connection = (await rows('drive_connections', a.id))[0];
      const headers = { 'X-Goog-Channel-ID': connection.channel_id, 'X-Goog-Resource-State': 'change', 'X-Goog-Channel-Token': external.env.GOOGLE_DRIVE_WEBHOOK_TOKEN };
      await db.exec(`create function simulation.fail_note_write() returns trigger language plpgsql as $$ begin raise exception 'simulated database write failure'; end $$;
        create trigger simulation_fail_note before update on public.notes for each row execute function simulation.fail_note_write();`);
      try {
        assert.equal((await external.invoke('drive-sync', a.id, syncBody)).status, 502);
        assert.equal((await external.invoke('drive-webhook', null, {}, { headers })).status, 200);
        assert.equal((await rows('drive_connections', a.id))[0].page_token, 'cursor-retry');
      } finally {
        await db.exec('drop trigger simulation_fail_note on public.notes; drop function simulation.fail_note_write();');
      }
      assert.equal((await external.invoke('drive-webhook', null, {}, { headers })).status, 200);
      assert.equal((await rows('drive_connections', a.id))[0].page_token, 'cursor-2');
      assert.equal(Date.parse((await rows('notes', a.id)).find((note) => note.drive_file_id === file.id).drive_modified_time), Date.parse(file.modifiedTime));
    }, 'simulated-external');
    await check('expired authorization fails visibly and reconnect resets old folder/cursor state', async () => {
      external.state.expired.add(a.id);
      assert.equal((await external.invoke('drive-sync', a.id, syncBody)).status, 502);
      await connect(a);
      const connection = (await rows('drive_connections', a.id))[0];
      assert.deepEqual(connection.folder_ids, []);
      assert.equal(connection.page_token, null);
      assert.equal((await external.invoke('drive-sync', a.id, syncBody)).status, 200);
    }, 'simulated-external');
    await check('disconnect rejects GET and removes only the connection on POST, preserving notes', async () => {
      assert.equal((await external.invoke('drive-disconnect', a.id, {}, { method: 'GET' })).status, 405);
      const count = (await rows('notes', a.id)).length;
      assert.equal((await external.invoke('drive-disconnect', a.id)).status, 200);
      assert.equal((await rows('drive_connections', a.id)).length, 0);
      assert.equal((await rows('notes', a.id)).length, count);
      await connect(a);
    }, 'simulated-external');
    const upload = async (user, subjectId, bytes = pdf, mime = 'application/pdf') => {
      const data = new FormData();
      data.set('subjectId', subjectId);
      data.set('file', new File([bytes], 'problems.pdf', { type: mime }));
      return external.invoke('problem-bank-upload', user.id, data);
    };
    await check('real PDF upload parses and stores extracted labels without duplication', async () => {
      const first = await upload(a, a.subjectId);
      assert.equal(first.status, 200);
      assert.equal((await first.json()).addedCount, 3);
      const second = await upload(a, a.subjectId);
      assert.equal(second.status, 200);
      assert.equal((await second.json()).addedCount, 0);
    }, 'simulated-external');
    await check('problem upload rejects foreign subjects, non-PDF payloads and releases failed jobs', async () => {
      assert.equal((await upload(b, a.subjectId)).status, 404);
      assert.equal((await upload(b, b.subjectId, new TextEncoder().encode('not a pdf'))).status, 415);
      assert.ok((await rows('problem_bank_upload_jobs', b.id)).every((job) => job.finished));
    }, 'simulated-external');
    await check('malformed model output does not insert problems or retain an active lease', async () => {
      external.state.geminiMode = 'malformed';
      const count = (await rows('problem_bank_problems', b.id)).length;
      try { assert.equal((await upload(b, b.subjectId)).status, 500); }
      finally { external.state.geminiMode = 'ok'; }
      assert.equal((await rows('problem_bank_problems', b.id)).length, count);
      assert.ok((await rows('problem_bank_upload_jobs', b.id)).every((job) => job.finished));
    }, 'simulated-external');
    await check('browser-only grades/specs/community/notifications use current code and remain account-isolated', async () => {
      for (const [index, browser] of browsers.entries()) {
        const user = users[index];
        const records = browser.lib('record-storage');
        records.saveGradeRecords([{ id: `grade-${index}`, term: '2026-2', courseId: user.courses[0].id, courseType: 'major', courseName: user.courses[0].name, credits: 3,
          grade: 'A0', score: '92', memo: 'simulation', createdAt: now, updatedAt: now }]);
        const personal = browser.lib('personal-study-storage');
        const stopListening = browser.lib('p0-sync').startP0SyncListener();
        const completed = personal.completePersonalStudy(`personal-${index}`);
        assert.ok(records.addCompletedPersonalStudySpec(completed));
        assert.equal(records.addCompletedPersonalStudySpec(completed), false);
        assert.equal(records.getSpecRecords()[0].category, 'certificate');
        const community = browser.lib('community-storage');
        const postId = `post-${index}`;
        community.publishCommunityPost({ id: postId, title: '가상 질문', content: '정규화 질문입니다.', authorId: user.id, authorName: user.name, category: '질문', courseId: user.courses[0].id, createdAt: now });
        community.addPostComment({ id: `comment-${index}`, postId, authorName: user.name, content: '가상 답변', createdAt: now });
        community.togglePostLike(postId, user.id);
        assert.equal(community.getCommunitySnapshot().posts[0].commentCount, 1);
        browser.lib('notification-settings').saveNotificationSettings({ community: true, deadline: true });
        const notifications = browser.lib('notification-storage');
        notifications.upsertAppNotification({ id: `notice-${index}`, type: 'deadline', title: '목표 기한', body: '3일 남음', href: '/study', read: false, createdAt: now });
        notifications.markAppNotificationRead(`notice-${index}`);
        assert.equal(notifications.getAppNotifications()[0].read, true);
        await browser.lib('p0-sync').flushP0Changes();
        stopListening();
        await browser.lib('p0-sync').initializeP0Account(user.id);
        assert.equal(personal.getPersonalStudies().find((study) => study.id === `personal-${index}`).status, 'completed');
        assert.equal(community.getCommunitySnapshot().posts.length, 1);
      }
    }, 'browser-local-only');
    await check('service-only quotas and tokens cannot be read by a student', async () => {
      assert.ok((await client.from('oauth_states').select('*')).error);
      assert.ok((await client.rpc('reserve_problem_bank_upload', { p_user_id: a.id })).error);
      const attempts = await Promise.all(Array.from({ length: 3 }, () => admin.rpc('reserve_problem_bank_upload', { p_user_id: users.at(-1).id })));
      assert.equal(attempts.filter((result) => result.data).length, 1);
      await admin.from('problem_bank_upload_jobs').update({ finished: true }).eq('user_id', users.at(-1).id);
    });
    for (let index = 0; index < users.length; index++) {
      await db.query('insert into simulation.browser_snapshots(user_id,data) values ($1,$2)', [users[index].id, JSON.stringify(browsers[index].window.localStorage.snapshot())]);
    }
    report.counts = {};
    for (const table of ['courses', 'course_schedules', 'learning_goals', 'goal_topics', 'course_sessions', 'course_session_topics', 'calendar_events', 'recurring_commitments',
      'study_plans', 'study_plan_items', 'study_sessions', 'notes', 'drive_connections', 'problem_bank_subjects', 'problem_bank_problems']) {
      report.counts[table] = Number((await db.query(`select count(*) as count from public."${table}"`)).rows[0].count);
    }
    report.users = users.map(({ id, name, email, persona, courses }) => ({ id, name, email, persona, courses: courses.length, auth: 'synthetic session; not a live Supabase login' }));
    report.externalRequests = external.state.calls.length;
    report.expectedErrorLogs = external.state.logs;
    report.failed = report.scenarios.filter((scenario) => scenario.status === 'failed').length;
    report.passed = report.scenarios.length - report.failed;
    for (const scenario of report.scenarios) await db.query('insert into simulation.results(name,status,details) values ($1,$2,$3)', [scenario.name, scenario.status, JSON.stringify({ mode: scenario.mode, ...scenario.details })]);
    return { report, pdf, files };
  } finally {
    for (const browser of browsers) browser.lib('p0-sync').stopP0Sync();
    await db.close();
  }
}

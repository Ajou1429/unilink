import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { parseCommands } from '../supabase/functions/_shared/chatCommands.ts';
import { createDatabase, createClient, moduleLoader, root } from '../scripts/simulation/runtime.mjs';

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const oldError = '과목 분석 응답을 검증하지 못했습니다. (source: invalid_response)';
const pdfOpenError = 'PDF를 열 수 없습니다. 파일이 손상됐는지 확인하거나 원본을 PDF로 다시 내보내 주세요.';
const badJsonError = 'AI가 반환한 분석 결과의 형식을 읽을 수 없습니다. 분석을 다시 시도해 주세요.';
const pageError = 'AI가 분석한 근거의 페이지 번호가 분석 대상 범위를 벗어났습니다. 분석을 다시 시도해 주세요.';
const named = (message, pages = '') => `fixture.pdf${pages ? ` · ${pages}` : ''}: ${message}`;
async function pdfBytes(count) {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < count; i++) pdf.addPage().drawText('Deadlock: resource allocation and wait cycle');
  return pdf.save();
}

test('course preparation failures with actual Edge handler, PDF parser and SQL task state', async t => {
  const { db } = await createDatabase();
  try {
    const user = id(9600);
    await db.query('insert into auth.users(id) values($1)', [user]);
    const goodPdf = await pdfBytes(1);
    const longPdf = await pdfBytes(51);
    const slicedPdf = await pdfBytes(11);
    const corruptPdf = new TextEncoder().encode('%PDF-1.7\ntruncated fixture');
    const encrypted = await PDFDocument.create();
    encrypted.addPage();
    encrypted.context.trailerInfo.Encrypt = encrypted.context.register(encrypted.context.obj({ Filter: 'Standard' }));
    const encryptedPdf = await encrypted.save({ useObjectStreams: false });
    const pending = [];
    const diagnostics = [];
    const files = new Map();
    const modelCalls = [];
    let handler;
    let goalSequence = 9700;
    let sourceReads = 0;
    let provider = 'valid';
    let drive = 'denied';
    let saveFailed = false;
    const admin = createClient(db, { admin: true });
    const realRpc = admin.rpc;
    admin.rpc = async (name, args) => {
      if (name === 'publish_course_knowledge_task' && saveFailed) return { data: null, error: { message: 'private database error' } };
      if (name !== 'claim_course_knowledge_task') return realRpc(name, args);
      try {
        const { rows } = await db.query('select * from claim_course_knowledge_task($1,$2,$3,$4)',
          [args.p_user, args.p_goal, JSON.stringify(args.p_task), args.p_retry]);
        return { data: rows[0], error: null };
      } catch (error) { return { data: null, error: { message: error.message } }; }
    };
    admin.storage = { from(bucket) {
      assert.equal(bucket, 'note-files');
      return { async download(key) {
        sourceReads++;
        const bytes = files.get(key);
        return bytes ? { data: new Blob([bytes]), error: null } : { data: null, error: { message: 'missing fixture' } };
      } };
    } };
    // Simulate the Google transport only; the application still validates source metadata.
    const realFrom = admin.from;
    admin.from = name => name === 'drive_connections'
      ? { select: () => ({ eq: () => ({ single: async () => ({ data: { refresh_token_encrypted: 'fixture', refresh_token_iv: 'fixture' }, error: null }) }) }) }
      : realFrom(name);
    const env = { COURSE_KNOWLEDGE_ENABLED: 'true', COURSE_RESEARCH_ENABLED: 'false', COURSE_KNOWLEDGE_MODEL: 'mock-pdf', OPENAI_API_KEY: 'mock-only' };
    const load = moduleLoader({ AbortController, console: { error: (label, fields) => diagnostics.push({ label, ...fields }) },
      Deno: { env: { get: key => env[key] }, serve: fn => { handler = fn; } },
      EdgeRuntime: { waitUntil: promise => pending.push(promise) },
      fetch: async (url, options) => {
        assert.equal(url, 'https://api.openai.com/v1/responses');
        const body = JSON.parse(options.body);
        if (body.text.format.name === 'course_note_analysis') {
          const page = Number(body.input[0].content[0].text.match(/through (\d+)/)[1]);
          const file = body.input[0].content[1].file_data;
          assert.equal((await PDFDocument.load(Buffer.from(file.split(',')[1],'base64'))).getPageCount(),page);
          const result = { summary:'Lecture fixture', candidates:[{kind:'topic',title:'Deadlock',description:'',exam_scope:'',date_text:'',page,quote:'wait cycle'}] };
          return Response.json({status:'completed',usage:{input_tokens:2,output_tokens:1},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(result)}]}]});
        }
        const count = Number(body.input[0].content[0].text.match(/submitted physical pages 1-(\d+)/)[1]);
        modelCalls.push(count);
        if (provider === 'http_error') return new Response('', { status: 503 });
        if (provider === 'rate_limited') return new Response('', { status: 429 });
        if (provider === 'empty_body') return new Response(null);
        if (provider === 'bad_envelope') return new Response('<html>private upstream detail</html>');
        if (provider === 'oversized') return new Response('x'.repeat(262145));
        const wrongPage = provider === 'out_of_slice' && count === 1;
        const readable = provider !== 'unreadable';
        const data = { summary: readable ? 'Deadlock principles' : '', readable, uncertainty: '', syllabus: [], units: [],
          sections: readable ? [{ kind: 'lecture', page_start: 1, page_end: wrongPage ? 2 : count, quote: 'wait cycle' }] : [] };
        const output = provider === 'bad_json' ? '{' : JSON.stringify(data);
        return Response.json({ status: ['incomplete', 'output_limited'].includes(provider) ? 'incomplete' : 'completed',
          ...(provider === 'output_limited' ? { incomplete_details: { reason: 'max_output_tokens' } } : {}),
          output: [{ type: 'message', content: [{ type: 'output_text', text: output }] }] });
      },
    }, name => {
      if (/supabaseAdmin\.ts$/.test(name)) return { getAdminClient: () => admin, getUserFromAuthHeader: async () => ({ id: user }) };
      if (name === './crypto.ts') return { decryptSecret: async () => 'mock-only' };
      if (name === './google.ts') return { refreshAccessToken: async () => ({ access_token: 'mock-only' }), driveFetch: async (_token, url) => {
        sourceReads++;
        if (drive === 'denied') throw new Error('Drive API fixture rejected access');
        if (url.endsWith('alt=media')) return new Response(goodPdf);
        return Response.json({ mimeType: drive === 'not_pdf' ? 'text/plain' : 'application/pdf',
          size: drive === 'oversized' ? 21 * 1024 * 1024 : goodPdf.length, modifiedTime: drive === 'ready' ? '2026-11-18T08:00:00Z' : '2026-11-18T12:00:00Z' });
      } };
      if (name === 'npm:pdf-lib@1.17.1') return { PDFDocument: {
        load: (...args) => PDFDocument.load(...args), create: async () => {
          const doc = await PDFDocument.create();
          const copy = doc.copyPages.bind(doc);
          doc.copyPages = (source, indices) => copy(source, Array.from(indices));
          return doc;
        },
      } };
    });
    load(path.join(root, 'supabase/functions/course-knowledge/index.ts'));

    async function fixture(sources) {
      provider = 'valid';
      drive = 'denied';
      saveFailed = false;
      const goal = id(goalSequence++);
      await db.query("insert into learning_goals(id,user_id,goal_type,title) values($1,$2,'personal','Operating systems')", [goal, user]);
      const notes = [];
      for (const source of sources) {
        const note = id(goalSequence++);
        const key = `${user}/${note}.pdf`;
        if (source.bytes) files.set(key, source.bytes);
        await db.query(`insert into notes(id,user_id,title,file_name,file_path,linked_type,linked_id,drive_file_id,drive_modified_time)
          values($1,$2,$3,$4,$5,'personal',$6,$7,$8)`,
        [note, user, source.title ?? 'Stored lecture', source.fileName ?? 'fixture.pdf', source.drive ? null : key, goal,
          source.drive ? `fixture-drive-${note}` : null, source.drive ? '2026-11-18T08:00:00Z' : null]);
        notes.push({ note, key });
      }
      const invoke = async extra => {
        const response = await handler(new Request('https://local.test/course-knowledge', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ goal_id: goal, as_of: '2026-11-18', consent: true, ...extra }) }));
        const body = await response.json();
        await Promise.all(pending.splice(0));
        assert.ok(response.ok, JSON.stringify(body));
        return body;
      };
      const status = () => invoke({ action: 'status' });
      const tasks = async () => (await db.query('select id,kind,note_id,page_start,status,payload from course_knowledge_tasks where goal_id=$1 order by created_at', [goal])).rows;
      return { goal, notes, invoke, status, tasks };
    }

    await t.test('stored PDFs process independently of upload; ready results are reused', async () => {
      const f = await fixture([{ bytes: goodPdf }]);
      const modelBefore = modelCalls.length;
      await f.invoke(); await f.invoke();
      assert.equal((await f.status()).status, 'ready');
      const reads = sourceReads;
      assert.equal((await f.invoke({ consent: false })).status, 'ready');
      assert.equal(sourceReads, reads);
      assert.equal(modelCalls.length - modelBefore, 1);
    });

    await t.test('multiple selected Drive PDFs reuse per-file analysis, not unselected files', async () => {
      const f = await fixture([{ drive: true, title: '06장' }, { drive: true, title: '07장' }, { bytes: corruptPdf, title: 'Unselected' }]);
      const scope = { material_note_ids: f.notes.slice(0,2).map(row => row.note) };
      drive = 'ready';
      const calls = modelCalls.length;
      assert.equal((await f.invoke({...scope, consent:false})).status,'consent_required');
      assert.equal(modelCalls.length,calls);
      for (let i=0;i<4;i++) await f.invoke(scope);
      const reads = sourceReads;
      const result = await f.invoke({...scope, consent:false});
      assert.equal(result.status,'ready');
      assert.deepEqual(result.material_note_ids,scope.material_note_ids);
      assert.deepEqual(Array.from(result.knowledge.content, item=>item.note_id).sort(),[...scope.material_note_ids].sort());
      assert.equal(sourceReads,reads);
      assert.equal(modelCalls.length,calls+2);
    });

    await t.test('one broken PDF in the same goal blocks a healthy prepared PDF', async () => {
      const f = await fixture([{ bytes: goodPdf, title: 'Deadlock lecture' }, { bytes: corruptPdf, fileName: 'other.pdf' }]);
      const modelBefore = modelCalls.length;
      await f.invoke(); await f.invoke(); await f.invoke();
      const status = await f.status();
      assert.equal(status.status, 'failed');
      assert.equal(status.pdf_ready, 1);
      assert.equal(status.pdf_count, 2);
      assert.equal(status.failed_steps[0].kind, 'index');
      assert.equal(status.failed_steps[0].message, `other.pdf: ${pdfOpenError}`);
      const failed = (await f.tasks()).find(row => row.status === 'failed');
      assert.equal(failed.note_id, f.notes[1].note);
      assert.equal(modelCalls.length - modelBefore, 1);
      const scoped = await f.invoke({ material_note_id: f.notes[0].note });
      assert.equal(scoped.status, 'ready');
      assert.equal(scoped.pdf_count, 1);
      assert.equal(scoped.material_note_id, f.notes[0].note);
      assert.equal((await f.invoke({ retry: true, retry_task_id: id(9999) })).status, 'failed');

      files.set(f.notes[1].key, goodPdf);
      const reads = sourceReads;
      assert.equal((await f.invoke({ retry: false })).status, 'failed');
      assert.equal(sourceReads, reads, 'a normal request does not attempt the repaired source');
      await f.invoke({ retry: true, retry_task_id: failed.id }); await f.invoke();
      assert.equal((await f.status()).status, 'ready');
      const tasks = await f.tasks();
      assert.equal(tasks.find(row => row.id === failed.id).status, 'ready');
      assert.equal(modelCalls.length - modelBefore, 2, 'the already ready PDF is not reanalyzed');
    });

    await t.test('Drive transport failure is distinguished from a broken PDF without reaching the model', async () => {
      const f = await fixture([{ drive: true }]);
      const modelBefore = modelCalls.length;
      await f.invoke();
      const message = (await f.status()).failed_steps[0].message;
      assert.equal(message, named('Drive PDF 원본에 접근하지 못했습니다. Drive 연결과 원본 파일의 열람 권한을 확인해 주세요.'));
      assert.ok(!message.includes('Drive API fixture rejected access'));
      assert.equal(modelCalls.length, modelBefore);
      assert.equal(diagnostics.at(-1).kind, 'index');
      assert.equal(diagnostics.at(-1).stage, 'source_read');
    });

    await t.test('a 51-page lecture reaches and persists the final page', async () => {
      const f = await fixture([{ bytes: longPdf }]);
      await f.invoke();
      await db.query("update course_knowledge_tasks set status='failed', error_message='PDF는 1~50페이지까지 분석할 수 있습니다.' where goal_id=$1 and kind='index'",[f.goal]);
      const before = modelCalls.length;
      for (let i=0;i<7;i++) await f.invoke();
      const state = await f.status();
      assert.equal(state.status,'ready');
      assert.deepEqual(modelCalls.slice(before),[10,10,10,10,10,1]);
      const tasks = await f.tasks();
      assert.ok(tasks.some(row=>row.kind==='overview'&&row.page_start===51&&row.status==='ready'));
    });

    for (const [name, source, message] of [
      ['missing Storage PDF', {}, 'PDF를 불러오지 못했습니다.'],
      ['plain non-PDF bytes', { bytes: new TextEncoder().encode('not a PDF') }, '유효한 PDF 파일이 필요합니다.'],
      ['encrypted PDF', { bytes: encryptedPdf }, '암호화된 PDF는 분석할 수 없습니다. 암호가 없는 원본 PDF를 사용해 주세요.'],
      ['modified Drive PDF', { drive: 'changed' }, 'Drive 자료가 변경되었습니다. Drive 변경 반영 후 다시 분석해 주세요.'],
      ['non-PDF Drive file', { drive: 'not_pdf' }, 'Drive 원본이 PDF 형식이 아닙니다.'],
      ['oversized Drive PDF', { drive: 'oversized' }, 'PDF는 20MB 이하만 분석할 수 있습니다.'],
    ]) {
      await t.test(`${name} returns a distinct error`, async () => {
        const f = await fixture([source]);
        drive = source.drive ?? 'denied';
        const modelBefore = modelCalls.length;
        await f.invoke();
        assert.equal((await f.status()).failed_steps[0].message, named(message));
        assert.equal(modelCalls.length, modelBefore);
      });
    }

    for (const [name, mode, bytes, message] of [
      ['invalid model JSON', 'bad_json', goodPdf, badJsonError],
      ['page outside the transmitted slice', 'out_of_slice', slicedPdf, pageError],
      ['invalid upstream body', 'bad_envelope', goodPdf, 'AI 서비스 응답 형식이 올바르지 않습니다. 잠시 후 분석을 다시 시도해 주세요.'],
      ['empty upstream body', 'empty_body', goodPdf, 'AI 서비스에서 빈 응답을 받았습니다. 잠시 후 다시 시도해 주세요.'],
      ['oversized upstream body', 'oversized', goodPdf, 'AI 분석 응답이 너무 커 처리하지 못했습니다. 분석 범위를 줄여 다시 시도해 주세요.'],
      ['provider HTTP failure', 'http_error', goodPdf, 'AI 분석 요청에 실패했습니다. 모델의 PDF·검색 지원과 API 설정을 확인해 주세요.'],
      ['provider rate limit', 'rate_limited', goodPdf, 'AI 서비스의 요청 제한 또는 사용량 한도에 도달했습니다. 잠시 후 다시 시도하거나 사용량을 확인해 주세요.'],
      ['incomplete provider output', 'incomplete', goodPdf, 'AI 분석이 완료되지 않았습니다. 다시 시도해 주세요.'],
      ['provider output limited', 'output_limited', goodPdf, 'AI 분석 결과가 출력 한도에 도달해 중단됐습니다. 분석 범위를 줄여 다시 시도해 주세요.'],
    ]) {
      await t.test(name, async () => {
        const f = await fixture([{ bytes }]);
        provider = mode;
        const modelBefore = modelCalls.length;
        await f.invoke(); await f.invoke();
        if (mode === 'out_of_slice') await f.invoke();
        const status = await f.status();
        assert.equal(status.failed_steps[0].message, named(message, mode === 'out_of_slice' ? '11쪽' : '1쪽'));
        assert.equal(status.failed_steps[0].kind, 'overview');
        assert.equal(modelCalls.length - modelBefore, mode === 'out_of_slice' ? 2 : 1);
        if (mode === 'out_of_slice') assert.equal((await f.tasks()).find(row => row.status === 'failed').page_start, 11);
        if (mode === 'bad_json') {
          for (let i = 0; i < 2; i++) await f.invoke({ retry: true });
          assert.equal(modelCalls.length - modelBefore, 3, 'each retry request repeats a permanently invalid result');
          const exhausted = await f.status();
          assert.equal(exhausted.status, 'failed');
          assert.equal(exhausted.failed_steps[0].retryable, false);
          assert.match(exhausted.failed_steps[0].message, /재시도 한도/);
          await f.invoke({ retry: true, retry_task_id: exhausted.failed_steps[0].id });
          assert.equal(modelCalls.length - modelBefore, 3);
        }
      });
    }

    await t.test('page 1 in the second slice is persisted as original page 11', async () => {
      const f = await fixture([{ bytes: slicedPdf }]);
      await f.invoke(); await f.invoke(); await f.invoke();
      const status = await f.status();
      assert.equal(status.status, 'ready');
      assert.equal((await f.tasks()).find(record => record.page_start === 11).payload.extraction.sections[0].page_start, 11);
    });

    await t.test('DB write failure is labelled separately and does not reveal database details', async () => {
      const f = await fixture([{ bytes: goodPdf }]);
      saveFailed = true;
      await f.invoke();
      assert.equal((await f.status()).failed_steps[0].message, named('분석 중 자료가 변경되었거나 저장하지 못했습니다. 다시 시도해 주세요.'));
      assert.equal(diagnostics.at(-1).stage, 'save');
    });

    await t.test('legacy failures with no classified cause retain the filename without guessing the reason', async () => {
      const f = await fixture([{ bytes: corruptPdf }]);
      await f.invoke();
      const [task] = await f.tasks();
      await db.query('update course_knowledge_tasks set error_message=$1 where id=$2', [oldError, task.id]);
      assert.equal((await f.status()).failed_steps[0].message,
        named('이전 분석 기록에는 실패 원인이 구분되어 있지 않습니다. 코칭 화면의 분석 이어가기로 해당 자료를 다시 확인해 주세요.'));
    });

    await t.test('unreadable content flag is accepted with an explicit warning, not invalid_response', async () => {
      const f = await fixture([{ bytes: goodPdf }]);
      provider = 'unreadable';
      await f.invoke(); await f.invoke();
      const status = await f.status();
      assert.equal(status.status, 'ready');
      assert.equal(status.failed_steps.length, 0);
      assert.match(status.warnings.join(' '), /Unreadable PDF/);
    });

    await t.test('explicit chat retry reclaims one failed step, scopes the PDF and preserves the time window', async () => {
      const f = await fixture([{ bytes: goodPdf }, { bytes: corruptPdf, fileName: 'unrelated.pdf' }]);
      provider = 'bad_json';
      const requests = [];
      const proposals = [];
      let approvals = 0;
      const browser = {
        auth: { getUser: async () => ({ data: { user: { id: user } } }) },
        from: () => {
          const query = { select: () => query, eq: () => query, in: async () => ({ data: [{ id: f.goal, title: 'Operating systems' }], error: null }) };
          return query;
        },
        functions: { invoke: async (name, { body }) => {
          requests.push({ name, ...body });
          if (name === 'course-knowledge') return { data: await f.invoke(body), error: null };
          assert.equal(name, 'coaching-propose');
          proposals.push(body);
          return { data: { schema_version: 2, proposal_run_id: 'test-run', persisted: false, material_note_id: body.material_note_id,
            proposal: { summary: 'Deadlock review', items: [{ title: 'Explain a wait cycle' }] } }, error: null };
        } },
        rpc: async () => { approvals++; return { data: 'test-plan', error: null }; },
      };
      const client = moduleLoader({ process: { env: { NEXT_PUBLIC_COURSE_KNOWLEDGE_ENABLED: 'true' } },
        setTimeout: fn => setImmediate(fn) }, name => {
        if (name === './supabase-client') return { getSupabaseBrowserClient: () => browser };
        if (name === './private-storage') return { getStorageUser: () => user, captureStorageScope: () => () => {} };
        if (name === './p0-sync') return { flushP0Changes: async () => {} };
      });
      const exec = client(path.join(root, 'src/lib/chat-command-executor.ts'));
      const notes = [{ id: f.notes[0].note, fileName: 'fixture.pdf', filePath: f.notes[0].key }];
      const command = parseCommands([{ kind: 'generate_plan', goal_id: f.goal, note_id: notes[0].id, intent: 'topic_review', date: '2026-11-18', period_end: '2026-11-18', start_time: '19:00', end_time: '22:00', minutes: 60 }], { courses: [], notes })[0];
      const prepare = () => exec.prepareChatCommand(command, { signedIn: true, userId: user, courses: [], goals: new Map() }, notes, '2026-11-18', () => {}, 'Review deadlock from 19:00 to 22:00 for 60 minutes');
      const first = (await prepare()).prepared;
      assert.equal(first.phase, 'plan_analysis');
      await assert.rejects(exec.executePreparedCommand(first, () => {}), error => error.message === named(badJsonError, '1쪽'));
      const calls = modelCalls.length;
      await assert.rejects(exec.executePreparedCommand(first, () => {}), error => error.message === named(badJsonError, '1쪽'));
      assert.equal(modelCalls.length, calls);
      assert.equal(requests.at(-1).retry, false);
      assert.equal(proposals.length, 0);
      await assert.rejects(exec.executePreparedCommand(first, () => {}, true), error => error.message === named(badJsonError, '1쪽'));
      assert.equal(modelCalls.length, calls + 1);
      const failed = (await f.tasks()).find(row => row.status === 'failed');
      assert.deepEqual(requests.filter(request => request.retry).map(request => request.retry_task_id), [failed.id]);
      provider = 'valid';
      const recovered = (await exec.executePreparedCommand(first, () => {}, true)).next;
      assert.equal(modelCalls.length, calls + 2);
      assert.equal(recovered.phase, 'approve_plan');
      assert.equal(proposals.length, 1);
      assert.equal(proposals[0].material_note_id, f.notes[0].note);
      assert.ok((await f.tasks()).every(row => row.note_id === f.notes[0].note));
      assert.deepEqual(JSON.parse(JSON.stringify(proposals[0].day_budgets)), [{ date: '2026-11-18', minutes: 60, windows: [{ start: '19:00', end: '22:00' }] }]);
      assert.equal(approvals, 0);
    });
    await t.test('standalone note analysis retains original page numbers across all slices', async () => {
      const f = await fixture([{ bytes: longPdf }]);
      env.NOTE_ANALYSIS_MODEL='mock-pdf';
      load(path.join(root, 'supabase/functions/note-analyze/index.ts'));
      const result=await handler(new Request('https://local.test/note-analyze',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({noteId:f.notes[0].note,consent:true})}));
      assert.equal(result.status,202);
      const {analysis_id}=await result.json();
      await Promise.all(pending.splice(0));
      const analysis=(await db.query('select status,page_count,usage_payload from note_analyses where id=$1',[analysis_id])).rows[0];
      assert.deepEqual(analysis,{status:'completed',page_count:51,usage_payload:{input_tokens:12,output_tokens:6}});
      const pages=(await db.query('select page from note_analysis_candidates where analysis_id=$1 order by page',[analysis_id])).rows.map(row=>row.page);
      assert.deepEqual(pages,[10,20,30,40,50,51]);
    });
  } finally { await db.close(); }
});

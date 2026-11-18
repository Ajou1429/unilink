import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchMaterialCourse, requestedChapters, requestedPlanChapters, selectChapterMaterials } from '../src/lib/chat-course-materials.ts';
import { matchesMaterialScope, parseMaterialScope } from '../supabase/functions/_shared/materialScope.ts';
import { mergePlanFollowup } from '../supabase/functions/_shared/chatCommands.ts';

const note = (id, title, linkedId = 'db', driveFileId = `drive-${id}`) => ({ id, title, linkedType: 'course', linkedId, driveFileId });
const courses = [{ id: 'db', name: '엔지니어링DB' }, { id: 'os', name: '운영체제' }];
const request = '엔디비 퀴즈 대비 강의노트 6,7,8장 분석하고 공부 계획 짜줘';
test('an explicit chapter correction replaces the previous range and survives a retry', () => {
  assert.deepEqual(requestedPlanChapters('강의자료 1~8장으로 계획 짜줘\n6,7,8장만 확인하라니까\n다시 진행\n07장 SQL.pdf'),[6,7,8]);
  assert.deepEqual(requestedPlanChapters('6,7,8장만 확인하라니까'),[6,7,8]);
});

test('resolves stored Drive chapters even when they are older than the latest 40 notes', () => {
  const db = matchMaterialCourse(courses, request);
  assert.equal(db?.id, 'db');
  const records = [...Array.from({ length: 42 }, (_, i) => note(`recent-${i}`, '6장', 'os')),
    note('image', 'image', 'db', ''), note('six', '06장 관계데이터연산_2026'), note('seven', '07장 데이터베이스 언어 SQL'), note('eight', '08장 데이터베이스설계_2026')];
  const selected = selectChapterMaterials(records, db.id, requestedChapters(request), request);
  assert.deepEqual(selected.map(group => group.candidates.map(n => n.id)), [['six'], ['seven'], ['eight']]);
  assert.deepEqual(requestedChapters('11월 27일 퀴즈 범위 6장~9장 (배운 곳까지)'), [6, 7, 8, 9]);
});

test('reports ambiguous chapters, resolves an explicitly named source and rejects unrelated candidates', () => {
  const records = [note('a', '07장 SQL 기본'), note('b', '07장 SQL 심화'), note('os', '6장 운영체제', 'os'), note('no-original', '08장 설계', 'db', '')];
  const [missing, ambiguous, unavailable] = selectChapterMaterials(records, 'db', [6, 7, 8], request);
  assert.deepEqual(missing.candidates, []);
  assert.deepEqual(ambiguous.candidates.map(n => n.id), ['a','b']);
  assert.equal(unavailable.unavailable, true);
  assert.deepEqual(selectChapterMaterials(records, 'db', [7], '07장 SQL 심화로 해줘')[0].candidates.map(n=>n.id), ['b']);
});

test('scoped responses require every requested note and reject invalid scope', () => {
  const ids = ['00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002'];
  const scope = parseMaterialScope(undefined,ids);
  assert.ok(scope);
  assert.equal(matchesMaterialScope(scope, {material_note_ids: [...ids].reverse()}), true);
  assert.equal(matchesMaterialScope(scope, {material_note_id: ids[0]}), false);
  assert.equal(parseMaterialScope(ids[0],ids), null);
  assert.equal(parseMaterialScope(undefined,[ids[0],ids[0]]), null);
});

test('a numbered file reply and a retry keep already supplied exam conditions', () => {
  const prior={kind:'generate_plan',course_id:'db',course_ids:[],goal_id:null,weekdays:[1,2,4,5],date:'2026-11-20',period_end:'2026-11-26',exam_scope:'6, 7, 8장',exam_at:'2026-11-27T10:30:00+09:00',priority:5,difficulty:null};
  const next={...prior,weekdays:[],date:null,exam_scope:null,exam_at:null,priority:null};
  assert.deepEqual(mergePlanFollowup(prior,next,'다시 진행해봐'),prior);
  const notes=[note('regular','07장 SQL 교재'),note('revised','07장 SQL 교재 (1)')];
  assert.equal(selectChapterMaterials(notes,'db',[7],`${request}\n아무거나\n(1)버전으로 해\n다시 진행해봐`)[0].candidates[0].id,'revised');
});

test('a named PDF is resolved without a model note id and never crosses course ownership', async () => {
  const { namedPlanMaterials } = await import('../src/lib/chat-course-materials.ts');
  const selected = { ...note('process', '2 - Program and Process', 'os'), fileName: '2 - Program and Process.pdf' };
  const other = { ...selected, id: 'foreign', linkedId: 'db' };
  const more = { ...note('scheduling', '3 - Scheduling Basics', 'os'), fileName: '3 - Scheduling Basics.pdf' };
  const request = '운영체제 「2 - Program and Process」 PDF 한 개만 참고해서 계획을 추천해줘';
  assert.deepEqual(namedPlanMaterials([selected, other, more], request, 'os').map(row => row.id), ['process']);
  assert.equal(namedPlanMaterials([more], request, 'os').length, 0);
  assert.equal(namedPlanMaterials([selected, { ...selected, id: 'copy' }], request, 'os').length, 2);
});

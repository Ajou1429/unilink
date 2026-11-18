import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchMaterialCourse, requestedChapters, selectChapterMaterials } from '../src/lib/chat-course-materials.ts';
import { matchesMaterialScope, parseMaterialScope } from '../supabase/functions/_shared/materialScope.ts';

const note = (id, title, linkedId = 'db', driveFileId = `drive-${id}`) => ({ id, title, linkedType: 'course', linkedId, driveFileId });
const courses = [{ id: 'db', name: '엔지니어링DB' }, { id: 'os', name: '운영체제' }];
const request = '엔디비 퀴즈 대비 강의노트 6,7,8장 분석하고 공부 계획 짜줘';

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

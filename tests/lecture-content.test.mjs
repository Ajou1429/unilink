import test from 'node:test';
import assert from 'node:assert/strict';
import { contentCovers, preferredLectureNotes, textContentSketch, parseContentProfile } from '../src/lib/lecture-content.ts';
import { createDatabase, createClient } from '../scripts/simulation/runtime.mjs';
import { createHash } from 'node:crypto';
function profile(text, complete = true) {
  const s = textContentSketch(text);
  return { version: 1, fileHash: createHash('sha256').update(text).digest('hex'), textHash: createHash('sha256').update(s.normalized).digest('hex'), characters: s.characters, unique: s.unique, samples: s.samples, complete };
}
const body = Array.from({ length: 700 }, (_, i) => `강의원문${createHash('sha256').update(String(i)).digest('hex').slice(0, 24)}`).join('\n');
const extra = Array.from({ length: 200 }, (_, i) => `추가설명${createHash('sha256').update(`extra${i}`).digest('hex').slice(0, 24)}`).join('\n');
const note = (id, text, course = 'course') => ({ id, linkedType: 'course', linkedId: course, createdAt: '2026-11-17', contentProfile: profile(text) });

test('prefer the detailed source despite file names; mere shared topics/prefixes are kept separately', () => {
  const base = profile(body), richer = profile(body + extra);
  assert.equal(contentCovers(richer, base), true); assert.equal(contentCovers(base, richer), false);
  assert.deepEqual(preferredLectureNotes([note('slides.pdf', body), note('student-notes.docx', body + extra)]).map(n => n.id), ['student-notes.docx']);
  assert.deepEqual(preferredLectureNotes([note('rich', body + extra), note('small', body)]).map(n => n.id), ['rich']);
  assert.equal(preferredLectureNotes([note('course1', body), note('course2', body + extra, 'other')]).length, 2);
  assert.equal(preferredLectureNotes([note('a', body.slice(0, 3000) + extra), note('b', body)]).length, 2);
  assert.equal(preferredLectureNotes([{ ...note('problem', body + extra), tags: ['문제은행'] }, note('notes', body)]).length, 2);
  assert.equal(contentCovers(profile(body + extra, false), base), false);
  assert.equal(contentCovers(profile('short'), profile('short with other details')), false);
  assert.equal(contentCovers(base, base), true);
  assert.equal(contentCovers({ ...base, fileHash: 'f'.repeat(64) }, base), false, 'equal extracted text cannot rank unseen handwriting or images');
  assert.equal(parseContentProfile({ ...base, samples: [NaN] }), null);
});

test('source-bound profiles preserve note metadata, isolate accounts and reject stale sources', async () => {
  const { db } = await createDatabase();
  const a = '00000000-0000-4000-8000-000000009501', b = '00000000-0000-4000-8000-000000009502';
  try {
    await db.query('insert into auth.users(id) values ($1),($2)', [a, b]);
    const n = (await db.query("insert into notes(user_id,title) values($1,'original') returning *", [a])).rows[0];
    const owner = createClient(db, { userId: a }), other = createClient(db, { userId: b });
    const args = { p_note: n.id, p_version: n.version, p_updated_at: n.updated_at.toISOString(), p_profile: profile(body) };
    assert.equal((await owner.rpc('save_note_content_profile', args)).error, null);
    assert.equal((await other.rpc('save_note_content_profile', args)).error.code, '42501');
    assert.equal((await owner.rpc('save_note_content_profile', { ...args, p_version: 0 })).error.code, '40001');
    const unchanged = (await db.query('select * from notes where id=$1', [n.id])).rows[0];
    assert.equal(unchanged.updated_at.toISOString(), n.updated_at.toISOString()); assert.equal(unchanged.version, n.version);
    assert.equal((await other.from('note_content_profiles').select('*')).data.length, 0);
    assert.equal((await createClient(db).rpc('save_note_content_profile', args)).error.code, '42501');
    await db.query('delete from notes where id=$1', [n.id]);
    assert.equal((await db.query('select count(*)::int n from note_content_profiles')).rows[0].n, 0);
  } finally { await db.close(); }
});

test('registration reuses the richer note on retry and preserves original sources and invalidates stale comparisons', async () => {
  const { moduleLoader, root } = await import('../scripts/simulation/runtime.mjs');
  const path = await import('node:path');
  const { db } = await createDatabase();
  const uid = '00000000-0000-4000-8000-000000009511';
  try {
    await db.query('insert into auth.users(id) values($1)', [uid]);
    const client = createClient(db, { userId: uid });
    const memoryStorage = () => {
      const values = new Map();
      return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
    };
    const window = new EventTarget();
    Object.assign(window, { localStorage: memoryStorage(), sessionStorage: memoryStorage() });
    const load = moduleLoader({ window }, name => {
      if (/(?:supabase-client|supabase\/client)(?:\.ts)?$/.test(name)) return { getSupabaseBrowserClient: () => client, getSupabaseClient: () => client, isSupabaseConfigured: true };
      if (name.endsWith('/extract')) return { detectKind: () => 'pdf', MAX_INTAKE_BYTES: 20971520, extractContent: async file => ({ text: await file.text(), kind: 'pdf' }) };
    });
    load(path.join(root, 'src/lib/private-storage.ts')).setStorageUser(uid);
    const service = load(path.join(root, 'src/lib/file-intake/lecture-registration.ts'));
    const notes = load(path.join(root, 'src/lib/my-notes-storage.ts'));
    const input = (title, text) => ({ title, courseName: '수업', linkedType: 'course', linkedId: 'course', source: '직접 작성', content: '', tags: ['강의자료'], file: new File(['%PDF-'+text], `${title}.pdf`, { type: 'application/pdf' }) });
    const first = await service.registerLecture(input('slides', body), () => {});
    const detailed = await service.registerLecture(input('detailed', body + extra), () => {});
    assert.notEqual(first.noteId, detailed.noteId);
    const again = await service.registerLecture(input('different-name', body), () => {});
    assert.equal(again.noteId, detailed.noteId); assert.equal(again.reused, true);
    assert.equal((await db.query('select count(*)::int n from notes')).rows[0].n, 2);
    const all = await notes.getMyNotes();
    assert.equal(all.length, 2); assert.deepEqual(Array.from(preferredLectureNotes(all), n => n.id), [detailed.noteId]);
    const rich = all.find(n => n.id === detailed.noteId);
    await db.query("update notes set version=version+1 where id=$1", [rich.id]);
    const changed = await notes.getMyNotes();
    assert.equal(changed.find(n => n.id === rich.id).contentProfile, undefined, 'old profiles cannot hide a changed source');
  } finally { await db.close(); }
});

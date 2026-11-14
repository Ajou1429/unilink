import test from 'node:test';
import assert from 'node:assert/strict';
import { sortCourseNotes } from '../src/lib/course-note-sort.ts';

const notes = [
  { id:'1', title:'강의 10', fileName:'x.PDF', updatedAt:'2026-11-14T00:00:00Z', driveModifiedTime:'2026-10-01T00:00:00Z' },
  { id:'2', title:'강의 2', fileName:'b.png', updatedAt:'2026-11-01T00:00:00Z' },
  { id:'3', title:'기타', updatedAt:'invalid' },
];
const ids = (key, direction) => sortCourseNotes(notes, key, direction).map(note => note.id);
test('course notes sort names naturally, directions and stable missing values', () => {
  assert.deepEqual(ids('name','asc'), ['2','1','3']);
  assert.deepEqual(ids('name','desc'), ['3','1','2']);
  assert.deepEqual(ids('modified','desc'), ['2','1','3']);
  assert.deepEqual(ids('modified','asc'), ['1','2','3']);
  assert.deepEqual(ids('type','asc'), ['1','2','3']);
  assert.deepEqual(ids('type','desc'), ['2','1','3']);
  assert.deepEqual(notes.map(note=>note.id), ['1','2','3']);
});

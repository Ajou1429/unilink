import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutTimedBlocks } from '../src/lib/timetable-overlap.ts';

test('classes, exams and commitments share lanes across transitive overlap groups', () => {
  const blocks = [{ id: 'class', start: 540, end: 660 }, { id: 'exam', start: 600, end: 690 }, { id: 'work', start: 645, end: 720 }, { id: 'next', start: 720, end: 780 }];
  const result = layoutTimedBlocks(blocks);
  for (const id of ['class', 'exam', 'work']) assert.equal(result.get(id).lanes, 3);
  assert.equal(result.get('next').width, 100);
  for (const a of blocks) for (const b of blocks) {
    if (a.id !== b.id && a.start < b.end && b.start < a.end) assert.notEqual(result.get(a.id).lane, result.get(b.id).lane);
  }
  assert.deepEqual([...layoutTimedBlocks(blocks.slice().reverse())], [...result]);
});
test('touching endpoints reuse lanes and invalid ranges do not consume space', () => {
  const result = layoutTimedBlocks([{ id: 'a', start: 0, end: 60 }, { id: 'b', start: 60, end: 120 }, { id: 'empty', start: 60, end: 60 }, { id: 'invalid', start: NaN, end: 100 }]);
  assert.equal(result.size, 2); assert.equal(result.get('a').width, 100); assert.equal(result.get('b').width, 100);
  assert.equal(layoutTimedBlocks([]).size, 0);
});

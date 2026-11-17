import { monthlyWorkEvents } from '../src/lib/monthly-work-events.ts';
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


test('monthly recurrence includes each slot and all-day date with an editable source ID', () => {
  const work = { id: 'repeat', title: '실험', days: ['월'], startTime: '09:00', endTime: '10:00', schedules: [{day:'월',startTime:'09:00',endTime:'10:00'},{day:'월',startTime:'15:00',endTime:'16:00'}] };
  const rows = monthlyWorkEvents([work, {...work,id:'all-day',allDay:true}], ['2026-11-16','2026-11-17','2026-11-23']);
  assert.equal(rows.length, 6);
  assert.equal(new Set(rows.map(row => row.id)).size, 6);
  assert.equal(rows.filter(row => row.workScheduleId === 'repeat').length, 4);
  assert.equal(rows.filter(row => row.allDay).length, 2);
  assert.equal(rows.some(row => row.date === '2026-11-17'), false);
});

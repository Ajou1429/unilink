import { test } from "node:test";
import assert from "node:assert/strict";
import { COURSE_TIME_OPTIONS, makeTimeOptions, nextSlotTimes, slotsOverlap, snapToOptions } from "../src/lib/time-options.ts";

test("course times run from 9 AM to 9 PM in 15-minute steps", () => {
  assert.equal(COURSE_TIME_OPTIONS[0], "09:00");
  assert.equal(COURSE_TIME_OPTIONS.at(-1), "21:00");
  assert.equal(COURSE_TIME_OPTIONS.length, 49);
  assert.deepEqual(COURSE_TIME_OPTIONS.slice(0, 5), ["09:00", "09:15", "09:30", "09:45", "10:00"]);
  assert.deepEqual(makeTimeOptions("23:30", "23:59", 15), ["23:30", "23:45"]);
});

test("typed times outside the list snap to the nearest allowed time", () => {
  assert.equal(snapToOptions("10:15", COURSE_TIME_OPTIONS), "10:15");
  assert.equal(snapToOptions("10:20", COURSE_TIME_OPTIONS), "10:15");
  assert.equal(snapToOptions("10:23", COURSE_TIME_OPTIONS), "10:30");
  assert.equal(snapToOptions("07:00", COURSE_TIME_OPTIONS), "09:00");
  assert.equal(snapToOptions("23:00", COURSE_TIME_OPTIONS), "21:00");
  assert.equal(snapToOptions("abc", COURSE_TIME_OPTIONS), "09:00");
});

test("a second class on the same day goes after the last one with the same length", () => {
  assert.deepEqual(nextSlotTimes([]), { startTime: "09:00", endTime: "10:15" });
  assert.deepEqual(nextSlotTimes([{ startTime: "10:00", endTime: "11:15" }]), { startTime: "11:30", endTime: "12:45" });
  assert.deepEqual(nextSlotTimes([{ startTime: "19:30", endTime: "20:45" }]), { startTime: "20:45", endTime: "21:00" }, "never past 9 PM");
});

test("two times of the same course may not overlap on the same day", () => {
  assert.equal(slotsOverlap([{ day: "금", startTime: "10:00", endTime: "11:15" }, { day: "금", startTime: "16:00", endTime: "17:15" }]), false);
  assert.equal(slotsOverlap([{ day: "금", startTime: "10:00", endTime: "11:15" }, { day: "금", startTime: "11:00", endTime: "12:00" }]), true);
  assert.equal(slotsOverlap([{ day: "수", startTime: "10:00", endTime: "11:15" }, { day: "금", startTime: "10:00", endTime: "11:15" }]), false);
  assert.equal(slotsOverlap([{ day: "금", startTime: "10:00", endTime: "11:00" }, { day: "금", startTime: "11:00", endTime: "12:00" }]), false, "back to back is fine");
});

test("'시간 동일': changing one day's time changes every day's first class; second classes keep their time", async () => {
  const { updateSlotTimes, alignFirstSlots, firstSlotIds } = await import("../src/lib/time-options.ts");
  const slots = [
    { id: 1, day: "수", startTime: "10:00", endTime: "11:15" },
    { id: 2, day: "금", startTime: "10:00", endTime: "11:15" },
    { id: 3, day: "금", startTime: "16:00", endTime: "17:15" },
    { id: 4, day: "월", startTime: "09:00", endTime: "10:15" },
  ];
  assert.deepEqual([...firstSlotIds(slots)].sort(), [1, 2, 4]);
  const synced = updateSlotTimes(slots, 1, { startTime: "13:00" }, true);
  assert.deepEqual(synced.map((s) => s.startTime), ["13:00", "13:00", "16:00", "13:00"]);
  const own = updateSlotTimes(slots, 3, { startTime: "18:00" }, true);
  assert.deepEqual(own.map((s) => s.startTime), ["10:00", "10:00", "18:00", "09:00"], "a second class changes alone");
  const off = updateSlotTimes(slots, 1, { startTime: "13:00" }, false);
  assert.deepEqual(off.map((s) => s.startTime), ["13:00", "10:00", "16:00", "09:00"]);
  const aligned = alignFirstSlots(slots, ["월", "화", "수", "목", "금", "토", "일"]);
  assert.deepEqual(aligned.map((s) => `${s.startTime}-${s.endTime}`), ["09:00-10:15", "09:00-10:15", "16:00-17:15", "09:00-10:15"], "turning it on copies the earliest weekday");
});

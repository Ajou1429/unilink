import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AJOU_TERM, parseAjouSchedule, prepareSection, schedulesOverlap, sectionToCourse, sameCatalogSubject, matchesCatalogSearch } from "../src/lib/ajou-catalog.ts";

const catalog = JSON.parse(readFileSync(new URL("../src/data/ajou-2026-2.json", import.meta.url), "utf8"));
const sections = catalog.courses.map(prepareSection);

test("the source snapshot retains every section with unique registration numbers", () => {
  assert.equal(sections.length, 1820);
  assert.equal(new Set(sections.map((s) => s.registrationNumber)).size, 1820);
  assert.equal(sections.filter((s) => !s.rawSchedule).length, 399);
  assert.equal(sections.filter((s) => !s.scheduleWarning).length, 1421);
  assert.deepEqual(sections.filter((s) => s.rawSchedule && s.scheduleWarning), []);
});

test("Ajou letter periods include evening classes", () => {
  const { schedules } = parseAjouSchedule("월A(팔409) 목H(팔410)");
  assert.deepEqual(schedules, [
    { day: "월", startTime: "09:00", endTime: "10:15", location: "팔409" },
    { day: "목", startTime: "19:30", endTime: "20:45", location: "팔410" },
  ]);
});

test("half periods, inherited weekdays, missing rooms and explicit times", () => {
  assert.deepEqual(parseAjouSchedule("목8.5 (산811) 9.5(산811) 10.5(산811)").schedules, [
    { day: "목", startTime: "16:30", endTime: "19:20", location: "산811" },
  ]);
  assert.equal(parseAjouSchedule("화19:30~22:00 (다B106)").schedules[0].endTime, "22:00");
  assert.equal(parseAjouSchedule("화16:30~18:00").schedules[0].location, "");
  assert.equal(parseAjouSchedule("수8.5(산825) 수9.5(산825) 수10.5").schedules.length, 2);
});

test("unrecognized, invalid and empty time data never produce a guessed schedule", () => {
  for (const raw of ["", "별도 운영", "월Z(101)", "월A(101) 확인필요", "월19:00~18:00", "월09:75~11:00", "월99(101)"]) {
    const parsed = parseAjouSchedule(raw);
    assert.ok(parsed.warning);
    assert.deepEqual(parsed.schedules, []);
  }
});

test("same-day multi-room sessions retain both rooms", () => {
  const parsed = parseAjouSchedule("수1(팔101) 수2(팔102)");
  assert.equal(parsed.schedules.length, 2);
  assert.equal(parsed.schedules[1].location, "팔102");
});

test("overlap checks include containment but permit adjacent periods and different days", () => {
  const slot = (day, startTime, endTime) => [{ day, startTime, endTime }];
  assert.ok(schedulesOverlap(slot("월", "09:00", "12:00"), slot("월", "10:30", "11:45")));
  assert.ok(!schedulesOverlap(slot("월", "09:00", "10:15"), slot("월", "10:15", "11:00")));
  assert.ok(!schedulesOverlap(slot("월", "09:00", "12:00"), slot("화", "09:00", "12:00")));
});

test("all timed sections convert to stable IDs with credits and original times intact", () => {
  for (const s of sections.filter((s) => !s.scheduleWarning)) {
    const c = sectionToCourse(s, "#123456");
    assert.equal(c.term, AJOU_TERM);
    assert.equal(c.id, `ajou-2026-2-${s.registrationNumber}`);
    assert.equal(c.credits, s.credits);
    assert.equal(c.originalSchedule, s.rawSchedule);
    assert.ok(c.schedules.every((t) => t.startTime < t.endTime && t.endTime <= "24:00"));
    assert.ok(sameCatalogSubject(s, c));
    assert.ok(!sameCatalogSubject(s, { ...c, term: "2026년 1학기" }));
  }
  assert.throws(() => sectionToCourse(sections.find((s) => !s.rawSchedule), "#123456"));
});

test("a different section of the same subject is recognized as a duplicate", () => {
  const first = sections.find((s) => !s.scheduleWarning && sections.some((b) => b.registrationNumber !== s.registrationNumber && b.subjectId === s.subjectId));
  const other = sections.find((s) => s.registrationNumber !== first.registrationNumber && s.subjectId === first.subjectId);
  assert.ok(sameCatalogSubject(other, sectionToCourse(first, "#123456")));
});

test("search supports names without spaces, professors and case-insensitive codes", () => {
  const sample = sections.find((s) => s.registrationNumber === "F126");
  assert.ok(matchesCatalogSearch(sample, "AI기초수학"));
  assert.ok(matchesCatalogSearch(sample, "한승현 aai224"));
  assert.ok(matchesCatalogSearch(sample, "f126"));
  assert.ok(!matchesCatalogSearch(sample, "없는과목"));
});

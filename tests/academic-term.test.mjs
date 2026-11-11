import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getAcademicTermOptions,
  getCurrentAcademicTermLabel,
  parseAcademicTerm,
  sortAcademicTerms,
} from "../src/lib/academic-term.ts";

test("terms sort by year then 1학기 → 여름학기 → 2학기 → 겨울학기", () => {
  assert.deepEqual(
    sortAcademicTerms(["2026년 겨울학기", "2027년 1학기", "2026년 2학기", "2026년 1학기", "2026년 여름학기", "2026년 2학기"]),
    ["2026년 1학기", "2026년 여름학기", "2026년 2학기", "2026년 겨울학기", "2027년 1학기"],
  );
});

test("January and February belong to the previous year's winter term", () => {
  assert.equal(getCurrentAcademicTermLabel(new Date("2027-01-15T12:00:00+09:00")), "2026년 겨울학기");
  assert.equal(getCurrentAcademicTermLabel(new Date("2026-12-15T12:00:00+09:00")), "2026년 2학기");
  assert.equal(getCurrentAcademicTermLabel(new Date("2026-07-15T12:00:00+09:00")), "2026년 여름학기");
  assert.equal(getCurrentAcademicTermLabel(new Date("2026-03-02T12:00:00+09:00")), "2026년 1학기");
});

test("term labels parse and unknown labels are kept at the end", () => {
  assert.deepEqual(parseAcademicTerm("2026년 여름학기"), { year: 2026, season: "여름학기" });
  assert.equal(parseAcademicTerm("2026년 3학기"), null);
  assert.deepEqual(sortAcademicTerms(["기타", "2026년 1학기"]), ["2026년 1학기", "기타"]);
  assert.ok(getAcademicTermOptions(new Date("2027-01-15T12:00:00+09:00")).includes("2026년 겨울학기"));
});

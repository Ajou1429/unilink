import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatGpa,
  gradeDistribution,
  gradeTerms,
  hasRetakePlan,
  normalizeSpecRecord,
  summarizeGrades,
} from "../src/lib/record-storage.ts";

const row = (overrides) => ({
  id: Math.random().toString(16), term: "1학년 1학기", courseName: "과목", credits: 3, grade: "A+",
  courseType: "major", retake: false, retakeGrade: "", createdAt: "", updatedAt: "", ...overrides,
});

test("GPA is credit-weighted; P/NP stay out of GPA and F/NP earn no credits", () => {
  const records = [
    row({ grade: "A+", credits: 3 }),
    row({ grade: "B0", credits: 2, courseType: "non-major" }),
    row({ grade: "P", credits: 1 }),
    row({ grade: "NP", credits: 1 }),
    row({ grade: "F", credits: 3 }),
    row({ grade: "", credits: 3 }),
  ];
  const summary = summarizeGrades(records);
  assert.equal(formatGpa(summary.gpa), formatGpa((4.5 * 3 + 3 * 2 + 0) / 8));
  assert.equal(formatGpa(summary.majorGpa), formatGpa((4.5 * 3) / 6));
  assert.equal(summary.earnedCredits, 3 + 2 + 1);
  assert.equal(summary.gpaCredits, 8);
});

test("planned retakes replace the current grade only in the retake projection", () => {
  const records = [row({ grade: "A0" }), row({ grade: "C0", retake: true, retakeGrade: "A0" })];
  assert.equal(formatGpa(summarizeGrades(records).gpa), "3.00");
  assert.equal(formatGpa(summarizeGrades(records, true).gpa), "4.00");
  assert.ok(hasRetakePlan(records));
  assert.ok(!hasRetakePlan([row({ retake: true, retakeGrade: "" })]));
});

test("no graded courses shows a dash, and extra term names are kept after the standard 8", () => {
  assert.equal(formatGpa(summarizeGrades([]).gpa), "-");
  const terms = gradeTerms([row({ term: "2026년 1학기" })]);
  assert.equal(terms.length, 9);
  assert.equal(terms[0], "1학년 1학기");
  assert.equal(terms[8], "2026년 1학기");
});

test("grade distribution is credit-weighted in grade order", () => {
  const items = gradeDistribution([row({ grade: "B+", credits: 1 }), row({ grade: "A+", credits: 3 })]);
  assert.deepEqual(items.map((item) => [item.grade, item.ratio]), [["A+", 0.75], ["B+", 0.25]]);
});

test("old spec records migrate to the new categories without losing text", () => {
  const competition = normalizeSpecRecord({ id: "1", title: "해커톤", category: "competition", awardStatus: "awarded", awardRank: "대상", completedAt: "2025-08-20", memo: "팀 프로젝트" });
  assert.equal(competition.category, "competition");
  assert.equal(competition.award, "대상");
  assert.equal(competition.acquiredAt, "2025-08");
  assert.equal(normalizeSpecRecord({ id: "2", title: "봉사", category: "experience", memo: "100시간" }).content, "100시간");
  assert.equal(normalizeSpecRecord({ id: "3", title: "TOEIC", category: "어학 시험" }).category, "language");
  assert.equal(normalizeSpecRecord({ id: "4", title: "정보처리기사", category: "certificate" }).category, "certificate");
});

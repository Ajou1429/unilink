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

let rowNumber = 0;
// 같은 이름은 재수강으로 묶이므로, 기본값은 행마다 다른 과목명
const row = (overrides) => ({
  id: Math.random().toString(16), term: "1학년 1학기", courseName: `과목${++rowNumber}`, credits: 3, grade: "A+",
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

test("the same course taken twice counts only the best grade (retake)", async () => {
  const { countedRecords, supersededIds } = await import("../src/lib/record-storage.ts");
  const first = row({ id: "a", term: "1학년 1학기", courseName: "물리학 1", grade: "C0" });
  const retaken = row({ id: "b", term: "2학년 여름학기", courseName: "물리학1", grade: "A0" });
  const other = row({ id: "c", courseName: "미적분", grade: "B0" });
  const summary = summarizeGrades([first, retaken, other]);
  assert.equal(formatGpa(summary.gpa), "3.50");
  assert.equal(summary.earnedCredits, 6);
  assert.deepEqual(countedRecords([first, retaken, other]).map((r) => r.id).sort(), ["b", "c"]);
  assert.deepEqual([...supersededIds([first, retaken, other])], ["a"]);
  // a worse retake never lowers the grade
  assert.equal(formatGpa(summarizeGrades([row({ courseName: "X", grade: "B+" }), row({ courseName: "X", term: "2학년 1학기", grade: "C0" })]).gpa), "3.50");
});

test("a planned retake is cleared once the course is actually retaken in a later term", async () => {
  const { clearCompletedRetakes } = await import("../src/lib/record-storage.ts");
  const planned = row({ id: "a", term: "1학년 1학기", courseName: "물리학 1", grade: "C0", retake: true, retakeGrade: "A0" });
  assert.equal(clearCompletedRetakes([planned])[0].retake, true);
  const ungraded = row({ id: "b", term: "2학년 여름학기", courseName: "물리학 1", grade: "" });
  assert.equal(clearCompletedRetakes([planned, ungraded])[0].retake, true);
  const done = clearCompletedRetakes([planned, { ...ungraded, grade: "A0" }]);
  assert.equal(done[0].retake, false);
  assert.equal(done[0].retakeGrade, "");
  // the retake projection uses the planned grade until then
  assert.equal(formatGpa(summarizeGrades([planned], true).gpa), "4.00");
});

test("added terms sort inside the year: 1학기 → 여름 → 2학기 → 겨울, and 5학년 after 4학년", () => {
  const terms = gradeTerms([], ["1학년 여름학기", "5학년 1학기", "2학년 겨울학기"]);
  assert.deepEqual(terms.slice(0, 4), ["1학년 1학기", "1학년 여름학기", "1학년 2학기", "2학년 1학기"]);
  assert.equal(terms[terms.indexOf("2학년 2학기") + 1], "2학년 겨울학기");
  assert.equal(terms.at(-1), "5학년 1학기");
});

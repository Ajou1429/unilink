import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { setStorageUser } from "../src/lib/private-storage.ts";
import { getGreeting } from "../src/lib/greeting.ts";
import { joinSourceFile, splitSourceFile } from "../src/lib/problem-bank-labels.ts";
import { addWeeklyStudyPlan, getMonthlyStudyPlans, getWeeklyStudyPlans } from "../src/lib/study-storage.ts";
import { getActiveTermCourses, saveStoredCourses } from "../src/lib/course-storage.ts";

function memory() {
  const data = new Map();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: (k) => data.delete(k) };
}
beforeEach(() => {
  globalThis.window = { localStorage: memory(), sessionStorage: memory(), dispatchEvent: () => true };
  globalThis.Event ??= class { constructor(type) { this.type = type; } };
  setStorageUser("A");
});

const kst = (iso) => new Date(`${iso}+09:00`);

test("greetings follow Korean local time of day", () => {
  assert.match(getGreeting("민수", kst("2026-11-12T03:00:00")), /새벽|조용한|이 시간까지/);
  assert.match(getGreeting("민수", kst("2026-11-12T07:30:00")), /아침/);
  assert.match(getGreeting("민수", kst("2026-11-12T23:10:00")), /늦은 저녁|끝까지|푹 쉬는/);
  assert.ok(getGreeting("민수", kst("2026-11-12T15:00:00")).includes("민수님"));
  // 같은 날 같은 시간대는 같은 문구
  assert.equal(getGreeting("민수", kst("2026-11-12T15:00:00")), getGreeting("민수", kst("2026-11-12T17:59:00")));
});

test("exam range is kept in the stored file key; legacy files count as midterm", () => {
  assert.deepEqual(splitSourceFile(joinSourceFile("final", " 과제2.pdf ")), { period: "final", name: "과제2.pdf" });
  assert.deepEqual(splitSourceFile("hw1.pdf"), { period: "midterm", name: "hw1.pdf" });
  assert.deepEqual(splitSourceFile(""), { period: "midterm", name: "" });
  assert.deepEqual(splitSourceFile("a::b.pdf"), { period: "midterm", name: "a::b.pdf" });
});

test("a quick-added plan lands on its date, is grouped into its week and mirrored to the monthly view", () => {
  const plan = addWeeklyStudyPlan({ title: " 3장 복습 ", dueDate: "2026-11-12", courseId: "c1", courseName: "회로이론" });
  assert.equal(plan.title, "3장 복습");
  assert.equal(plan.weekStart, "2026-11-08");
  assert.equal(getWeeklyStudyPlans()[0].id, plan.id);
  assert.equal(getMonthlyStudyPlans()[0].id, `weekly-${plan.id}`);
  const personal = addWeeklyStudyPlan({ title: "토익 단어", dueDate: "2026-11-13" });
  assert.equal(personal.courseId, "self");
  assert.equal(personal.courseName, "개인 학습");
});

test("active-term courses follow the semester and fall back to the latest earlier term during breaks", () => {
  const course = (id, term) => ({ id, term, name: id, professor: "", location: "", color: "#000", days: [], startTime: "", endTime: "", credits: 3 });
  saveStoredCourses([course("spring", "2026년 1학기"), course("fall", "2026년 2학기"), course("next", "2027년 1학기")]);
  assert.deepEqual(getActiveTermCourses(kst("2026-11-12T12:00:00")).courses.map((c) => c.id), ["fall"]);
  // 겨울 방학(2027년 1월 = 2026년 겨울학기): 겨울학기 수업이 없으면 직전 2학기
  const winter = getActiveTermCourses(kst("2027-01-15T12:00:00"));
  assert.equal(winter.term, "2026년 2학기");
  // 여름 방학: 1학기
  assert.equal(getActiveTermCourses(kst("2026-07-20T12:00:00")).term, "2026년 1학기");
  // 학기가 바뀌면 새 학기 수업
  assert.deepEqual(getActiveTermCourses(kst("2027-03-05T12:00:00")).courses.map((c) => c.id), ["next"]);
});

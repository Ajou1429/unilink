import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { setStorageUser } from "../src/lib/private-storage.ts";
import { getWeeklyStudyPlans, postponeWeeklyStudyPlan, saveWeeklyStudyPlans } from "../src/lib/study-storage.ts";

function memory() {
  const data = new Map();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: (k) => data.delete(k) };
}
beforeEach(() => {
  globalThis.window = { localStorage: memory(), sessionStorage: memory(), dispatchEvent: () => true };
  globalThis.Event ??= class { constructor(type) { this.type = type; } };
  setStorageUser("A");
});

const plan = (overrides) => ({
  id: "p1", userId: "A", courseId: "c1", courseName: "회로이론", week: 1,
  title: "2장 복습", description: "", dueDate: "2026-11-14", isCompleted: false, createdAt: "2026-11-01T00:00:00Z",
  ...overrides,
});

test("postponing moves the plan one day later and counts each postpone", () => {
  saveWeeklyStudyPlans([plan({ weekStart: "2026-11-08" }), plan({ id: "p2" })]);
  postponeWeeklyStudyPlan("p1");
  let [first, second] = getWeeklyStudyPlans();
  assert.equal(first.dueDate, "2026-11-15");
  // 11/14(토) → 11/15(일): 일요일 시작 주간 묶음도 다음 주로 이동
  assert.equal(first.weekStart, "2026-11-15");
  assert.equal(first.postponedCount, 1);
  assert.deepEqual(second, plan({ id: "p2" }));
  postponeWeeklyStudyPlan("p1");
  [first] = getWeeklyStudyPlans();
  assert.equal(first.dueDate, "2026-11-16");
  assert.equal(first.postponedCount, 2);
});

test("month boundaries and a time suffix on the due date are preserved", () => {
  saveWeeklyStudyPlans([plan({ dueDate: "2026-11-30T23:00:00" })]);
  postponeWeeklyStudyPlan("p1");
  const [first] = getWeeklyStudyPlans();
  assert.equal(first.dueDate, "2026-12-01T23:00:00");
  assert.equal(first.weekStart, undefined);
});

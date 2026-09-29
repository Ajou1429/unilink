import test from "node:test";
import assert from "node:assert/strict";
import { coachingWeek, orderCoachingTasks } from "../src/lib/coaching-view.ts";

test("coaching week uses local Sunday boundaries across a year change", () => {
  assert.deepEqual(coachingWeek(new Date(2027, 0, 1, 12)), {
    start: "2026-12-27",
    end: "2027-01-02",
    today: "2027-01-01",
  });
  assert.equal(coachingWeek(new Date(2027, 0, 1, 12), 1).start, "2027-01-03");
});

test("pending deadlines precede undated work and completed tasks without mutating input", () => {
  const rows = [
    { id: "done", completed: true, dueDate: "2026-01-01", title: "done" },
    { id: "undated", completed: false, dueDate: "", title: "undated" },
    { id: "later", completed: false, dueDate: "2026-10-01", title: "later" },
    { id: "urgent", completed: false, dueDate: "2026-09-01", title: "urgent" },
  ];
  assert.deepEqual(
    orderCoachingTasks(rows).map((r) => r.id),
    ["urgent", "later", "undated", "done"],
  );
  assert.equal(rows[0].id, "done");
});

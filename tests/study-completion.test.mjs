import { test } from "node:test";
import assert from "node:assert/strict";
import { readPlanCompletionCriteria } from "../src/lib/study-completion.ts";

test("saved scope and completion check survive display mapping without changing their evidence", () => {
  const saved = { schema_version: 1, task_scope: " JOIN 연습 1~3번 ", observable_check: " 결과 행을 설명하기 ", evidence_ids: ["topic-1", "pdf:3"] };
  const copy = structuredClone(saved);
  assert.deepEqual(readPlanCompletionCriteria(saved), { schema_version: 1, task_scope: "JOIN 연습 1~3번", observable_check: "결과 행을 설명하기", evidence_ids: saved.evidence_ids });
  assert.deepEqual(saved, copy);
});

test("legacy and malformed criteria never become fabricated completion instructions", () => {
  for (const value of [null, undefined, {}, { schema_version: 1 }, [], "text", { schema_version: 2, task_scope: "a", observable_check: "b" }, { schema_version: 1, task_scope: " ", observable_check: "b" }]) {
    assert.equal(readPlanCompletionCriteria(value), null);
  }
});

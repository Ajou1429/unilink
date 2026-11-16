import type { PlanCompletionCriteria } from "./types.ts";

/** Older plans may contain only {schema_version: 1}. Display real saved criteria. */
export function readPlanCompletionCriteria(value: unknown): PlanCompletionCriteria | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.schema_version !== 1 || typeof record.task_scope !== "string" ||
    typeof record.observable_check !== "string") return null;
  const scope = record.task_scope.trim();
  const check = record.observable_check.trim();
  if (!scope || !check) return null;
  return {
    schema_version: 1,
    task_scope: scope,
    observable_check: check,
    evidence_ids: Array.isArray(record.evidence_ids)
      ? record.evidence_ids.filter((id): id is string => typeof id === "string") : [],
  };
}

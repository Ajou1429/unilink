import type { PlanCompletionCriteria } from "@/lib/types";

export function PlanCompletionDetails({ criteria }: { criteria?: PlanCompletionCriteria | null }) {
  if (!criteria) return null;
  return <dl className="mt-3 space-y-2 rounded-lg bg-primary/5 p-3 text-sm">
    <div><dt className="text-xs font-medium text-muted-foreground">학습 범위</dt>
      <dd className="mt-1 whitespace-pre-wrap break-words">{criteria.task_scope}</dd></div>
    <div><dt className="text-xs font-medium text-muted-foreground">완료 기준</dt>
      <dd className="mt-1 whitespace-pre-wrap break-words">{criteria.observable_check}</dd></div>
  </dl>;
}

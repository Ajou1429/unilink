import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.116.0";
import { CoachingError, type CoachingContext, type CoachingRequest } from "./contract.ts";

export async function readApprovalRevision(db: SupabaseClient, userId: string): Promise<number | undefined> {
  const result = await db.from("coaching_state_revisions").select("revision").eq("user_id", userId).maybeSingle();
  if (result.error && ["42P01", "PGRST205"].includes(result.error.code)) return undefined;
  if (result.error) throw new CoachingError("계획 승인용 DB 적용 상태를 확인해 주세요.", 503);
  return Number(result.data?.revision ?? 0);
}

export function executionContract(request: CoachingRequest, context: CoachingContext) {
  if (context.approval_revision === undefined) return undefined;
  return { schema_version: 1, revision: context.approval_revision, timezone: context.timezone,
    period_start: request.period_start, period_end: request.period_end,
    day_budgets: request.day_budgets, rules: request.rules,
    exams: (request.exam_inputs ?? []).map(e => ({ goal_id: e.goal_id, exam_at: e.exam_at })),
    scope: "confirmed_execution_only_no_free_text" };
}

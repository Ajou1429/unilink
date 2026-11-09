import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.116.0";
import { CoachingError, type CoachingContext } from "./contract.ts";

export type BankStage = { id: string; goal_id: string; topic_id: string | null; subject_id: string;
  subject_name: string; label: string; level: number; level_recorded_at: string | null; updated_at: string };
export type BankEvidence = { status: "ready" | "schema_unavailable"; truncated_goal_ids: string[]; records: BankStage[] };
export const BANK_STAGE_LABELS = ["not_studied", "read_only", "solved_with_solution", "understood_solution", "attempted_independently", "self_reported_mastered"];
export const SELF_RATING_LABELS = ["hard_to_explain", "partly_understood", "basic_concept_understood", "can_apply_independently", "can_explain_to_others"];

export async function loadBankEvidence(db: SupabaseClient, userId: string, goalIds: string[]): Promise<BankEvidence> {
  const records: BankStage[] = [], truncated: string[] = [];
  for (const goalId of goalIds) {
    const result = await db.from("coaching_problem_bank_states")
      .select("id,goal_id,topic_id,subject_id,subject_name,label,level,level_recorded_at,updated_at")
      .eq("user_id", userId).eq("goal_id", goalId)
      .order("updated_at", { ascending: false }).order("id", { ascending: false }).limit(21);
    if (result.error) {
      if (["42P01", "PGRST205"].includes(result.error.code)) return { status: "schema_unavailable", truncated_goal_ids: [], records: [] };
      throw new CoachingError("문제은행 이해도 기록을 확인하지 못했습니다.", 503);
    }
    if ((result.data?.length ?? 0) > 20) truncated.push(goalId);
    records.push(...((result.data ?? []).slice(0, 20) as BankStage[]));
  }
  return { status: "ready", truncated_goal_ids: truncated, records };
}

export function bankModelEvidence(context: CoachingContext) {
  const selected = new Set(context.goals.map(g => g.id));
  const bank = context.problem_bank;
  const records = (bank?.records ?? []).filter(r => selected.has(r.goal_id) && Number.isInteger(r.level) && r.level >= 0 && r.level <= 5)
    .map(r => ({ problem_id: r.id, goal_id: r.goal_id,
      topic_id: context.topics.some(t => t.id === r.topic_id && t.goal_id === r.goal_id && t.status === "confirmed") ? r.topic_id : null,
      bank_subject_id: r.subject_id, bank_subject_name: r.subject_name.slice(0, 200), problem_label: r.label.slice(0, 200),
      stage_0_to_5: r.level, stage_meaning: BANK_STAGE_LABELS[r.level], stage_recorded_at: r.level_recorded_at,
      record_updated_at: r.updated_at, observation_kind: r.level_recorded_at ? "explicit_user_stage" : r.level === 0 ? "default_or_legacy_zero_unknown" : "legacy_stage_observation_time_unknown",
    }));
  return { status: bank?.status ?? "not_loaded", truncated_goal_ids: (bank?.truncated_goal_ids ?? []).filter(id => selected.has(id)), records };
}

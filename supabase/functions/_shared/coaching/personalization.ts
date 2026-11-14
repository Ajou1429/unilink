import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.116.0";
import { type CoachingContext, CoachingError } from "./contract.ts";

export type Satisfaction = {
  id: string;
  run_id: string;
  goal_id: string;
  rating: number;
  difficulty_fit: string | null;
  time_fit: string | null;
  observed_at: string;
  had_one_off_request: boolean;
};
export type SatisfactionEvidence = {
  status: "ready" | "schema_unavailable";
  records: Satisfaction[];
  truncated_goal_ids: string[];
};
export type UnderstandingObservation = {
  id: string;
  goal_id: string;
  topic_id: string;
  learning_status: string;
  self_rating: number | null;
  observed_at: string;
};
export async function loadUnderstandingHistory(
  db: SupabaseClient,
  userId: string,
  goalIds: string[],
) {
  const records: UnderstandingObservation[] = [],
    truncated_goal_ids: string[] = [];
  for (const goalId of goalIds) {
    const result = await db.from("active_topic_observations").select(
      "id,goal_id,topic_id,learning_status,self_rating,observed_at",
    )
      .eq("user_id", userId).eq("goal_id", goalId).order("observed_at", {
        ascending: false,
      }).order("id", { ascending: false }).limit(21);
    if (result.error) {
      throw new CoachingError("이해도 변화 기록을 확인하지 못했습니다.", 503);
    }
    if ((result.data?.length ?? 0) > 20) truncated_goal_ids.push(goalId);
    records.push(
      ...((result.data ?? []).slice(0, 20) as UnderstandingObservation[]),
    );
  }
  return { records, truncated_goal_ids };
}
export async function loadSatisfaction(
  db: SupabaseClient,
  userId: string,
  goalIds: string[],
): Promise<SatisfactionEvidence> {
  const records: Satisfaction[] = [], truncated: string[] = [];
  for (const goalId of goalIds) {
    const result = await db.from("coaching_satisfaction_evidence")
      .select(
        "id,run_id,goal_id,rating,difficulty_fit,time_fit,observed_at,had_one_off_request",
      )
      .eq("user_id", userId).eq("goal_id", goalId).order("observed_at", {
        ascending: false,
      }).order("id", { ascending: false }).limit(21);
    if (result.error) {
      if (["42P01", "PGRST205"].includes(result.error.code)) {
        return {
          status: "schema_unavailable",
          records: [],
          truncated_goal_ids: [],
        };
      }
      throw new CoachingError("학습 만족도 기록을 확인하지 못했습니다.", 503);
    }
    if ((result.data?.length ?? 0) > 20) truncated.push(goalId);
    records.push(...((result.data ?? []).slice(0, 20) as Satisfaction[]));
  }
  return { status: "ready", records, truncated_goal_ids: truncated };
}
export function satisfactionModelEvidence(context: CoachingContext) {
  return {
    status: context.satisfaction?.status ?? "not_loaded",
    truncated_goal_ids: (context.satisfaction?.truncated_goal_ids ?? []).filter(
      (id) => context.goals.some((g) => g.id === id),
    ),
    records: (context.satisfaction?.records ?? []).filter((r) =>
      context.goals.some((g) => g.id === r.goal_id) &&
      Number.isInteger(r.rating) && r.rating >= 1 && r.rating <= 5
    ).map((r) => ({
      observation_id: r.id,
      run_id: r.run_id,
      goal_id: r.goal_id,
      rating_1_to_5: r.rating,
      difficulty_fit:
        ["too_easy", "appropriate", "too_hard"].includes(r.difficulty_fit ?? "")
          ? r.difficulty_fit
          : null,
      time_fit:
        ["too_short", "appropriate", "too_long"].includes(r.time_fit ?? "")
          ? r.time_fit
          : null,
      observed_at: r.observed_at,
      had_one_off_request: r.had_one_off_request === true,
      scope: "whole_proposal_not_topic_mastery",
    })),
  };
}

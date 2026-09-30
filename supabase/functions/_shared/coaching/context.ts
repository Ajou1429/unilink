import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.116.0";
import { CoachingError, type CoachingContext, type CoachingRequest } from "./contract.ts";

const caps = { topics: 100, deadlines: 100, sessions: 100, existing_items: 100 };

export async function loadCoachingContext(
  db: SupabaseClient,
  userId: string,
  request: CoachingRequest,
): Promise<CoachingContext> {
  // Every user-owned table is explicitly scoped even though this server client has service-role access.
  const [preferences, goals, topics, methods, deadlines, sessions, existing] = await Promise.all([
    db.from("user_preferences").select("timezone").eq("user_id", userId).maybeSingle(),
    db.from("learning_goals").select("id,title,goal_type,target_date,importance,metadata")
      .eq("user_id", userId).eq("status", "active").in("id", request.goal_ids),
    db.from("goal_topics").select("id,goal_id,title,status")
      .eq("user_id", userId).in("goal_id", request.goal_ids).eq("status", "confirmed").limit(caps.topics + 1),
    db.from("study_methods").select("code,display_name,active").eq("active", true),
    db.from("calendar_events").select("goal_id,title,due_at,starts_at,event_type")
      .eq("user_id", userId).in("goal_id", request.goal_ids).eq("status", "scheduled")
      .limit(caps.deadlines + 1),
    db.from("study_sessions").select("goal_id,topic_id,actual_minutes,completion_status,started_at,metadata")
      .eq("user_id", userId).in("goal_id", request.goal_ids)
      .order("started_at", { ascending: false }).limit(caps.sessions),
    db.from("study_plan_items").select("goal_id,topic_id,title,planned_minutes,scheduled_start,status,metadata")
      .eq("user_id", userId).in("goal_id", request.goal_ids).eq("status", "planned")
      .limit(caps.existing_items + 1),
  ]);
  for (const result of [preferences, goals, topics, methods, deadlines, sessions, existing]) {
    if (result.error) throw new CoachingError("Learning context is unavailable", 503);
  }
  if (goals.data?.length !== request.goal_ids.length) throw new CoachingError("Goal is missing or unavailable", 404);
  for (const [rows, cap] of [
    [topics.data, caps.topics], [deadlines.data, caps.deadlines],
    [existing.data, caps.existing_items],
  ] as const) {
    if ((rows?.length ?? 0) > cap) throw new CoachingError("Learning context exceeds the supported size", 409);
  }
  return {
    timezone: preferences.data?.timezone ?? "Asia/Seoul",
    goals: goals.data ?? [], topics: topics.data ?? [], methods: methods.data ?? [],
    deadlines: deadlines.data ?? [], sessions: sessions.data ?? [], existing_items: existing.data ?? [],
  } as CoachingContext;
}

export function modelContext(context: CoachingContext) {
  const short = (value: string) => value.slice(0, 200);
  return {
    timezone: context.timezone,
    goals: context.goals.map(({ id, title, goal_type, target_date, importance }) =>
      ({ id, title: short(title), goal_type, target_date, importance })),
    topics: context.topics.map(({ id, goal_id, title }) => ({ id, goal_id, title: short(title) })),
    methods: context.methods.map(({ code, display_name }) => ({ code, display_name: short(display_name) })),
    deadlines: context.deadlines.map(({ goal_id, title, due_at, starts_at, event_type }) =>
      ({ goal_id, title: short(title), due_at, starts_at, event_type })),
    recent_study: context.sessions.map((session) => ({
      goal_id: session.goal_id, topic_id: session.topic_id,
      actual_minutes: session.actual_minutes, completion_status: session.completion_status,
      started_at: session.metadata?.completed_at_estimated === true ? null : session.started_at,
    })),
    existing_items: context.existing_items.map(({ goal_id, topic_id, title, planned_minutes, scheduled_start, metadata }) =>
      ({ goal_id, topic_id, title: short(title),
        planned_minutes: metadata?.estimated_minutes === true ? null : planned_minutes,
        scheduled_start })),
  };
}

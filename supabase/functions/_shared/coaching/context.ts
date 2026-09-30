import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.116.0";
import { CoachingError, type CoachingContext, type CoachingRequest } from "./contract.ts";

const caps = { topics: 100, deadlines: 100, sessions: 100, existing_items: 100, blocks: 200 };

function localStamp(value: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

export async function loadCoachingContext(
  db: SupabaseClient,
  userId: string,
  request: CoachingRequest,
): Promise<CoachingContext> {
  // Every user-owned table is explicitly scoped even though this server client has service-role access.
  const [preferences, goals, topics, methods, deadlines, sessions, existing, events, commitments, courses, schedules, plannedBlocks] = await Promise.all([
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
    db.from("calendar_events").select("title,starts_at,ends_at,is_blocking")
      .eq("user_id", userId).eq("status", "scheduled").eq("is_blocking", true)
      .lt("starts_at", new Date((Date.parse(`${request.period_end}T00:00:00Z`) + 2 * 86_400_000)).toISOString())
      .gte("ends_at", new Date((Date.parse(`${request.period_start}T00:00:00Z`) - 86_400_000)).toISOString()).limit(caps.blocks + 1),
    db.from("recurring_commitments").select("title,day_of_week,start_time,end_time,effective_from,effective_to")
      .eq("user_id", userId).eq("is_blocking", true).limit(caps.blocks + 1),
    db.from("courses").select("id").eq("user_id", userId).eq("status", "active").limit(caps.blocks + 1),
    db.from("course_schedules").select("course_id,day_of_week,start_time,end_time,effective_from,effective_to")
      .eq("user_id", userId).limit(caps.blocks + 1),
    db.from("study_plan_items").select("title,scheduled_start,scheduled_end")
      .eq("user_id", userId).eq("status", "planned").not("scheduled_start", "is", null)
      .lt("scheduled_start", new Date((Date.parse(`${request.period_end}T00:00:00Z`) + 2 * 86_400_000)).toISOString())
      .gte("scheduled_end", new Date((Date.parse(`${request.period_start}T00:00:00Z`) - 86_400_000)).toISOString()).limit(caps.blocks + 1),
  ]);
  for (const result of [preferences, goals, topics, methods, deadlines, sessions, existing, events, commitments, courses, schedules, plannedBlocks]) {
    if (result.error) throw new CoachingError("Learning context is unavailable", 503);
  }
  if (goals.data?.length !== request.goal_ids.length) throw new CoachingError("Goal is missing or unavailable", 404);
  for (const [rows, cap] of [
    [topics.data, caps.topics], [deadlines.data, caps.deadlines],
    [existing.data, caps.existing_items], [events.data, caps.blocks], [commitments.data, caps.blocks],
    [courses.data, caps.blocks], [schedules.data, caps.blocks], [plannedBlocks.data, caps.blocks],
  ] as const) {
    if ((rows?.length ?? 0) > cap) throw new CoachingError("Learning context exceeds the supported size", 409);
  }
  const timezone = preferences.data?.timezone ?? "Asia/Seoul";
  try { new Intl.DateTimeFormat("en", { timeZone: timezone }); }
  catch { throw new CoachingError("Invalid user timezone", 409); }
  const activeCourses = new Set((courses.data ?? []).map((course) => course.id));
  return {
    timezone,
    goals: goals.data ?? [], topics: topics.data ?? [], methods: methods.data ?? [],
    deadlines: deadlines.data ?? [], sessions: sessions.data ?? [], existing_items: existing.data ?? [],
    blocked_events: [
      ...(events.data ?? []).filter((event) => event.starts_at && event.ends_at)
        .map((event) => ({ start: localStamp(event.starts_at!, timezone), end: localStamp(event.ends_at!, timezone), label: event.title })),
      ...(plannedBlocks.data ?? []).filter((item) => item.scheduled_start && item.scheduled_end)
        .map((item) => ({ start: localStamp(item.scheduled_start!, timezone), end: localStamp(item.scheduled_end!, timezone), label: "기존 학습 계획" })),
    ],
    recurring_blocks: [
      ...(commitments.data ?? []).map((block) => ({ ...block, label: block.title })),
      ...(schedules.data ?? []).filter((block) => activeCourses.has(block.course_id)).map((block) => ({
        day_of_week: block.day_of_week, start_time: block.start_time, end_time: block.end_time,
        effective_from: block.effective_from, effective_to: block.effective_to, label: "수업",
      })),
    ],
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
    blocked_events: (context.blocked_events ?? []).map(({ start, end, label }) => ({ start, end, label: short(label) })),
    recurring_blocks: (context.recurring_blocks ?? []).map(({ day_of_week, start_time, end_time, effective_from, effective_to, label }) =>
      ({ day_of_week, start_time, end_time, effective_from, effective_to, label: short(label) })),
  };
}

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.116.0";
import { CoachingError, type CoachingContext, type CoachingRequest, type CourseProgress } from "./contract.ts";

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
    db.from("learning_goals").select("id,title,goal_type,course_id,target_date,importance,metadata")
      .eq("user_id", userId).eq("status", "active").in("id", request.goal_ids),
    db.from("goal_topics").select("id,goal_id,title,status")
      .eq("user_id", userId).in("goal_id", request.goal_ids).eq("status", "confirmed").limit(caps.topics + 1),
    db.from("study_methods").select("code,display_name,active").eq("active", true),
    db.from("calendar_events").select("id,goal_id,title,due_at,starts_at,event_type,description,exam_scope")
      .eq("user_id", userId).in("goal_id", request.goal_ids).eq("status", "scheduled")
      .limit(caps.deadlines + 1),
    db.from("study_sessions").select("goal_id,topic_id,actual_minutes,completion_status,started_at,mastery_before,mastery_after,metadata")
      .eq("user_id", userId).in("goal_id", request.goal_ids)
      .order("started_at", { ascending: false }).limit(caps.sessions),
    db.from("study_plan_items").select("id,goal_id,topic_id,title,planned_minutes,scheduled_start,scheduled_end,status,metadata")
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
  // Bound history per selected course so one busy course cannot hide the others.
  const selectedCourses = [...new Set((goals.data ?? []).flatMap((goal) => goal.course_id ? [goal.course_id] : []))];
  const progressResults = await Promise.all(selectedCourses.map((courseId) =>
    db.from("course_sessions").select("id,course_id,session_date,pace,memo,metadata")
      .eq("user_id", userId).eq("course_id", courseId).lte("session_date", request.period_start)
      .order("session_date", { ascending: false }).order("id", { ascending: false }).limit(10)));
  if (progressResults.some((result) => result.error)) throw new CoachingError("Course progress is unavailable", 503);
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
  if (request.intent === "daily_plan") {
    for (const source of request.daily_sources ?? []) {
      const rows = source.kind === "event" ? deadlines.data : existing.data;
      if (!rows?.some((row) => row.id === source.id)) throw new CoachingError("선택한 작업이 완료되었거나 더 이상 사용할 수 없습니다.", 409);
    }
  }
  return {
    timezone,
    goals: goals.data ?? [], topics: topics.data ?? [], methods: methods.data ?? [],
    deadlines: deadlines.data ?? [], sessions: sessions.data ?? [], existing_items: existing.data ?? [],
    course_progress: progressResults.flatMap((result) => result.data ?? []) as CourseProgress[],
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
        effective_from: block.effective_from, effective_to: block.effective_to,
        label: `수업:${(goals.data ?? []).find((goal) => goal.course_id === block.course_id)?.id ?? block.course_id}`,
      })),
    ],
  } as CoachingContext;
}

export function modelContext(context: CoachingContext) {
  const short = (value: string) => value.slice(0, 200);
  const text = (value: unknown, limit = 200) => typeof value === "string" ? value.slice(0, limit) : null;
  const level = (value: unknown) => Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 5 ? Number(value) : null;
  const reportedLevel = (value: unknown) => value === "상" || value === "중" || value === "하" ? value : null;
  const selectedCourses = new Set(context.goals.flatMap((goal) => goal.course_id ? [goal.course_id] : []));
  return {
    timezone: context.timezone,
    goals: context.goals.map(({ id, title, goal_type, course_id, target_date, importance }) =>
      ({ id, title: short(title), goal_type, course_id: course_id ?? null, target_date, importance })),
    course_progress_scope: "Latest 10 recorded sessions per selected course, on or before plan start; not the full syllabus or PDF contents.",
    recent_course_progress: (context.course_progress ?? []).filter((session) => selectedCourses.has(session.course_id)).map((session) => {
      const raw = session.metadata?.legacy_record;
      const legacy = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
      return {
        session_id: session.id, course_id: session.course_id, session_date: session.session_date,
        progress_title: text(legacy.progressTitle), progress_memo: text(session.memo, 1500),
        recorded_pace_1_to_5: level(session.pace),
        self_reported_difficulty: reportedLevel(legacy.difficulty), self_reported_pace: reportedLevel(legacy.pace),
        linked_note_title: text(legacy.noteTitle), page_start: text(legacy.pageStart, 20), page_end: text(legacy.pageEnd, 20),
      };
    }),
    evidence_limits: "Mastery values are recorded 1-5 ratings, not verified test scores. Difficulty and pace are user reports. Completion and minutes do not prove understanding. Missing evidence means unknown.",
    topics: context.topics.map(({ id, goal_id, title }) => ({ id, goal_id, title: short(title) })),
    methods: context.methods.map(({ code, display_name }) => ({ code, display_name: short(display_name) })),
    deadlines: context.deadlines.map(({ id, goal_id, title, due_at, starts_at, event_type, description, exam_scope }) =>
      ({ id, goal_id, title: short(title), due_at, starts_at, event_type,
        description: description?.slice(0, 3000) ?? "", exam_scope: exam_scope?.slice(0, 2000) ?? "" })),
    recent_study: context.sessions.map((session) => ({
      goal_id: session.goal_id, topic_id: session.topic_id,
      actual_minutes: session.actual_minutes, completion_status: session.completion_status,
      recorded_mastery_before_1_to_5: level(session.mastery_before), recorded_mastery_after_1_to_5: level(session.mastery_after),
      started_at: session.metadata?.completed_at_estimated === true ? null : session.started_at,
    })),
    existing_items: context.existing_items.map(({ id, goal_id, topic_id, title, planned_minutes, scheduled_start, scheduled_end, metadata }) =>
      ({ id, goal_id, topic_id, title: short(title),
        due_date: typeof (metadata?.legacy_record as Record<string, unknown> | undefined)?.dueDate === "string" ? String((metadata.legacy_record as Record<string, unknown>).dueDate).slice(0, 10) : null,
        planned_minutes: metadata?.estimated_minutes === true ? null : planned_minutes,
        scheduled_start, scheduled_end })),
    blocked_events: (context.blocked_events ?? []).map(({ start, end, label }) => ({ start, end, label: short(label) })),
    recurring_blocks: (context.recurring_blocks ?? []).map(({ day_of_week, start_time, end_time, effective_from, effective_to, label }) =>
      ({ day_of_week, start_time, end_time, effective_from, effective_to, label: short(label) })),
  };
}

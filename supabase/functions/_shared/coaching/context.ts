import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.116.0";
import { CoachingError, type CoachingContext, type CoachingRequest, type CourseProgress } from "./contract.ts";
import { loadKnowledge } from "../courseKnowledgeStore.ts";
import { bankModelEvidence, loadBankEvidence } from "./problemBank.ts";
import { loadSatisfaction, loadUnderstandingHistory, satisfactionModelEvidence } from "./personalization.ts";
import { loadCoachingReview } from "./diagnosis.ts";
import { readApprovalRevision } from "./execution.ts";

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
  knowledge?: { model: string; searchModel: string | null },
): Promise<CoachingContext> {
  // Every user-owned table is explicitly scoped even though this server client has service-role access.
  const approvalRevision = await readApprovalRevision(db, userId);
  const [preferences, goals, topics, methods, deadlines, sessionResults, existing, events, commitments, courses, schedules, plannedBlocks] = await Promise.all([
    db.from("user_preferences").select("timezone,preferred_session_minutes,coaching_style").eq("user_id", userId).maybeSingle(),
    db.from("learning_goals").select("id,title,goal_type,course_id,target_date,importance,metadata")
      .eq("user_id", userId).eq("status", "active").in("id", request.goal_ids),
    db.from("goal_topics").select("id,goal_id,title,status")
      .eq("user_id", userId).in("goal_id", request.goal_ids).eq("status", "confirmed").limit(caps.topics + 1),
    db.from("study_methods").select("code,display_name,active").eq("active", true),
    db.from("calendar_events").select("id,goal_id,title,due_at,starts_at,event_type,description,exam_scope")
      .eq("user_id", userId).in("goal_id", request.goal_ids).eq("status", "scheduled")
      .limit(caps.deadlines + 1),
    Promise.all(request.goal_ids.map((goalId) => db.from("study_sessions")
      .select("id,plan_item_id,goal_id,topic_id,method_code,source,actual_minutes,completion_status,started_at,ended_at,created_at,mastery_before,mastery_after,metadata")
      .eq("user_id", userId).eq("goal_id", goalId)
      .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(20))),
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
  for (const result of [preferences, goals, topics, methods, deadlines, ...sessionResults, existing, events, commitments, courses, schedules, plannedBlocks]) {
    if (result.error) throw new CoachingError("Learning context is unavailable", 503);
  }
  if (goals.data?.length !== request.goal_ids.length) throw new CoachingError("Goal is missing or unavailable", 404);
  // Feedback is linked through owned runs; a plan-wide opinion is never assigned to an arbitrary topic.
  const runs = await db.from("coaching_runs").select("id,request_payload")
    .eq("user_id", userId).order("created_at", { ascending: false }).limit(30);
  if (runs.error) throw new CoachingError("개인 코칭 이력을 확인하지 못했습니다.", 503);
  const relatedRuns = (runs.data ?? []).filter((run) => Array.isArray(run.request_payload?.request?.goal_ids)
    && run.request_payload.request.goal_ids.some((id: unknown) => request.goal_ids.includes(String(id))));
  const feedback = relatedRuns.length ? await db.from("coaching_feedback")
    .select("id,run_id,feedback_type,created_at").eq("user_id", userId).in("run_id", relatedRuns.map((run) => run.id))
    .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(20) : { data: [], error: null };
  if (feedback.error) throw new CoachingError("개인 코칭 피드백을 확인하지 못했습니다.", 503);
  const problemBank = await loadBankEvidence(db, userId, request.goal_ids);
  const satisfaction = await loadSatisfaction(db, userId, request.goal_ids);
  const understandingHistory = await loadUnderstandingHistory(db, userId, request.goal_ids);
  const learningStates = await db.from("topic_learning_states")
    .select("id,goal_id,topic_id,learning_status,self_rating,memo,observed_at,source,session_id,session_date,note_id,page_start,page_end")
    .eq("user_id", userId).in("goal_id", request.goal_ids).limit(caps.topics + 1);
  if (learningStates.error) throw new CoachingError("학습 상태를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.", 503);
  if ((learningStates.data?.length ?? 0) > caps.topics) throw new CoachingError("학습 주제가 많습니다. 목표 범위를 나눠 주세요.", 409);
  const courseKnowledge: Record<string, unknown>[] = [];
  if (knowledge) for (const goalId of request.goal_ids) {
    const focus = [request.desired_outcome, request.constraints, ...(request.exam_inputs ?? []).filter((e) => e.goal_id === goalId).map((e) => e.scope),
      ...((deadlines.data ?? []).filter((d) => d.goal_id === goalId).flatMap((d) => [d.title, d.description ?? "", d.exam_scope ?? ""])),
      ...((topics.data ?? []).filter((t) => t.goal_id === goalId).map((t) => t.title))];
    const ranges = (learningStates.data ?? []).filter(s => s.goal_id === goalId && s.note_id && s.page_start && s.page_end
      && (topics.data ?? []).some(t => t.id === s.topic_id && t.goal_id === goalId))
      .map(s => ({ note_id: s.note_id as string, page_start: s.page_start as number, page_end: s.page_end as number }));
    const loaded = await loadKnowledge(db, userId, goalId, request.period_start, knowledge.model, knowledge.searchModel, focus, ranges);
    if (loaded.plan.tasks.some((task) => task.kind !== "research")) {
      throw new CoachingError("과목 자료 분석이 필요합니다. 계획 추천 화면에서 분석을 완료하거나 실패한 단계를 다시 시도해 주세요.", 409);
    }
    courseKnowledge.push(loaded.context);
  }
  // Bound history per selected course so one busy course cannot hide the others.
  const selectedCourses = [...new Set((goals.data ?? []).flatMap((goal) => goal.course_id ? [goal.course_id] : []))];
  const progressResults = await Promise.all(selectedCourses.map((courseId) =>
    db.from("course_sessions").select("id,course_id,session_date,pace,memo,metadata")
      .eq("user_id", userId).eq("course_id", courseId).lte("session_date", request.period_start)
      .order("session_date", { ascending: false }).order("id", { ascending: false }).limit(10)));
  if (progressResults.some((result) => result.error)) throw new CoachingError("Course progress is unavailable", 503);
  const checkStates = await db.from("topic_check_states").select("id,check_id,goal_id,topic_id,correct_count,question_count,source,grader_version,created_at,note_id,note_version,source_stale,voided_at")
    .eq("user_id", userId).in("goal_id", request.goal_ids).limit(caps.topics + 1);
  if (checkStates.error) throw new CoachingError("문제풀이 결과를 확인하지 못했습니다.", 503);
  if ((checkStates.data?.length ?? 0) > caps.topics) throw new CoachingError("확인 주제가 많습니다. 목표 범위를 나눠 주세요.", 409);
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
  const context = {
    approval_revision: approvalRevision,
    satisfaction,
    understanding_history:understandingHistory,
    problem_bank: problemBank,
    course_knowledge: courseKnowledge,
    personal_preferences: { preferred_session_minutes: preferences.data?.preferred_session_minutes ?? null, coaching_style: preferences.data?.coaching_style ?? null },
    personal_feedback: (feedback.data ?? []).map((row) => ({ ...row, goal_ids: relatedRuns.find((run) => run.id === row.run_id)?.request_payload.request.goal_ids ?? [] })),
    timezone,
    goals: goals.data ?? [], topics: topics.data ?? [], methods: methods.data ?? [],
    deadlines: deadlines.data ?? [], sessions: sessionResults.flatMap((result) => result.data ?? []), existing_items: existing.data ?? [],
    course_progress: progressResults.flatMap((result) => result.data ?? []) as CourseProgress[],
    topic_learning_states: learningStates.data ?? [],
    topic_check_states: checkStates.data ?? [],
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
  context.review = await loadCoachingReview(db, userId, request, context);
  if (approvalRevision !== await readApprovalRevision(db, userId)) throw new CoachingError("조회 중 일정이나 학습 상태가 변경됐습니다. 다시 요청해 주세요.", 409);
  return context;
}

export function modelContext(context: CoachingContext) {
  const short = (value: string) => value.slice(0, 200);
  const text = (value: unknown, limit = 200) => typeof value === "string" ? value.slice(0, limit) : null;
  const level = (value: unknown) => Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 5 ? Number(value) : null;
  const reportedLevel = (value: unknown) => value === "상" || value === "중" || value === "하" ? value : null;
  const selectedCourses = new Set(context.goals.flatMap((goal) => goal.course_id ? [goal.course_id] : []));
  return {
    review: context.review ?? { status: "not_requested", truncated: false, candidates: [], related_learning: [] },
    satisfaction: satisfactionModelEvidence(context),
    understanding_history: {
      truncated_goal_ids:(context.understanding_history?.truncated_goal_ids??[]).filter(id=>context.goals.some(g=>g.id===id)),
      records:(context.understanding_history?.records??[]).filter(r=>context.goals.some(g=>g.id===r.goal_id)
        && context.topics.some(t=>t.status==="confirmed"&&t.id===r.topic_id&&t.goal_id===r.goal_id)
        && !(context.topic_learning_states??[]).some(s=>s.id===r.id)).map(r=>({observation_id:r.id,goal_id:r.goal_id,topic_id:r.topic_id,
          learning_status:r.learning_status,self_rating_1_to_5:level(r.self_rating),observed_at:r.observed_at,source:"self_report_history"})),
    },
    problem_bank: bankModelEvidence(context),
    personal_preferences: {
      preferred_session_minutes: Number.isInteger(context.personal_preferences?.preferred_session_minutes) && Number(context.personal_preferences?.preferred_session_minutes) > 0
        ? context.personal_preferences!.preferred_session_minutes : null,
      coaching_style: text(context.personal_preferences?.coaching_style, 500),
    },
    personal_feedback: (context.personal_feedback ?? []).filter((f) => ["accepted", "modified", "rejected"].includes(f.feedback_type)
      && f.goal_ids.some((id) => context.goals.some((g) => g.id === id))).slice(0, 20).map((f) => ({
        feedback_id: f.id, run_id: f.run_id, goal_ids: f.goal_ids.filter((id) => context.goals.some((g) => g.id === id)),
        feedback_type: f.feedback_type, observed_at: f.created_at,
        scope: "one_run_decision_not_standing_preference_or_topic_diagnosis",
      })),
    course_knowledge: context.course_knowledge ?? [],
    timezone: context.timezone,
    topic_check_results: (context.topic_check_states ?? []).filter((state) => !state.voided_at && context.topics.some((topic) => topic.status === "confirmed" && topic.id === state.topic_id && topic.goal_id === state.goal_id)).map((state) => ({
      attempt_id: state.id, check_id: state.check_id, goal_id: state.goal_id, topic_id: state.topic_id,
      correct_count: state.correct_count, question_count: state.question_count, source: state.source,
      grader_version: state.grader_version, assessed_at: state.created_at,
      note_id: state.note_id, note_version: state.note_version, source_stale: state.source_stale,
      review_signal: state.correct_count < state.question_count ? "incorrect_answers_recorded" : "all_sampled_questions_correct",
    })),
    topic_learning_states: (context.topic_learning_states ?? []).filter((state) => context.topics.some((topic) => topic.status === "confirmed" && topic.id === state.topic_id && topic.goal_id === state.goal_id)).map((state) => ({
      observation_id: state.id, goal_id: state.goal_id, topic_id: state.topic_id,
      learning_status: state.learning_status, self_rating_1_to_5: level(state.self_rating),
      memo: text(state.memo, 1000), observed_at: state.observed_at, source: state.source,
      session_id: state.session_id, session_date: state.session_date, note_id: state.note_id,
      page_start: state.page_start, page_end: state.page_end,
    })),
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
      session_id: session.id ?? null, plan_item_id: session.plan_item_id ?? null,
      method_code: session.method_code ?? null, source: session.source ?? null, recorded_at: session.created_at ?? null,
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

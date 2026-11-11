import { evidenceIds } from "./diagnosis.ts";

export class CoachingError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

export const COACHING_POLICY_VERSION = "time-window-v5";

export type TimeWindow = { start: string; end: string };
export type DayBudget = { date: string; minutes: number; windows: TimeWindow[] };
export type PlanningRules = { transition_minutes: number; break_minutes: number; break_after_minutes: number; method_minimums: Record<string, number>; max_focus_goals: number; carryover: boolean };
export type CoachingRequest = {
  review_other_goals?: boolean;
  use_related_learning?: boolean;
  preparation_end?: string;
  daily_sources?: { kind: string; id: string }[];
  exam_inputs?: { goal_id: string; scope: string; exam_at: string; priority: number; difficulty: number }[];
  goal_ids: string[];
  intent: string;
  period_start: string;
  period_end: string;
  day_budgets: DayBudget[];
  desired_outcome: string;
  constraints: string;
  rules: PlanningRules;
};
export type Goal = { id: string; title: string; goal_type: string; course_id?: string | null; target_date: string | null; importance: number; metadata: Record<string, unknown> };
export type Topic = { id: string; goal_id: string; title: string; status: string };
export type Method = { code: string; display_name: string; active: boolean };
export type Deadline = { goal_id: string | null; title: string; due_at: string | null; starts_at: string | null; event_type: string; description?: string; exam_scope?: string };
export type Session = { id?: string; plan_item_id?: string | null; method_code?: string | null; source?: string; ended_at?: string | null; created_at?: string; goal_id: string; topic_id: string | null; actual_minutes: number; completion_status: string; started_at: string | null; mastery_before?: number | null; mastery_after?: number | null; metadata: Record<string, unknown> };
export type PersonalFeedback = { id: string; run_id: string; goal_ids: string[]; feedback_type: string; explanation?: string | null; created_at: string };
export type CourseProgress = { id: string; course_id: string; session_date: string; pace: number | null; memo: string | null; metadata: Record<string, unknown> };
export type ExistingItem = { goal_id: string; topic_id: string | null; title: string; planned_minutes: number; scheduled_start: string | null; status: string; metadata: Record<string, unknown> };
export type BlockedInterval = { start: string; end: string; label: string };
export type RecurringBlock = { day_of_week: number; start_time: string; end_time: string; effective_from: string | null; effective_to: string | null; label: string };
export type TopicLearningState = { id: string; goal_id: string; topic_id: string; learning_status: string; self_rating: number | null; memo: string; observed_at: string; source: string; session_id: string | null; session_date: string | null; note_id: string | null; page_start: number | null; page_end: number | null };
export type CoachingContext = {
  review?: import("./diagnosis.ts").CoachingReview;
  approval_revision?: number;
  satisfaction?: import("./personalization.ts").SatisfactionEvidence;
  understanding_history?: {records:import("./personalization.ts").UnderstandingObservation[];truncated_goal_ids:string[]};
  problem_bank?: import("./problemBank.ts").BankEvidence;
  personal_preferences?: { preferred_session_minutes: number | null; coaching_style: string | null };
  personal_feedback?: PersonalFeedback[];
  course_knowledge?: Record<string, unknown>[];
  topic_check_states?: { id: string; check_id: string; goal_id: string; topic_id: string; correct_count: number; question_count: number; source: string; grader_version: string; created_at: string; note_id: string; note_version: number; source_stale: boolean; voided_at?: string | null }[];
  topic_learning_states?: TopicLearningState[];
  timezone: string;
  goals: Goal[];
  topics: Topic[];
  methods: Method[];
  deadlines: (Deadline & { id?: string })[];
  sessions: Session[];
  existing_items: (ExistingItem & { id?: string; scheduled_end?: string | null })[];
  course_progress?: CourseProgress[];
  blocked_events?: BlockedInterval[];
  recurring_blocks?: RecurringBlock[];
};
export type ProposedItem = {
  completion_criteria?: { schema_version: 1; task_scope: string; observable_check: string; evidence_ids: string[] };
  goal_id: string;
  topic_id: string | null;
  method_code: string;
  title: string;
  planned_date: string;
  planned_minutes: number;
  start_time: string;
  reason: string;
};
export type DeferredGoal = { goal_id: string; reason: string; reconsider_on: string };
export type Advisory = { goal_id: string; reason: string; suggested_action: string; evidence_ids: string[] };
export type Proposal = { summary: string; items: ProposedItem[]; deferred_goals: DeferredGoal[]; advisories?: Advisory[]; preparation_outlook?: string };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isoDay = /^\d{4}-\d{2}-\d{2}$/;
const intents = new Set(["weekly_plan", "daily_plan", "exam_prep", "topic_review"]);
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const clock = /^([01]\d|2[0-3]):[0-5]\d$/;
export const minuteOfDay = (value: unknown): number => {
  if (typeof value !== "string" || !clock.test(value)) throw new CoachingError("Invalid time");
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
};

export function dayNumber(value: unknown): number {
  if (typeof value !== "string" || !isoDay.test(value)) throw new CoachingError("Invalid date");
  const time = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value) {
    throw new CoachingError("Invalid date");
  }
  return time / 86_400_000;
}

export function parseCoachingRequest(value: unknown): CoachingRequest {
  if (!record(value)) throw new CoachingError("JSON object required");
  const start = dayNumber(value.period_start);
  const end = dayNumber(value.period_end);
  if (end < start || end - start > 13) throw new CoachingError("Plan period must be 1 to 14 days");
  for (const key of ["review_other_goals", "use_related_learning"]) if (value[key] !== undefined && typeof value[key] !== "boolean") throw new CoachingError("Invalid review scope");
  if (value.preparation_end !== undefined && (value.intent !== "exam_prep" || dayNumber(value.preparation_end) < end || dayNumber(value.preparation_end) - start > 20)) throw new CoachingError("시험 준비 전망은 실행 기간 이후부터 최대 21일까지입니다.");
  if (!Array.isArray(value.goal_ids) || value.goal_ids.length < 1 || value.goal_ids.length > 5 ||
    new Set(value.goal_ids).size !== value.goal_ids.length || !value.goal_ids.every((id) => typeof id === "string" && uuid.test(id))) {
    throw new CoachingError("Select 1 to 5 unique goals");
  }
  if (typeof value.intent !== "string" || !intents.has(value.intent)) throw new CoachingError("Invalid intent");
  const sources = value.daily_sources ?? [];
  if (!Array.isArray(sources) || sources.length > 30 || sources.some((s) => !record(s) ||
    !["event", "plan"].includes(String(s.kind)) || typeof s.id !== "string" || !uuid.test(s.id))) throw new CoachingError("Invalid daily sources");
  const exams = value.exam_inputs ?? [];
  if (!Array.isArray(exams) || exams.length > 5 || exams.some((e) => !record(e) ||
    !(value.goal_ids as string[]).includes(String(e.goal_id)) || typeof e.scope !== "string" || !e.scope.trim() || e.scope.length > 2000 ||
    typeof e.exam_at !== "string" || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(e.exam_at) || !Number.isFinite(Date.parse(e.exam_at)) ||
    !Number.isInteger(e.priority) || Number(e.priority) < 1 || Number(e.priority) > 5 ||
    !Number.isInteger(e.difficulty) || Number(e.difficulty) < 1 || Number(e.difficulty) > 5)) throw new CoachingError("Invalid exam inputs");
  if (value.intent === "daily_plan" && !sources.length) throw new CoachingError("마감 작업을 선택해 주세요.");
  if (value.intent === "exam_prep" && ((new Set(exams.map((e) => e.goal_id))).size !== (value.goal_ids as string[]).length || exams.length !== (value.goal_ids as string[]).length)) throw new CoachingError("과목별 시험 정보를 입력해 주세요.");
  if (typeof value.desired_outcome !== "string" || value.desired_outcome.length > 1000 ||
    typeof value.constraints !== "string" || value.constraints.length > 1000) throw new CoachingError("Request text is too long");
  if (!Array.isArray(value.day_budgets) || value.day_budgets.length !== end - start + 1) {
    throw new CoachingError("Confirm available minutes for each day");
  }
  const days = value.day_budgets.map((entry: unknown) => {
    if (!record(entry) || !Number.isInteger(entry.minutes) || (entry.minutes as number) < 0 || (entry.minutes as number) > 480) {
      throw new CoachingError("Invalid daily availability");
    }
    const day = dayNumber(entry.date);
    if (day < start || day > end) throw new CoachingError("Availability is outside the plan period");
    if (!Array.isArray(entry.windows) || entry.windows.length > 8 ||
      ((entry.minutes as number) > 0 && entry.windows.length < 1)) throw new CoachingError("Confirm study windows for each day");
    const windows = entry.windows.map((window: unknown) => {
      if (!record(window)) throw new CoachingError("Invalid study window");
      const from = minuteOfDay(window.start), to = minuteOfDay(window.end);
      if (to <= from) throw new CoachingError("Invalid study window");
      return { start: window.start as string, end: window.end as string };
    }).sort((a, b) => a.start.localeCompare(b.start));
    if (windows.some((window, i) => i > 0 && window.start < windows[i - 1].end) ||
      windows.reduce((sum, window) => sum + minuteOfDay(window.end) - minuteOfDay(window.start), 0) < (entry.minutes as number)) {
      throw new CoachingError("Study windows overlap or are shorter than daily availability");
    }
    return { date: entry.date as string, minutes: entry.minutes as number, windows };
  });
  if (new Set(days.map((entry) => entry.date)).size !== days.length) throw new CoachingError("Duplicate availability date");
  if (!days.some((entry) => entry.minutes >= 15)) throw new CoachingError("At least one study day is required");
  const inputRules = value.rules;
  if (!record(inputRules) || !Number.isInteger(inputRules.transition_minutes) || (inputRules.transition_minutes as number) < 0 || (inputRules.transition_minutes as number) > 60 ||
    !Number.isInteger(inputRules.break_minutes) || (inputRules.break_minutes as number) < 0 || (inputRules.break_minutes as number) > 60 ||
    !Number.isInteger(inputRules.break_after_minutes) || (inputRules.break_after_minutes as number) < 30 || (inputRules.break_after_minutes as number) > 240 ||
    !Number.isInteger(inputRules.max_focus_goals) || (inputRules.max_focus_goals as number) < 1 || (inputRules.max_focus_goals as number) > 5 ||
    typeof inputRules.carryover !== "boolean" || !record(inputRules.method_minimums)) throw new CoachingError("Invalid planning rules");
  const methodMinimums: Record<string, number> = Object.create(null);
  if (Object.keys(inputRules.method_minimums).length > 30) throw new CoachingError("Too many method rules");
  for (const [code, minutes] of Object.entries(inputRules.method_minimums)) {
    if (!/^[a-z][a-z0-9_]{0,49}$/.test(code) || !Number.isInteger(minutes) || (minutes as number) < 15 ||
      (minutes as number) > 180 || (minutes as number) > (inputRules.break_after_minutes as number)) throw new CoachingError("Invalid method minimum");
    methodMinimums[code] = minutes as number;
  }
  return {
    ...(value.review_other_goals === true && value.intent !== "daily_plan" ? { review_other_goals: true } : {}),
    ...(value.use_related_learning === true ? { use_related_learning: true } : {}),
    ...(typeof value.preparation_end === "string" ? { preparation_end: value.preparation_end } : {}),
    ...(value.intent === "daily_plan" ? { daily_sources: sources } : {}),
    ...(value.intent === "exam_prep" ? { exam_inputs: exams } : {}),
    goal_ids: value.goal_ids as string[], intent: value.intent,
    period_start: value.period_start as string, period_end: value.period_end as string,
    day_budgets: days.sort((a, b) => a.date.localeCompare(b.date)),
    desired_outcome: value.desired_outcome.trim(), constraints: value.constraints.trim(),
    rules: { transition_minutes: inputRules.transition_minutes as number, break_minutes: inputRules.break_minutes as number,
      break_after_minutes: inputRules.break_after_minutes as number, method_minimums: methodMinimums,
      max_focus_goals: inputRules.max_focus_goals as number, carryover: inputRules.carryover as boolean },
  };
}

function fixedBlocksForDate(date: string, context: CoachingContext): { start: number; end: number }[] {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  const dayEpoch = Date.parse(`${date}T00:00:00Z`);
  return [
    ...(context.blocked_events ?? []).map((block) => ({
      start: (Date.parse(`${block.start}:00Z`) - dayEpoch) / 60_000,
      end: (Date.parse(`${block.end}:00Z`) - dayEpoch) / 60_000,
    })),
    ...(context.recurring_blocks ?? [])
      .filter((block) => block.day_of_week === weekday && (!block.effective_from || block.effective_from <= date) && (!block.effective_to || block.effective_to >= date))
      .map((block) => ({ start: minuteOfDay(block.start_time.slice(0, 5)), end: minuteOfDay(block.end_time.slice(0, 5)) })),
  ];
}

function clockFromMinutes(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function fitProposalSchedule(value: unknown, request: CoachingRequest, context: CoachingContext): unknown {
  if (!record(value) || !Array.isArray(value.items)) return value;
  const fitted: Record<string, unknown>[] = [];
  const byDate = new Map<string, { start: number; end: number; goal: string }[]>();
  const sourceItems = value.items.map((raw, index) => ({ raw, index })).sort((a, b) => {
    if (!record(a.raw) || !record(b.raw)) return a.index - b.index;
    return `${String(a.raw.planned_date)} ${String(a.raw.start_time)}`.localeCompare(`${String(b.raw.planned_date)} ${String(b.raw.start_time)}`);
  });
  for (const { raw } of sourceItems) {
    if (!record(raw) || typeof raw.planned_date !== "string" || typeof raw.start_time !== "string" ||
      !clock.test(raw.start_time) || typeof raw.goal_id !== "string" || !Number.isInteger(raw.planned_minutes)) {
      fitted.push(raw as Record<string, unknown>);
      continue;
    }
    const day = request.day_budgets.find((entry) => entry.date === raw.planned_date);
    const duration = raw.planned_minutes as number;
    if (!day || duration < 15 || duration > 180) {
      fitted.push(raw);
      continue;
    }
    const fixed = fixedBlocksForDate(raw.planned_date, context);
    const scheduled = [...(byDate.get(raw.planned_date) ?? [])];
    const minimum = typeof raw.method_code === "string" && Object.hasOwn(request.rules.method_minimums, raw.method_code)
      ? request.rules.method_minimums[raw.method_code] : 15;
    if (duration < minimum) { fitted.push(raw); continue; }
    const preferred = minuteOfDay(raw.start_time);
    const candidates = [preferred];
    for (const window of day.windows) {
      const from = minuteOfDay(window.start), to = minuteOfDay(window.end);
      for (let start = from; start + minimum <= to; start += 5) candidates.push(start);
    }
    let remaining = duration;
    const pieces: Record<string, unknown>[] = [];
    while (remaining >= minimum) {
      let placed = false;
      for (const start of [...new Set(candidates)]) {
        for (let length = Math.min(remaining, request.rules.break_after_minutes); length >= minimum; length--) {
          if (remaining !== length && remaining - length < minimum) continue;
          const end = start + length;
          if (!day.windows.some((window) => start >= minuteOfDay(window.start) && end <= minuteOfDay(window.end))) continue;
          if (fixed.some((block) => start < block.end + request.rules.transition_minutes && end > block.start - request.rules.transition_minutes)) continue;
          if (scheduled.reduce((total, item) => total + item.end - item.start, 0) + length > day.minutes) continue;
          if (!scheduled.every((item) => {
            const gap = Math.max(request.rules.break_minutes, item.goal === raw.goal_id ? 0 : request.rules.transition_minutes);
            return end + gap <= item.start || start >= item.end + gap;
          })) continue;
          scheduled.push({ start, end, goal: raw.goal_id });
          pieces.push({ ...raw, start_time: clockFromMinutes(start), planned_minutes: length });
          remaining -= length;
          placed = true;
          break;
        }
        if (placed) break;
      }
      if (!placed) break;
    }
    if (remaining || fitted.length + pieces.length > 30 || (raw.completion_criteria !== undefined && pieces.length > 1)) throw new CoachingError("추천한 학습 분량을 선택한 시간대와 휴식 조건에 맞춰 배치하지 못했습니다. 항목을 더 작게 나누고 각각의 완료 기준을 정해 다시 생성해 주세요.", 502);
    byDate.set(raw.planned_date, scheduled);
    fitted.push(...pieces);
  }
  fitted.sort((a, b) => `${String(a.planned_date)} ${String(a.start_time)}`.localeCompare(`${String(b.planned_date)} ${String(b.start_time)}`));
  return { ...value, items: fitted };
}

export function validateProposal(value: unknown, request: CoachingRequest, context: CoachingContext): Proposal {
  if (!record(value) || typeof value.summary !== "string" || !value.summary.trim() || value.summary.length > 1000 ||
    !Array.isArray(value.items) || value.items.length > 30 || !Array.isArray(value.deferred_goals) || value.deferred_goals.length > 5) throw new CoachingError("Invalid model response", 502);
  const goals = new Set(context.goals.map((goal) => goal.id));
  const topics = new Map(context.topics.filter((topic) => topic.status === "confirmed").map((topic) => [topic.id, topic.goal_id]));
  const methods = new Set(context.methods.filter((method) => method.active).map((method) => method.code));
  const budgets = new Map(request.day_budgets.map((day) => [day.date, day.minutes]));
  const used = new Map<string, number>();
  const scheduled = new Map<string, { start: number; end: number; goal: string }[]>();
  const items: ProposedItem[] = [];
  const allowedEvidence = evidenceIds(context);
  const checkedEvidence = (value: unknown, allowed = allowedEvidence): string[] => {
    if (!Array.isArray(value) || value.length > 6 || value.some(id => typeof id !== "string" || !allowed.has(id))) throw new CoachingError("출처가 확인되지 않은 학습 근거입니다.", 502);
    return [...new Set(value)] as string[];
  };
  for (const raw of value.items) {
    if (!record(raw) || typeof raw.goal_id !== "string" || !goals.has(raw.goal_id) ||
      (raw.topic_id !== null && (typeof raw.topic_id !== "string" || topics.get(raw.topic_id) !== raw.goal_id)) ||
      typeof raw.method_code !== "string" || !methods.has(raw.method_code) ||
      typeof raw.title !== "string" || !raw.title.trim() || raw.title.length > 200 ||
      typeof raw.reason !== "string" || raw.reason.length > 500 ||
      !Number.isInteger(raw.planned_minutes) || (raw.planned_minutes as number) < 15 || (raw.planned_minutes as number) > 180 ||
      typeof raw.planned_date !== "string" || !budgets.has(raw.planned_date) ||
      typeof raw.start_time !== "string" || !clock.test(raw.start_time)) {
      throw new CoachingError("Plan item violates goal, topic, method or date constraints", 502);
    }
    const date = raw.planned_date;
    const start = minuteOfDay(raw.start_time);
    const end = start + (raw.planned_minutes as number);
    const exam = request.exam_inputs?.find((entry) => entry.goal_id === raw.goal_id);
    if (exam) {
      const parts = new Intl.DateTimeFormat("en-CA", { timeZone: context.timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(exam.exam_at));
      const part = (type: string) => parts.find((p) => p.type === type)?.value;
      const examLocal = `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
      if (`${date}T${clockFromMinutes(end)}` > examLocal) throw new CoachingError("시험 시작 전 시간에만 대비 계획을 배치할 수 있습니다.", 502);
    }
    const day = request.day_budgets.find((entry) => entry.date === date)!;
    const minimum = Object.hasOwn(request.rules.method_minimums, raw.method_code) ? request.rules.method_minimums[raw.method_code] : 15;
    if ((raw.planned_minutes as number) < minimum || (raw.planned_minutes as number) > request.rules.break_after_minutes ||
      !day.windows.some((window) => start >= minuteOfDay(window.start) && end <= minuteOfDay(window.end))) {
      throw new CoachingError("학습 블록이 방법별 최소시간·연속 학습 상한 또는 선택한 시간대를 벗어났습니다.", 502);
    }
    const blocks = fixedBlocksForDate(date, context);
    if (blocks.some((block) => start < block.end + request.rules.transition_minutes && end > block.start - request.rules.transition_minutes)) {
      throw new CoachingError("Plan conflicts with a fixed commitment or transition time", 502);
    }
    const minutes = (used.get(date) ?? 0) + (raw.planned_minutes as number);
    if (minutes > budgets.get(date)!) throw new CoachingError("Plan exceeds confirmed daily availability", 502);
    used.set(date, minutes);
    scheduled.set(date, [...(scheduled.get(date) ?? []), { start, end, goal: raw.goal_id }]);
    if (raw.completion_criteria !== undefined) {
      const c = raw.completion_criteria;
      if (!record(c) || typeof c.task_scope !== "string" || !c.task_scope.trim() || c.task_scope.length > 500 ||
        typeof c.observable_check !== "string" || !c.observable_check.trim() || c.observable_check.length > 500) throw new CoachingError("학습 범위와 완료 기준을 확인하지 못했습니다.", 502);
      raw.completion_criteria = { schema_version: 1, task_scope: c.task_scope.trim(), observable_check: c.observable_check.trim(), evidence_ids: checkedEvidence(c.evidence_ids, evidenceIds(context, raw.goal_id)) };
    }
    items.push(raw as unknown as ProposedItem);
  }
  if (items.length === 0) throw new CoachingError("Model returned no plan items", 502);
  for (const intervals of scheduled.values()) {
    intervals.sort((a, b) => a.start - b.start);
    let continuous = 0;
    for (let i = 0; i < intervals.length; i++) {
      const current = intervals[i];
      const previous = intervals[i - 1];
      if (previous) {
        const gap = current.start - previous.end;
        const required = previous.goal !== current.goal ? request.rules.transition_minutes : 0;
        if (gap < required || gap < 0) throw new CoachingError("Plan items overlap or lack transition time", 502);
        continuous = gap >= Math.max(1, request.rules.break_minutes) ? 0 : continuous;
      }
      continuous += current.end - current.start;
      if (continuous > request.rules.break_after_minutes) throw new CoachingError("Plan lacks required break", 502);
    }
  }
  const selected = new Set(items.map((item) => item.goal_id));
  for (const intervals of scheduled.values()) {
    if (new Set(intervals.map((interval) => interval.goal)).size > request.rules.max_focus_goals) {
      throw new CoachingError("Plan exceeds daily focus goal limit", 502);
    }
  }
  const deferred: DeferredGoal[] = [];
  const deferredIds = new Set<string>();
  for (const raw of value.deferred_goals) {
    let reconsiderDay: number;
    try { reconsiderDay = record(raw) ? dayNumber(raw.reconsider_on) : NaN; }
    catch { reconsiderDay = NaN; }
    if (!record(raw) || typeof raw.goal_id !== "string" || !goals.has(raw.goal_id) || selected.has(raw.goal_id) || deferredIds.has(raw.goal_id) ||
      typeof raw.reason !== "string" || !raw.reason.trim() || raw.reason.length > 500 ||
      !Number.isFinite(reconsiderDay) || reconsiderDay < dayNumber(request.period_start) || reconsiderDay > dayNumber(request.period_end) + 30) {
      throw new CoachingError("Invalid deferred goal", 502);
    }
    deferredIds.add(raw.goal_id);
    deferred.push(raw as DeferredGoal);
  }
  if (request.rules.carryover && request.goal_ids.some((id) => !selected.has(id) && !deferredIds.has(id))) throw new CoachingError("Unplanned goal lacks a carryover reason", 502);
  let advisories: Advisory[] | undefined;
  if (value.advisories !== undefined) {
    if (!Array.isArray(value.advisories) || value.advisories.length > 5) throw new CoachingError("추가 검토 제안이 너무 많습니다.", 502);
    const reviewGoals = new Set([...goals, ...(context.review?.candidates ?? []).map(g => g.goal_id)]);
    advisories = value.advisories.map(raw => {
      if (!record(raw) || typeof raw.goal_id !== "string" || !reviewGoals.has(raw.goal_id) ||
        typeof raw.reason !== "string" || !raw.reason.trim() || raw.reason.length > 500 ||
        typeof raw.suggested_action !== "string" || !raw.suggested_action.trim() || raw.suggested_action.length > 500) throw new CoachingError("추가 검토 대상이나 이유를 확인하지 못했습니다.", 502);
      return { goal_id: raw.goal_id, reason: raw.reason.trim(), suggested_action: raw.suggested_action.trim(), evidence_ids: checkedEvidence(raw.evidence_ids, evidenceIds(context, raw.goal_id)) };
    });
  }
  if (value.preparation_outlook !== undefined && (typeof value.preparation_outlook !== "string" || value.preparation_outlook.length > 1000 || (!request.preparation_end && value.preparation_outlook))) throw new CoachingError("시험 준비 전망 범위를 확인해 주세요.", 502);
  return { summary: value.summary.trim(), items, deferred_goals: deferred,
    ...(advisories ? { advisories } : {}), ...(typeof value.preparation_outlook === "string" ? { preparation_outlook: value.preparation_outlook } : {}) };
}

export class CoachingError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

export const COACHING_POLICY_VERSION = "time-window-v3";

export type TimeWindow = { start: string; end: string };
export type DayBudget = { date: string; minutes: number; windows: TimeWindow[] };
export type PlanningRules = { transition_minutes: number; break_minutes: number; break_after_minutes: number; method_minimums: Record<string, number>; max_focus_goals: number; carryover: boolean };
export type CoachingRequest = {
  goal_ids: string[];
  intent: string;
  period_start: string;
  period_end: string;
  day_budgets: DayBudget[];
  desired_outcome: string;
  constraints: string;
  rules: PlanningRules;
};
export type Goal = { id: string; title: string; goal_type: string; target_date: string | null; importance: number; metadata: Record<string, unknown> };
export type Topic = { id: string; goal_id: string; title: string; status: string };
export type Method = { code: string; display_name: string; active: boolean };
export type Deadline = { goal_id: string | null; title: string; due_at: string | null; starts_at: string | null; event_type: string };
export type Session = { goal_id: string; topic_id: string | null; actual_minutes: number; completion_status: string; started_at: string | null; metadata: Record<string, unknown> };
export type ExistingItem = { goal_id: string; topic_id: string | null; title: string; planned_minutes: number; scheduled_start: string | null; status: string; metadata: Record<string, unknown> };
export type BlockedInterval = { start: string; end: string; label: string };
export type RecurringBlock = { day_of_week: number; start_time: string; end_time: string; effective_from: string | null; effective_to: string | null; label: string };
export type CoachingContext = {
  timezone: string;
  goals: Goal[];
  topics: Topic[];
  methods: Method[];
  deadlines: Deadline[];
  sessions: Session[];
  existing_items: ExistingItem[];
  blocked_events?: BlockedInterval[];
  recurring_blocks?: RecurringBlock[];
};
export type ProposedItem = {
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
export type Proposal = { summary: string; items: ProposedItem[]; deferred_goals: DeferredGoal[] };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isoDay = /^\d{4}-\d{2}-\d{2}$/;
const intents = new Set(["weekly_plan", "daily_plan", "exam_prep", "topic_review", "progress_check"]);
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
  if (!Array.isArray(value.goal_ids) || value.goal_ids.length < 1 || value.goal_ids.length > 5 ||
    new Set(value.goal_ids).size !== value.goal_ids.length || !value.goal_ids.every((id) => typeof id === "string" && uuid.test(id))) {
    throw new CoachingError("Select 1 to 5 unique goals");
  }
  if (typeof value.intent !== "string" || !intents.has(value.intent)) throw new CoachingError("Invalid intent");
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
    goal_ids: value.goal_ids as string[], intent: value.intent,
    period_start: value.period_start as string, period_end: value.period_end as string,
    day_budgets: days.sort((a, b) => a.date.localeCompare(b.date)),
    desired_outcome: value.desired_outcome.trim(), constraints: value.constraints.trim(),
    rules: { transition_minutes: inputRules.transition_minutes as number, break_minutes: inputRules.break_minutes as number,
      break_after_minutes: inputRules.break_after_minutes as number, method_minimums: methodMinimums,
      max_focus_goals: inputRules.max_focus_goals as number, carryover: inputRules.carryover as boolean },
  };
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
    const day = request.day_budgets.find((entry) => entry.date === date)!;
    const minimum = Object.hasOwn(request.rules.method_minimums, raw.method_code) ? request.rules.method_minimums[raw.method_code] : 15;
    if ((raw.planned_minutes as number) < minimum || (raw.planned_minutes as number) > request.rules.break_after_minutes ||
      !day.windows.some((window) => start >= minuteOfDay(window.start) && end <= minuteOfDay(window.end))) {
      throw new CoachingError("Plan item violates method minimum or confirmed time window", 502);
    }
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    const dayEpoch = Date.parse(`${date}T00:00:00Z`);
    const blocks = [
      ...(context.blocked_events ?? []).map((block) => ({
        start: (Date.parse(`${block.start}:00Z`) - dayEpoch) / 60_000,
        end: (Date.parse(`${block.end}:00Z`) - dayEpoch) / 60_000,
      })),
      ...(context.recurring_blocks ?? []).filter((block) => block.day_of_week === weekday && (!block.effective_from || block.effective_from <= date) && (!block.effective_to || block.effective_to >= date))
        .map((block) => ({ start: minuteOfDay(block.start_time.slice(0, 5)), end: minuteOfDay(block.end_time.slice(0, 5)) })),
    ];
    if (blocks.some((block) => start < block.end + request.rules.transition_minutes && end > block.start - request.rules.transition_minutes)) {
      throw new CoachingError("Plan conflicts with a fixed commitment or transition time", 502);
    }
    const minutes = (used.get(date) ?? 0) + (raw.planned_minutes as number);
    if (minutes > budgets.get(date)!) throw new CoachingError("Plan exceeds confirmed daily availability", 502);
    used.set(date, minutes);
    scheduled.set(date, [...(scheduled.get(date) ?? []), { start, end, goal: raw.goal_id }]);
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
  return { summary: value.summary.trim(), items, deferred_goals: deferred };
}

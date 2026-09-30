export class CoachingError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

export const COACHING_POLICY_VERSION = "date-budget-v1";

export type DayBudget = { date: string; minutes: number };
export type CoachingRequest = {
  goal_ids: string[];
  intent: string;
  period_start: string;
  period_end: string;
  day_budgets: DayBudget[];
  desired_outcome: string;
  constraints: string;
};
export type Goal = { id: string; title: string; goal_type: string; target_date: string | null; importance: number; metadata: Record<string, unknown> };
export type Topic = { id: string; goal_id: string; title: string; status: string };
export type Method = { code: string; display_name: string; active: boolean };
export type Deadline = { goal_id: string | null; title: string; due_at: string | null; starts_at: string | null; event_type: string };
export type Session = { goal_id: string; topic_id: string | null; actual_minutes: number; completion_status: string; started_at: string | null; metadata: Record<string, unknown> };
export type ExistingItem = { goal_id: string; topic_id: string | null; title: string; planned_minutes: number; scheduled_start: string | null; status: string; metadata: Record<string, unknown> };
export type CoachingContext = {
  timezone: string;
  goals: Goal[];
  topics: Topic[];
  methods: Method[];
  deadlines: Deadline[];
  sessions: Session[];
  existing_items: ExistingItem[];
};
export type ProposedItem = {
  goal_id: string;
  topic_id: string | null;
  method_code: string;
  title: string;
  planned_date: string;
  planned_minutes: number;
  reason: string;
};
export type Proposal = { summary: string; items: ProposedItem[] };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isoDay = /^\d{4}-\d{2}-\d{2}$/;
const intents = new Set(["weekly_plan", "daily_plan", "exam_prep", "topic_review", "progress_check"]);
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

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
    return { date: entry.date as string, minutes: entry.minutes as number };
  });
  if (new Set(days.map((entry) => entry.date)).size !== days.length) throw new CoachingError("Duplicate availability date");
  if (!days.some((entry) => entry.minutes >= 15)) throw new CoachingError("At least one study day is required");
  return {
    goal_ids: value.goal_ids as string[], intent: value.intent,
    period_start: value.period_start as string, period_end: value.period_end as string,
    day_budgets: days.sort((a, b) => a.date.localeCompare(b.date)),
    desired_outcome: value.desired_outcome.trim(), constraints: value.constraints.trim(),
  };
}

export function validateProposal(value: unknown, request: CoachingRequest, context: CoachingContext): Proposal {
  if (!record(value) || typeof value.summary !== "string" || !value.summary.trim() || value.summary.length > 1000 ||
    !Array.isArray(value.items) || value.items.length > 30) throw new CoachingError("Invalid model response", 502);
  const goals = new Set(context.goals.map((goal) => goal.id));
  const topics = new Map(context.topics.filter((topic) => topic.status === "confirmed").map((topic) => [topic.id, topic.goal_id]));
  const methods = new Set(context.methods.filter((method) => method.active).map((method) => method.code));
  const budgets = new Map(request.day_budgets.map((day) => [day.date, day.minutes]));
  const used = new Map<string, number>();
  const items: ProposedItem[] = [];
  for (const raw of value.items) {
    if (!record(raw) || typeof raw.goal_id !== "string" || !goals.has(raw.goal_id) ||
      (raw.topic_id !== null && (typeof raw.topic_id !== "string" || topics.get(raw.topic_id) !== raw.goal_id)) ||
      typeof raw.method_code !== "string" || !methods.has(raw.method_code) ||
      typeof raw.title !== "string" || !raw.title.trim() || raw.title.length > 200 ||
      typeof raw.reason !== "string" || raw.reason.length > 500 ||
      !Number.isInteger(raw.planned_minutes) || (raw.planned_minutes as number) < 15 || (raw.planned_minutes as number) > 180 ||
      typeof raw.planned_date !== "string" || !budgets.has(raw.planned_date)) {
      throw new CoachingError("Plan item violates goal, topic, method or date constraints", 502);
    }
    const date = raw.planned_date;
    const minutes = (used.get(date) ?? 0) + (raw.planned_minutes as number);
    if (minutes > budgets.get(date)!) throw new CoachingError("Plan exceeds confirmed daily availability", 502);
    used.set(date, minutes);
    items.push(raw as unknown as ProposedItem);
  }
  if (items.length === 0) throw new CoachingError("Model returned no plan items", 502);
  return { summary: value.summary.trim(), items };
}

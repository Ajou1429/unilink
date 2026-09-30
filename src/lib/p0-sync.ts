import { getSupabaseBrowserClient } from "./supabase-client";
import { getStorageUser, privateStorage, PRIVATE_STORAGE_CHANGED_EVENT } from "./private-storage";
import { getAllStoredCourses, COURSES_STORAGE_KEY, COURSE_PLANS_STORAGE_KEY, getCoursePlans } from "./course-storage";
import { getPersonalStudies, getAllPersonalStudyPlans, PERSONAL_STUDIES_STORAGE_KEY, PERSONAL_STUDY_PLANS_STORAGE_KEY } from "./personal-study-storage";
import { getWeeklyStudyPlans, getMonthlyStudyGoals, getMonthlyStudyPlans, WEEKLY_STUDY_PLANS_STORAGE_KEY, MONTHLY_STUDY_GOALS_STORAGE_KEY, MONTHLY_STUDY_PLANS_STORAGE_KEY } from "./study-storage";
import { getMonthlyEvents, getWorkSchedules, getCourseSessions, MONTHLY_EVENTS_STORAGE_KEY, WORK_SCHEDULES_STORAGE_KEY, COURSE_SESSIONS_STORAGE_KEY } from "./timetable-storage";

// Legacy browser records have several unrelated UI shapes; normalize them at the database boundary.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
type Bucket = Record<string, Row[]>;

const DAY_INDEX: Record<string, number> = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 };
const DAY_NAME = ["일", "월", "화", "수", "목", "금", "토"];
let timer: number | undefined;
let generation = 0;
let serial: Promise<unknown> = Promise.resolve();
const OUTBOX = "unilink:p0-outbox-v1";
type Change = { ids: string[]; revision: string };
type Client = NonNullable<ReturnType<typeof getSupabaseBrowserClient>>;

function json(key: string): Row[] {
  try {
    const value = JSON.parse(privateStorage.getItem(key) ?? "[]");
    return Array.isArray(value) ? value.filter((row) => row && typeof row === "object") : [];
  } catch { return []; }
}

async function stableId(userId: string, type: string, legacyId: string): Promise<string> {
  const input = new TextEncoder().encode(`${userId}:${type}:${legacyId}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", input));
  digest[6] = (digest[6] & 0x0f) | 0x50;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  const hex = Array.from(digest.slice(0, 16), (part) => part.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

function legacy(row: Row, kind: string, bucket: string) {
  return { schema_version: 1, legacy_kind: kind, legacy_bucket: bucket, legacy_record: row };
}

function dateTime(date: string, time: string) {
  return date && time ? `${date}T${time}:00+09:00` : null;
}

function weekBounds(dateValue: string) {
  const date = new Date(`${dateValue}T00:00:00`);
  if (!Number.isFinite(date.getTime())) return null;
  date.setDate(date.getDate() - date.getDay());
  const format = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  const start = format(date);
  date.setDate(date.getDate() + 6);
  return { start, end: format(date) };
}

async function collect(userId: string, preferredBucket?: string, changedIds: string[] = []): Promise<Bucket> {
  const out: Bucket = {};
  const add = (table: string, row: Row) => { (out[table] ??= []).push(row); };
  const uid = async (table: string, key: string) => stableId(userId, table, String(key));

  const courses = getAllStoredCourses();
  // Capture this account's complete input before the first asynchronous ID calculation.
  const personalStudies = getPersonalStudies();
  const monthGoals = getMonthlyStudyGoals();
  const events = getMonthlyEvents();
  const works = getWorkSchedules();
  const sessions = getCourseSessions();
  const coursePlans = courses.flatMap((course) => getCoursePlans(course.id));
  const weeklyPlans = getWeeklyStudyPlans();
  const monthlyPlans = getMonthlyStudyPlans();
  const personalPlans = getAllPersonalStudyPlans();
  const courseIds = new Map<string, string>();
  const goalIds = new Map<string, string>();
  for (const course of courses) courseIds.set(course.id, await uid("courses", course.id));
  for (const course of courses) {
    const courseId = courseIds.get(course.id)!;
    const goalId = await uid("course-goal", course.id);
    goalIds.set(course.id, goalId);
    add("courses", { id: courseId, user_id: userId, name: course.name, term: course.term || "unknown",
      professor: course.professor || null, credits: Number.isFinite(course.credits) && course.credits > 0 ? course.credits : null,
      course_type: course.courseType ?? null, catalog_source: course.catalogSource ?? null,
      catalog_subject_id: course.catalogSubjectId ?? null, course_code: course.courseCode ?? null,
      registration_number: course.registrationNumber?.trim() || null, location: course.location || null, status: "active",
      metadata: legacy(course, "course", COURSES_STORAGE_KEY) });
    add("learning_goals", { id: goalId, user_id: userId, goal_type: "course", title: course.name,
      course_id: courseId, target_date: null, importance: 3, status: "active", completed_at: null,
      metadata: legacy({ courseId: course.id }, "course-goal", COURSES_STORAGE_KEY) });
    const schedules = course.schedules?.length ? course.schedules : course.days?.map((day) => ({
      day, startTime: course.startTime, endTime: course.endTime, location: course.location,
    })) ?? [];
    const seenSchedules = new Set<string>();
    for (const schedule of schedules) {
      const day = DAY_INDEX[schedule.day];
      if (day === undefined || !schedule.startTime || !schedule.endTime || schedule.startTime >= schedule.endTime) continue;
      const legacyKey = `${course.id}:${schedule.day}:${schedule.startTime}:${schedule.endTime}`;
      if (seenSchedules.has(legacyKey)) continue;
      seenSchedules.add(legacyKey);
      add("course_schedules", { id: await uid("course-schedules", legacyKey), user_id: userId, course_id: courseId,
        day_of_week: day, start_time: schedule.startTime, end_time: schedule.endTime, location: schedule.location || null,
        metadata: legacy({ courseId: course.id, ...schedule }, "course-schedule", COURSES_STORAGE_KEY) });
    }
  }

  for (const study of personalStudies) {
    const id = await uid("learning_goals", study.id);
    goalIds.set(`personal:${study.id}`, id);
    add("learning_goals", { id, user_id: userId, goal_type: "personal", title: study.title, course_id: null,
      target_date: study.targetDate || null, importance: 3,
      status: study.status === "completed" ? "completed" : study.status === "cancelled" ? "cancelled" : "active",
      completed_at: study.status === "completed" ? (study.completedAt || new Date().toISOString()) : null,
      metadata: { ...legacy(study, "personal-study", PERSONAL_STUDIES_STORAGE_KEY), completed_at_estimated: study.status === "completed" && !study.completedAt } });
  }

  for (const goal of monthGoals) {
    const id = await uid("monthly-goal", goal.id);
    add("learning_goals", { id, user_id: userId, goal_type: "personal", title: goal.title, course_id: null,
      target_date: null, importance: 3, status: goal.isCompleted ? "completed" : "active",
      completed_at: goal.isCompleted ? new Date().toISOString() : null,
      metadata: { ...legacy(goal, "monthly-goal", MONTHLY_STUDY_GOALS_STORAGE_KEY), completed_at_estimated: !!goal.isCompleted } });
  }

  for (const event of events) {
    const start = dateTime(event.date, event.startTime);
    const end = dateTime(event.date, event.endTime);
    if (!start || !end || end <= start) continue;
    const deadline = event.kind === "personal-deadline" || event.kind === "personal-plan-deadline" || event.id.startsWith("course-plan-event-");
    add("calendar_events", { id: await uid("calendar-events", event.id), user_id: userId,
      goal_id: event.personalStudyId ? goalIds.get(`personal:${event.personalStudyId}`) ?? null : null,
      event_type: "other", title: event.title, starts_at: deadline ? null : start, ends_at: deadline ? null : end, due_at: deadline ? end : null,
      is_blocking: !deadline, importance: null, status: "scheduled", metadata: legacy(event, "monthly-event", MONTHLY_EVENTS_STORAGE_KEY) });
  }

  for (const work of works) {
    const slots = work.schedules?.length ? work.schedules : work.days?.map((day) => ({ day,
      startTime: work.startTime, endTime: work.endTime, location: work.location })) ?? [];
    for (const slot of slots) {
      const day = DAY_INDEX[slot.day];
      if (day === undefined || !slot.startTime || !slot.endTime || slot.startTime >= slot.endTime) continue;
      add("recurring_commitments", { id: await uid("recurring-commitments", `${work.id}:${day}:${slot.startTime}:${slot.endTime}`),
        user_id: userId, title: work.title, commitment_type: "other", day_of_week: day,
        start_time: slot.startTime, end_time: slot.endTime, effective_from: null, effective_to: null,
        is_blocking: true, metadata: legacy({ work, slot }, "work-schedule", WORK_SCHEDULES_STORAGE_KEY) });
    }
  }

  for (const session of sessions) {
    const courseId = courseIds.get(session.courseId);
    const goalId = goalIds.get(session.courseId);
    if (!courseId || !goalId || !session.date) continue;
    const start = dateTime(session.date, session.startTime);
    const end = dateTime(session.date, session.endTime);
    if (start && end && end < start) continue;
    add("course_sessions", { id: await uid("course-sessions", session.id), user_id: userId,
      course_id: courseId, session_date: session.date, started_at: start, ended_at: end,
      pace: null,
      memo: [session.progressTitle, session.progressMemo].filter(Boolean).join("\n") || null,
      metadata: legacy(session, "course-session", COURSE_SESSIONS_STORAGE_KEY) });
  }

  if ([...weeklyPlans, ...monthlyPlans].some((plan) => plan.courseId === "self")) {
    const id = await uid("planner-goal", "self");
    goalIds.set("self", id);
    add("learning_goals", { id, user_id: userId, goal_type: "personal", title: "개인 학습", course_id: null,
      status: "active", importance: 3, metadata: legacy({ id: "self" }, "planner-goal", WEEKLY_STUDY_PLANS_STORAGE_KEY) });
  }
  const sharedPlans = new Map(coursePlans.map((plan) => [plan.id, plan]));
  for (const plan of weeklyPlans) sharedPlans.set(plan.id, { ...sharedPlans.get(plan.id), ...plan });
  if (preferredBucket === COURSE_PLANS_STORAGE_KEY) {
    for (const plan of coursePlans) sharedPlans.set(plan.id, { ...sharedPlans.get(plan.id), ...plan });
  }
  if (preferredBucket === COURSE_PLANS_STORAGE_KEY || preferredBucket === WEEKLY_STUDY_PLANS_STORAGE_KEY) {
    const source = preferredBucket === COURSE_PLANS_STORAGE_KEY ? coursePlans : weeklyPlans;
    for (const id of changedIds) if (!source.some((plan) => plan.id === id)) sharedPlans.delete(id);
  }
  for (const plan of sharedPlans.values()) await addPlanItem(plan, "shared-plan", "weekly-plan", WEEKLY_STUDY_PLANS_STORAGE_KEY, plan.courseId);
  for (const plan of monthlyPlans) {
    if (plan.id.startsWith("weekly-")) continue;
    await addPlanItem(plan, "monthly-plan", "monthly-plan", MONTHLY_STUDY_PLANS_STORAGE_KEY, plan.courseId);
  }
  for (const plan of personalPlans) await addPlanItem(plan, "personal-plan", "personal-plan", PERSONAL_STUDY_PLANS_STORAGE_KEY, `personal:${plan.studyId}`);

  async function addPlanItem(plan: Row, kind: string, horizon: string, bucket: string, courseKey: string) {
    const goalId = goalIds.get(courseKey);
    const courseId = courseIds.get(courseKey);
    const personalGoalId = courseKey.startsWith("personal:") ? goalIds.get(courseKey) : undefined;
    const resolvedGoal = goalId ?? personalGoalId ?? (courseKey && courseKey !== "self" && !courseKey.startsWith("personal:")
      ? await uid("course-goal", courseKey) : undefined);
    if (!resolvedGoal) throw new Error(`Plan ${plan.id} has no matching learning goal.`);
    const title = String(plan.title ?? "").trim();
    if (!title) throw new Error(`Plan ${plan.id} has no title.`);
    const rawDate = plan.dueDate || plan.weekStart || plan.createdAt?.slice(0, 10);
    const dateValue = typeof rawDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) && Number.isFinite(new Date(`${rawDate}T00:00:00`).getTime())
      ? rawDate
      : new Date().toISOString().slice(0, 10);
    const bounds = horizon === "weekly-plan" ? weekBounds(plan.weekStart || dateValue) : null;
    const periodStart = bounds?.start ?? dateValue.slice(0, 10);
    const periodEnd = bounds?.end ?? periodStart;
    const groupKey = `${kind}:${plan.id}`;
    const planId = await uid("study-plans", groupKey);
    const metadata = legacy(plan, kind, bucket);
    const aliases = kind === "shared-plan" ? [WEEKLY_STUDY_PLANS_STORAGE_KEY, COURSE_PLANS_STORAGE_KEY] : [bucket];
    add("study_plans", { id: planId, user_id: userId, source_type: "manual",
      plan_horizon: horizon === "weekly-plan" ? "weekly" : horizon === "monthly-plan" ? "monthly" : horizon === "personal-plan" ? "custom" : "daily",
      period_start: periodStart, period_end: periodEnd,
      status: plan.isCompleted ? "completed" : "active", parent_plan_id: null, revision_no: 1,
      idempotency_key: `browser:${kind}:${plan.id}`, request_metadata: { ...metadata, legacy_buckets: aliases },
      approved_at: plan.createdAt || new Date().toISOString() });
    const itemId = await uid("study-plan-items", groupKey);
    add("study_plan_items", { id: itemId, user_id: userId, plan_id: planId, goal_id: resolvedGoal, topic_id: null,
      method_code: "concept_review", title, planned_minutes: 30, scheduled_start: null, scheduled_end: null,
      priority_rank: null, reason: null, completion_criteria: { schema_version: 1 },
      status: plan.isCompleted ? "completed" : "planned",
      metadata: { ...metadata, legacy_buckets: aliases, estimated_minutes: true, estimated_method: true, course_id: courseId ?? null } });
  }

  return out;
}

function metadataOf(table: string, row: Row): Row {
  return (table === "study_plans" ? row.request_metadata : row.metadata) ?? {};
}

function recordOf(table: string, row: Row): Row {
  const metadata = metadataOf(table, row);
  if (metadata.legacy_record) return metadata.legacy_record;
  // Read the flattened format emitted by the initial, unpublished bridge too.
  const { schema_version, legacy_kind, legacy_bucket, legacy_buckets, deleted, ...record } = metadata;
  void schema_version; void legacy_kind; void legacy_bucket; void legacy_buckets; void deleted;
  return record;
}

function belongs(metadata: Row, bucket: string) {
  return metadata.legacy_bucket === bucket || metadata.legacy_buckets?.includes(bucket);
}

function recordIds(table: string, row: Row): string[] {
  const record = recordOf(table, row);
  return [record.id, record.courseId, record.studyId, record.work?.id].filter(Boolean).map(String);
}

class InterruptedSync extends Error {}
function assertAccount(userId: string, epoch: number) {
  if (getStorageUser() !== userId || epoch !== generation) throw new InterruptedSync("Account changed during sync.");
}

async function readRows(client: Client, table: string, userId: string, epoch: number): Promise<Row[]> {
  const result: Row[] = [];
  for (let offset = 0; ; offset += 500) {
    assertAccount(userId, epoch);
    const { data, error } = await client.from(table).select("*").eq("user_id", userId).order("id").range(offset, offset + 499);
    if (error) throw error;
    assertAccount(userId, epoch);
    result.push(...(data ?? []));
    if (!data || data.length < 500) return result;
  }
}

function isRemoved(table: string, row: Row) {
  return metadataOf(table, row).deleted === true || row.status === "archived" || row.status === "cancelled";
}

let hydrating = false;
async function pullRemote(userId: string, epoch: number) {
  const client = getSupabaseBrowserClient();
  if (!client) return;
  const specs: [string, string][] = [
    ["courses", COURSES_STORAGE_KEY],
    ["learning_goals", PERSONAL_STUDIES_STORAGE_KEY],
    ["learning_goals", MONTHLY_STUDY_GOALS_STORAGE_KEY],
    ["calendar_events", MONTHLY_EVENTS_STORAGE_KEY],
    ["recurring_commitments", WORK_SCHEDULES_STORAGE_KEY],
    ["course_sessions", COURSE_SESSIONS_STORAGE_KEY],
    ["study_plans", COURSE_PLANS_STORAGE_KEY],
    ["study_plans", WEEKLY_STUDY_PLANS_STORAGE_KEY],
    ["study_plans", MONTHLY_STUDY_PLANS_STORAGE_KEY],
    ["study_plans", PERSONAL_STUDY_PLANS_STORAGE_KEY],
  ];
  const rows: Bucket = {};
  for (const table of new Set([...specs.map(([table]) => table), "course_schedules"])) {
    rows[table] = await readRows(client, table, userId, epoch);
  }
  assertAccount(userId, epoch);
  const dirty = outbox();
  hydrating = true;
  try {
    for (const [table, key] of specs) {
      const managed = rows[table].filter((row) => belongs(metadataOf(table, row), key));
      const active = new Map<string, Row>();
      const removed = new Set<string>();
      for (const row of managed) {
        const record = recordOf(table, row);
        const id = String(table === "recurring_commitments" ? record.work?.id : record.id);
        if (id === "undefined") continue;
        if (isRemoved(table, row)) { removed.add(id); continue; }
        if (table === "recurring_commitments") {
          const work = active.get(id) ?? { ...record.work, title: row.title, schedules: [] };
          work.schedules.push({ ...record.slot, day: DAY_NAME[row.day_of_week],
            startTime: row.start_time.slice(0, 5), endTime: row.end_time.slice(0, 5) });
          active.set(id, work);
        } else if (table === "courses") {
          const schedules = rows.course_schedules.filter((slot) => slot.course_id === row.id).map((slot) => ({
            day: DAY_NAME[slot.day_of_week], startTime: slot.start_time.slice(0, 5),
            endTime: slot.end_time.slice(0, 5), location: slot.location ?? "",
          }));
          active.set(id, { ...record, name: row.name, term: row.term, professor: row.professor ?? "",
            credits: row.credits == null ? record.credits : Number(row.credits), schedules,
            days: [...new Set(schedules.map((slot) => slot.day))],
            startTime: schedules[0]?.startTime ?? record.startTime, endTime: schedules[0]?.endTime ?? record.endTime });
        } else {
          active.set(id, table === "learning_goals" ? { ...record, title: row.title,
            ...(key === PERSONAL_STUDIES_STORAGE_KEY ? { status: row.status, targetDate: row.target_date ?? undefined, completedAt: row.completed_at ?? undefined } : { isCompleted: row.status === "completed" }) }
            : table === "study_plans" ? { ...record, isCompleted: row.status === "completed" } : record);
        }
      }
      for (const work of table === "recurring_commitments" ? active.values() : []) {
        work.days = [...new Set(work.schedules.map((slot: Row) => slot.day))];
        work.startTime = work.schedules[0].startTime;
        work.endTime = work.schedules[0].endTime;
      }
      // Monthly UI entries mirror shared weekly plans, not separate DB tasks.
      if (key === MONTHLY_STUDY_PLANS_STORAGE_KEY) {
        for (const row of rows.study_plans.filter((item) => belongs(metadataOf("study_plans", item), WEEKLY_STUDY_PLANS_STORAGE_KEY))) {
          const record = recordOf("study_plans", row);
          if (!record.id) continue;
          const id = "weekly-" + record.id;
          if (isRemoved("study_plans", row)) removed.add(id);
          else active.set(id, { ...record, id, weekStart: record.weekStart ?? row.period_start,
            month: (record.weekStart ?? row.period_start).slice(0, 7), isCompleted: row.status === "completed" });
        }
      }
      const pending = new Set(dirty[key]?.ids ?? []);
      const merged = new Map(json(key).map((record) => [String(record.id), record]));
      for (const id of removed) if (!active.has(id) && !pending.has(id)) merged.delete(id);
      for (const [id, record] of active) if (!pending.has(id)) merged.set(id, record);
      privateStorage.setItem(key, JSON.stringify([...merged.values()]));
    }
  } finally { hydrating = false; }
}

function outbox(): Record<string, Change> {
  const raw = privateStorage.getItem(OUTBOX);
  if (!raw) return {};
  const value = JSON.parse(raw);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid sync queue.");
  return value;
}

function enqueue(key: string, ids: string[]) {
  const pending = outbox();
  pending[key] = { ids: [...new Set([...(pending[key]?.ids ?? []), ...ids])], revision: crypto.randomUUID() };
  privateStorage.setItem(OUTBOX, JSON.stringify(pending));
}

function runSerial<T>(work: () => Promise<T>): Promise<T> {
  const task = serial.catch(() => undefined).then(work);
  serial = task;
  return task;
}

async function pushLocal(userId: string, epoch: number, change?: { key: string; ids: string[] }) {
  assertAccount(userId, epoch);
  const client = getSupabaseBrowserClient();
  if (!client) throw new Error("Supabase is not configured.");
  const tables = await collect(userId, change?.key, change?.ids);
  assertAccount(userId, epoch);
  const changed = new Set(change?.ids ?? []);
  const selectedTables = change ? tablesForKey(change.key) : Object.keys(tables);
  const { error: preferenceError } = await client.from("user_preferences").upsert({ user_id: userId }, { onConflict: "user_id", ignoreDuplicates: true });
  if (preferenceError) throw preferenceError;
  const order = ["courses", "learning_goals", "course_schedules", "calendar_events", "recurring_commitments", "course_sessions", "study_plans", "study_plan_items"];
  for (const table of order) {
    assertAccount(userId, epoch);
    const rows = tables[table] ?? [];
    const dependencies = change && !selectedTables.includes(table) && ["courses", "learning_goals"].includes(table);
    if (!selectedTables.includes(table) && !dependencies) continue;
    const selected = change && !dependencies
      ? rows.filter((row) => belongs(metadataOf(table, row), change.key) && recordIds(table, row).some((id) => changed.has(id)))
      : rows;
    for (let offset = 0; offset < selected.length; offset += 200) {
      assertAccount(userId, epoch);
      const { error } = await client.from(table).upsert(selected.slice(offset, offset + 200), {
        onConflict: "id", ignoreDuplicates: !change || !!dependencies,
      });
      if (error) throw error;
    }
  }
  if (!change) return;
  for (const table of selectedTables.filter((name) => name !== "study_plan_items")) {
    const current = await readRows(client, table, userId, epoch);
    const desired = new Set((tables[table] ?? []).map((row) => row.id));
    // Only explicit local changes can remove records; an incomplete browser cache cannot delete other devices' data.
    for (const row of current) {
      if (desired.has(row.id) || !belongs(metadataOf(table, row), change.key) ||
          !recordIds(table, row).some((id) => changed.has(id))) continue;
      assertAccount(userId, epoch);
      let patch: Row;
      if (["courses", "learning_goals"].includes(table)) patch = { status: "archived" };
      else if (["calendar_events", "study_plans"].includes(table)) patch = { status: "cancelled" };
      else patch = { metadata: { ...metadataOf(table, row), deleted: true },
        ...(table === "recurring_commitments" ? { is_blocking: false } : {}) };
      const { error } = table === "course_schedules"
        ? await client.from(table).delete().eq("id", row.id).eq("user_id", userId)
        : await client.from(table).update(patch).eq("id", row.id).eq("user_id", userId);
      if (error) throw error;
      if (table === "study_plans") {
        assertAccount(userId, epoch);
        const { error: itemError } = await client.from("study_plan_items").update({ status: "cancelled" }).eq("plan_id", row.id).eq("user_id", userId);
        if (itemError) throw itemError;
      }
    }
  }
}

async function drain(userId: string, epoch: number) {
  while (true) {
    assertAccount(userId, epoch);
    const batch = Object.entries(outbox()).filter(([key]) => tablesForKey(key).length);
    if (!batch.length) return;
    for (const [key, change] of batch) {
      await pushLocal(userId, epoch, { key, ids: change.ids });
      assertAccount(userId, epoch);
      const current = outbox();
      if (current[key]?.revision === change.revision) {
        updateSharedCaches(key, change.ids);
        delete current[key];
      }
      privateStorage.setItem(OUTBOX, JSON.stringify(current));
    }
  }
}

function updateSharedCaches(sourceKey: string, ids: string[]) {
  if (![COURSE_PLANS_STORAGE_KEY, WEEKLY_STUDY_PLANS_STORAGE_KEY].includes(sourceKey)) return;
  const source = new Map(json(sourceKey).map((record) => [String(record.id), record]));
  hydrating = true;
  try {
    for (const targetKey of [COURSE_PLANS_STORAGE_KEY, WEEKLY_STUDY_PLANS_STORAGE_KEY, MONTHLY_STUDY_PLANS_STORAGE_KEY]) {
      if (targetKey === sourceKey) continue;
      const target = new Map(json(targetKey).map((record) => [String(record.id), record]));
      for (const id of ids) {
        const targetId = targetKey === MONTHLY_STUDY_PLANS_STORAGE_KEY ? "weekly-" + id : id;
        const record = source.get(id);
        if (!record) { target.delete(targetId); continue; }
        if (targetKey === COURSE_PLANS_STORAGE_KEY && !target.has(targetId)) continue;
        const weekStart = record.weekStart ?? weekBounds(record.dueDate || record.createdAt?.slice(0, 10))?.start;
        target.set(targetId, targetKey === MONTHLY_STUDY_PLANS_STORAGE_KEY
          ? { ...record, id: targetId, weekStart, month: weekStart?.slice(0, 7) }
          : { ...target.get(targetId), ...record });
      }
      privateStorage.setItem(targetKey, JSON.stringify([...target.values()]));
    }
  } finally { hydrating = false; }
  window.dispatchEvent(new Event("unilink:studyPlansChanged"));
}

export function initializeP0Account(userId: string) {
  const epoch = ++generation;
  return runSerial(async () => {
    assertAccount(userId, epoch);
    const backupKey = "unilink:p0-before-import-v1";
    if (!privateStorage.getItem(backupKey)) {
      const keys = [COURSES_STORAGE_KEY, COURSE_PLANS_STORAGE_KEY, PERSONAL_STUDIES_STORAGE_KEY,
        PERSONAL_STUDY_PLANS_STORAGE_KEY, WEEKLY_STUDY_PLANS_STORAGE_KEY, MONTHLY_STUDY_GOALS_STORAGE_KEY,
        MONTHLY_STUDY_PLANS_STORAGE_KEY, MONTHLY_EVENTS_STORAGE_KEY, WORK_SCHEDULES_STORAGE_KEY, COURSE_SESSIONS_STORAGE_KEY];
      privateStorage.setItem(backupKey, JSON.stringify({ captured_at: new Date().toISOString(),
        values: Object.fromEntries(keys.map((key) => [key, privateStorage.getItem(key)])) }));
    }
    await drain(userId, epoch);
    await pullRemote(userId, epoch);
    await pushLocal(userId, epoch);
  });
}

export function flushP0Changes() {
  const userId = getStorageUser();
  const epoch = generation;
  if (!userId) return Promise.resolve();
  return runSerial(() => drain(userId, epoch));
}

export function stopP0Sync() {
  generation++;
  if (timer !== undefined) window.clearTimeout(timer);
}

function reportError(error: unknown) {
  if (error instanceof InterruptedSync) return;
  const message = error instanceof Error ? error.message
    : error && typeof error === "object" && "message" in error ? String(error.message)
    : "학습 데이터 동기화에 실패했습니다.";
  window.dispatchEvent(new CustomEvent("unilink:p0SyncError", { detail: message }));
}

export function startP0SyncListener() {
  const retry = () => { void flushP0Changes().then(() => {
    window.dispatchEvent(new Event("unilink:p0SyncSuccess"));
  }).catch(reportError); };
  const onChange = (event: Event) => {
    const detail = (event as CustomEvent<{ key: string; userId: string | null; changedIds?: string[]; deletedIds?: string[] }>).detail;
    if (hydrating || !detail?.userId || detail.userId !== getStorageUser() || !tablesForKey(detail.key).length) return;
    const ids = [...(detail.changedIds ?? []), ...(detail.deletedIds ?? [])];
    if (!ids.length) return;
    try { enqueue(detail.key, ids); } catch (error) { reportError(error); return; }
    if (timer !== undefined) window.clearTimeout(timer);
    timer = window.setTimeout(retry, 350);
  };
  window.addEventListener(PRIVATE_STORAGE_CHANGED_EVENT, onChange);
  window.addEventListener("online", retry);
  return () => {
    window.removeEventListener(PRIVATE_STORAGE_CHANGED_EVENT, onChange);
    window.removeEventListener("online", retry);
  };
}

function tablesForKey(key: string): string[] {
  if (key === COURSES_STORAGE_KEY) return ["courses", "course_schedules", "learning_goals"];
  if (key === PERSONAL_STUDIES_STORAGE_KEY || key === MONTHLY_STUDY_GOALS_STORAGE_KEY) return ["learning_goals"];
  if ([COURSE_PLANS_STORAGE_KEY, WEEKLY_STUDY_PLANS_STORAGE_KEY, MONTHLY_STUDY_PLANS_STORAGE_KEY, PERSONAL_STUDY_PLANS_STORAGE_KEY].includes(key)) return ["study_plans", "study_plan_items"];
  if (key === MONTHLY_EVENTS_STORAGE_KEY) return ["calendar_events"];
  if (key === WORK_SCHEDULES_STORAGE_KEY) return ["recurring_commitments"];
  if (key === COURSE_SESSIONS_STORAGE_KEY) return ["course_sessions"];
  return [];
}

import type { MonthlyEvent } from "./timetable-storage";

export type SharedCalendarEvent = MonthlyEvent & { sharedEventId?: string; sharedHref?: string; deadlineTime?: string };
export type SharedCalendarRow = { id: string; goal_id: string | null; title: string; description: string | null; exam_scope: string | null;
  event_type: string; starts_at: string | null; ends_at: string | null; due_at: string | null; created_at: string;
  metadata: { legacy_bucket?: string; calendar_timing?: string } | null };
const localClock = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
function local(value: string) {
  const parts = localClock.formatToParts(new Date(value));
  const p = (type: string) => parts.find(part => part.type === type)?.value ?? "";
  return { date: `${p("year")}-${p("month")}-${p("day")}`, time: `${p("hour")}:${p("minute")}` };
}

export function calendarEventDeadline(row: Pick<SharedCalendarRow, "due_at" | "starts_at" | "ends_at" | "event_type"> & { metadata?: SharedCalendarRow["metadata"] }) {
  if (row.due_at && Number.isFinite(Date.parse(row.due_at))) return row.due_at;
  // Legacy course work could be saved as a multi-day range ending at the last minute.
  if (row.metadata?.calendar_timing === "scheduled" || !["assignment", "presentation", "project"].includes(row.event_type)
    || !row.starts_at || !row.ends_at || !Number.isFinite(Date.parse(row.starts_at)) || !Number.isFinite(Date.parse(row.ends_at))) return null;
  const end = local(row.ends_at);
  return end.time === "23:59" && local(row.starts_at).date < end.date ? row.ends_at : null;
}

export function sharedCalendarEvents(rows: SharedCalendarRow[], goals: { id: string; title: string; course_id: string | null; metadata?: { legacy_record?: { courseId?: string } } | null }[], from: string, until: string, courseColors?: ReadonlyMap<string, string>): SharedCalendarEvent[] {
  return rows.flatMap(row => {
    if (row.metadata?.legacy_bucket === "unilink:monthly-events") return [];
    const goal = goals.find(g => g.id === row.goal_id), courseId = goal?.metadata?.legacy_record?.courseId ?? goal?.course_id;
    const color = (courseId && courseColors?.get(courseId)) || (goal?.course_id && courseColors?.get(goal.course_id))
      || (row.event_type === "exam" ? "#dc2626" : "#0f766e");
    const title = `${goal?.title ? `${goal.title} · ` : ""}${row.title}`;
    const base = {
      sharedEventId: row.id, sharedHref: courseId ? `/course?courseId=${encodeURIComponent(courseId)}` : undefined,
      color, location: "", createdAt: row.created_at,
    };
    const deadline = calendarEventDeadline(row);
    const detail = [row.description, row.exam_scope ? `시험 범위: ${row.exam_scope}` : ""].filter(Boolean);
    if (deadline) {
      const { date, time } = local(deadline);
      if (date < from || date > until) return [];
      return [{ ...base, id: `shared:${row.id}:${date}`, title: `마감 · ${row.title}`, date, startTime: "00:00", endTime: "23:59",
        allDay: true, deadlineTime: time, memo: [`마감: ${date} ${time} (한국 시간)`, goal?.title, ...detail].filter(Boolean).join("\n") }];
    }
    if (!row.starts_at || !Number.isFinite(Date.parse(row.starts_at))) return [];
    const start = local(row.starts_at), end = row.ends_at && Number.isFinite(Date.parse(row.ends_at)) ? local(row.ends_at) : start;
    const first = start.date < from ? from : start.date, last = end.date > until ? until : end.date;
    const result: SharedCalendarEvent[] = [];
    for (let date = first, count = 0; date <= last && count < 42; count++) {
      result.push({ ...base, id: `shared:${row.id}:${date}`, title, date,
        startTime: date === start.date ? start.time : "00:00",
        endTime: date === end.date ? end.time : "23:59",
        allDay: false, memo: detail.join("\n"),
      });
      date = new Date(Date.parse(`${date}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
    }
    return result;
  });
}

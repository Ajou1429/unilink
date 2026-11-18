import type { MonthlyEvent } from "./timetable-storage";

export type SharedCalendarEvent = MonthlyEvent & { sharedEventId?: string; sharedHref?: string };
export type SharedCalendarRow = { id: string; goal_id: string | null; title: string; description: string | null; exam_scope: string | null;
  event_type: string; starts_at: string | null; ends_at: string | null; due_at: string | null; created_at: string;
  metadata: { legacy_bucket?: string } | null };
export function sharedCalendarEvents(rows: SharedCalendarRow[], goals: { id: string; title: string; course_id: string | null; metadata?: { legacy_record?: { courseId?: string } } | null }[], from: string, until: string): SharedCalendarEvent[] {
  const local = (value: string) => {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value));
    const p = (type: string) => parts.find(part => part.type === type)?.value ?? "";
    return { date: `${p("year")}-${p("month")}-${p("day")}`, time: `${p("hour")}:${p("minute")}` };
  };
  return rows.flatMap(row => {
    if (row.metadata?.legacy_bucket === "unilink:monthly-events") return [];
    const at = row.due_at ?? row.starts_at;
    if (!at || !Number.isFinite(Date.parse(at))) return [];
    const start = local(at), end = row.ends_at ? local(row.ends_at) : start;
    const goal = goals.find(g => g.id === row.goal_id), courseId = goal?.metadata?.legacy_record?.courseId ?? goal?.course_id;
    const first = start.date < from ? from : start.date, last = end.date > until ? until : end.date;
    const result: SharedCalendarEvent[] = [];
    for (let date = first, count = 0; date <= last && count < 42; count++) {
      const deadline = row.due_at !== null;
      result.push({ id: `shared:${row.id}:${date}`, sharedEventId: row.id,
        sharedHref: courseId ? `/course?courseId=${encodeURIComponent(courseId)}` : undefined,
        title: `${goal?.title ? `${goal.title} · ` : ""}${row.title}`, date,
        startTime: deadline ? "00:00" : date === start.date ? start.time : "00:00",
        endTime: deadline ? "23:59" : date === end.date ? end.time : "23:59",
        allDay: deadline, color: row.event_type === "exam" ? "#dc2626" : "#0f766e", location: "",
        memo: [deadline ? `마감: ${start.date} ${start.time} (한국 시간)` : "", row.description, row.exam_scope ? `시험 범위: ${row.exam_scope}` : ""].filter(Boolean).join("\n"),
        createdAt: row.created_at,
      });
      date = new Date(Date.parse(`${date}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
    }
    return result;
  });
}

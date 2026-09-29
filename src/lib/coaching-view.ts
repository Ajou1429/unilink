export interface CoachingTask {
  id: string;
  target: string;
  name: string;
  title: string;
  dueDate: string;
  weekStart?: string;
  completed: boolean;
  href: string;
}
function key(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function coachingWeek(today: Date, offset = 0) {
  const start = new Date(today);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay() + offset * 7);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return { start: key(start), end: key(end), today: key(today) };
}
export function orderCoachingTasks(tasks: CoachingTask[]) {
  return [...tasks].sort(
    (a, b) =>
      Number(a.completed) - Number(b.completed) ||
      (a.dueDate || "9999").localeCompare(b.dueDate || "9999") ||
      a.title.localeCompare(b.title),
  );
}

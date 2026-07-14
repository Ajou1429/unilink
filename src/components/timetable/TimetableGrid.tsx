"use client";

import { Course, DayOfWeek } from "@/lib/types";
import {
  CourseOccurrence,
  CourseSessionProgress,
  MonthlyEvent,
} from "@/lib/timetable-storage";

const WEEK_DAYS: Array<DayOfWeek | "토" | "일"> = [
  "월",
  "화",
  "수",
  "목",
  "금",
  "토",
  "일",
];
const START_HOUR = 7;
const END_HOUR = 22;
const HOUR_HEIGHT = 60;

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function minutesFromStart(time: string): number {
  return timeToMinutes(time) - START_HOUR * 60;
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDayNumber(date: Date) {
  return date.toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });
}

function formatSessionSummary(session: CourseSessionProgress) {
  const pageRange =
    session.pageStart && session.pageEnd
      ? `${session.pageStart}-${session.pageEnd}p`
      : session.pageStart
        ? `${session.pageStart}p부터`
        : session.pageEnd
          ? `${session.pageEnd}p까지`
          : "";
  const progress = session.progressTitle || session.noteTitle || "진도 저장됨";

  return pageRange ? `${progress} · ${pageRange}` : progress;
}

interface TimetableGridProps {
  courses: Course[];
  monthlyEvents: MonthlyEvent[];
  courseSessions: CourseSessionProgress[];
  weekStart: Date;
  onCourseClick?: (occurrence: CourseOccurrence) => void;
  onEventClick?: (event: MonthlyEvent) => void;
}

export function TimetableGrid({
  courses,
  monthlyEvents,
  courseSessions,
  weekStart,
  onCourseClick,
  onEventClick,
}: TimetableGridProps) {
  const totalMinutes = (END_HOUR - START_HOUR) * 60;
  const totalHeight = totalMinutes * (HOUR_HEIGHT / 60);
  const weekDates = WEEK_DAYS.map((day, index) => ({
    label: day,
    date: addDays(weekStart, index),
    dateKey: formatDateKey(addDays(weekStart, index)),
  }));

  return (
    <div className="w-full overflow-hidden">
      <div className="w-full min-w-0">
        <div className="flex ml-14 mb-1">
          {weekDates.map(({ label, date, dateKey }) => (
            <div
              key={dateKey}
              className="min-w-0 flex-1 text-center text-sm font-medium text-muted-foreground py-2"
            >
              <div>{label}</div>
              <div className="text-[11px] font-normal">{formatDayNumber(date)}</div>
            </div>
          ))}
        </div>

        <div className="flex">
          <div className="w-14 shrink-0 relative" style={{ height: totalHeight }}>
            {Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => (
              <div
                key={i}
                className="absolute right-2 text-xs text-muted-foreground -translate-y-2"
                style={{ top: i * HOUR_HEIGHT }}
              >
                {START_HOUR + i}시
              </div>
            ))}
          </div>

          {weekDates.map(({ label, dateKey }) => {
            const dayCourses = courses.filter((course) =>
              course.days.includes(label as DayOfWeek),
            );
            const dayEvents = monthlyEvents.filter((event) => event.date === dateKey);

            return (
              <div
                key={dateKey}
                className="min-w-0 flex-1 relative border-l border-t bg-white"
                style={{ height: totalHeight }}
              >
                {Array.from({ length: END_HOUR - START_HOUR }, (_, i) => (
                  <div
                    key={i}
                    className="absolute inset-x-0 border-b border-dashed border-gray-100"
                    style={{ top: (i + 1) * HOUR_HEIGHT }}
                  />
                ))}
                {Array.from({ length: END_HOUR - START_HOUR }, (_, i) => (
                  <div
                    key={`h-${i}`}
                    className="absolute inset-x-0 border-b border-gray-50"
                    style={{ top: i * HOUR_HEIGHT + HOUR_HEIGHT / 2 }}
                  />
                ))}

                {dayCourses.map((course) => {
                  const topMin = minutesFromStart(course.startTime);
                  const durationMin =
                    timeToMinutes(course.endTime) - timeToMinutes(course.startTime);
                  const top = (topMin / 60) * HOUR_HEIGHT;
                  const height = (durationMin / 60) * HOUR_HEIGHT;
                  const session = courseSessions.find(
                    (item) =>
                      item.courseId === course.id &&
                      item.date === dateKey &&
                      item.startTime === course.startTime,
                  );

                  return (
                    <button
                      key={`${dateKey}-${course.id}`}
                      onClick={() =>
                        onCourseClick?.({
                          course,
                          date: dateKey,
                          dayLabel: label,
                          startTime: course.startTime,
                          endTime: course.endTime,
                        })
                      }
                      className="absolute inset-x-1 rounded-md px-2 py-1.5 text-left overflow-hidden transition-opacity hover:opacity-90 cursor-pointer"
                      style={{
                        top,
                        height,
                        backgroundColor: course.color,
                      }}
                    >
                      <p className="text-white text-xs font-semibold leading-tight truncate">
                        {course.name}
                      </p>
                      {height > 40 && (
                        <p className="text-white/80 text-[10px] leading-tight truncate mt-0.5">
                          {course.location}
                        </p>
                      )}
                      {height > 60 && (
                        <p className="text-white/70 text-[10px] leading-tight mt-0.5">
                          {course.startTime} - {course.endTime}
                        </p>
                      )}
                      {session && height > 76 && (
                        <p className="mt-1 truncate rounded bg-white/20 px-1.5 py-0.5 text-[10px] font-medium leading-tight text-white">
                          {formatSessionSummary(session)}
                        </p>
                      )}
                    </button>
                  );
                })}

                {dayEvents.map((event) => {
                  const topMin = minutesFromStart(event.startTime);
                  const durationMin =
                    timeToMinutes(event.endTime) - timeToMinutes(event.startTime);
                  const top = (topMin / 60) * HOUR_HEIGHT;
                  const height = (durationMin / 60) * HOUR_HEIGHT;

                  return (
                    <button
                      key={event.id}
                      onClick={() => onEventClick?.(event)}
                      className="absolute inset-x-1 rounded-md border-2 border-white px-2 py-1.5 text-left overflow-hidden transition-opacity hover:opacity-90 cursor-pointer"
                      style={{
                        top,
                        height,
                        backgroundColor: event.color,
                      }}
                    >
                      <p className="text-white text-xs font-semibold leading-tight truncate">
                        {event.title}
                      </p>
                      {height > 42 && (
                        <p className="text-white/80 text-[10px] leading-tight truncate mt-0.5">
                          {event.location || "월간 일정"}
                        </p>
                      )}
                      {height > 64 && (
                        <p className="text-white/70 text-[10px] leading-tight mt-0.5">
                          {event.startTime} - {event.endTime}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

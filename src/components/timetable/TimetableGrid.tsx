"use client";

import { Course, CourseSchedule, DayOfWeek } from "@/lib/types";
import {
  CourseOccurrence,
  CourseSessionProgress,
  MonthlyEvent,
  WorkSchedule,
} from "@/lib/timetable-storage";

const WEEK_DAYS: DayOfWeek[] = [
  "월",
  "화",
  "수",
  "목",
  "금",
  "토",
  "일",
];
const DEFAULT_START_HOUR = 8;
const DEFAULT_END_HOUR = 22;
const HOUR_HEIGHT = 60;

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function minutesFromStart(time: string, startHour: number): number {
  return timeToMinutes(time) - startHour * 60;
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

function getCourseSchedules(course: Course): CourseSchedule[] {
  return course.schedules?.length
    ? course.schedules
    : course.days.map((day) => ({
        day,
        startTime: course.startTime,
        endTime: course.endTime,
      }));
}

function getWorkSchedules(schedule: WorkSchedule): CourseSchedule[] {
  return schedule.schedules?.length
    ? schedule.schedules
    : schedule.days.map((day) => ({
        day,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
      }));
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
  workSchedules?: WorkSchedule[];
  monthlyEvents: MonthlyEvent[];
  courseSessions: CourseSessionProgress[];
  weekStart: Date;
  onCourseClick?: (occurrence: CourseOccurrence) => void;
  onEventClick?: (event: MonthlyEvent) => void;
}

export function TimetableGrid({
  courses,
  workSchedules = [],
  monthlyEvents,
  courseSessions,
  weekStart,
  onCourseClick,
  onEventClick,
}: TimetableGridProps) {
  const weekDates = WEEK_DAYS.map((day, index) => ({
    label: day,
    date: addDays(weekStart, index),
    dateKey: formatDateKey(addDays(weekStart, index)),
  }));
  const weekDateKeys = new Set(weekDates.map(({ dateKey }) => dateKey));
  const timeRanges = [
    ...courses.flatMap((course) => getCourseSchedules(course)),
    ...workSchedules.flatMap((schedule) => getWorkSchedules(schedule)),
    ...monthlyEvents
      .filter((event) => weekDateKeys.has(event.date))
      .map((event) => ({ startTime: event.startTime, endTime: event.endTime })),
  ];
  const earliestMinutes = timeRanges.reduce(
    (earliest, range) => Math.min(earliest, timeToMinutes(range.startTime)),
    DEFAULT_START_HOUR * 60,
  );
  const latestMinutes = timeRanges.reduce(
    (latest, range) => Math.max(latest, timeToMinutes(range.endTime)),
    DEFAULT_END_HOUR * 60,
  );
  const startHour = Math.floor(earliestMinutes / 60);
  const endHour = Math.max(DEFAULT_END_HOUR, Math.ceil(latestMinutes / 60));
  const totalMinutes = (endHour - startHour) * 60;
  const totalHeight = totalMinutes * (HOUR_HEIGHT / 60);

  return (
    <div className="max-h-[calc(100vh-260px)] min-h-[520px] w-full overflow-x-hidden overflow-y-auto">
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
            {Array.from({ length: endHour - startHour + 1 }, (_, i) => (
              <div
                key={i}
                className="absolute right-2 text-xs text-muted-foreground -translate-y-2"
                style={{ top: i * HOUR_HEIGHT }}
              >
                {startHour + i}시
              </div>
            ))}
          </div>

          {weekDates.map(({ label, dateKey }) => {
            const dayCourses = courses.flatMap((course) =>
              getCourseSchedules(course)
                .filter((schedule) => schedule.day === label)
                .map((schedule) => ({ course, schedule })),
            );
            const dayWorkSchedules = workSchedules.flatMap((schedule) =>
              getWorkSchedules(schedule)
                .filter((workSchedule) => workSchedule.day === label)
                .map((workSchedule) => ({ schedule, workSchedule })),
            );
            const dayEvents = monthlyEvents.filter((event) => event.date === dateKey);

            return (
              <div
                key={dateKey}
                className="min-w-0 flex-1 relative border-l border-t bg-white"
                style={{ height: totalHeight }}
              >
                {Array.from({ length: endHour - startHour }, (_, i) => (
                  <div
                    key={i}
                    className="absolute inset-x-0 border-b border-dashed border-gray-100"
                    style={{ top: (i + 1) * HOUR_HEIGHT }}
                  />
                ))}
                {Array.from({ length: endHour - startHour }, (_, i) => (
                  <div
                    key={`h-${i}`}
                    className="absolute inset-x-0 border-b border-gray-50"
                    style={{ top: i * HOUR_HEIGHT + HOUR_HEIGHT / 2 }}
                  />
                ))}

                {dayCourses.map(({ course, schedule }) => {
                  const topMin = minutesFromStart(schedule.startTime, startHour);
                  const durationMin =
                    timeToMinutes(schedule.endTime) - timeToMinutes(schedule.startTime);
                  const top = (topMin / 60) * HOUR_HEIGHT;
                  const height = (durationMin / 60) * HOUR_HEIGHT;
                  const session = courseSessions.find(
                    (item) =>
                      item.courseId === course.id &&
                      item.date === dateKey &&
                      item.startTime === schedule.startTime,
                  );

                  return (
                    <button
                      key={`${dateKey}-${course.id}`}
                      onClick={() =>
                        onCourseClick?.({
                          course,
                          date: dateKey,
                          dayLabel: label,
                          startTime: schedule.startTime,
                          endTime: schedule.endTime,
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
                          {schedule.startTime} - {schedule.endTime}
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

                {dayWorkSchedules.map(({ schedule, workSchedule }) => {
                  const topMin = minutesFromStart(workSchedule.startTime, startHour);
                  const durationMin =
                    timeToMinutes(workSchedule.endTime) - timeToMinutes(workSchedule.startTime);
                  const top = (topMin / 60) * HOUR_HEIGHT;
                  const height = (durationMin / 60) * HOUR_HEIGHT;

                  return (
                    <div
                      key={`${dateKey}-${schedule.id}`}
                      className="absolute inset-x-1 rounded-md border border-dashed border-white/80 px-2 py-1.5 text-left overflow-hidden"
                      style={{ top, height, backgroundColor: schedule.color }}
                    >
                      <p className="text-white text-xs font-semibold leading-tight truncate">
                        {schedule.title}
                      </p>
                      {height > 42 && (
                        <p className="text-white/80 text-[10px] leading-tight truncate mt-0.5">
                          기타 일정{schedule.location ? ` · ${schedule.location}` : ""}
                        </p>
                      )}
                      {height > 60 && (
                        <p className="text-white/70 text-[10px] leading-tight">
                          {workSchedule.startTime} - {workSchedule.endTime}
                        </p>
                      )}
                    </div>
                  );
                })}

                {dayEvents.map((event) => {
                  const topMin = minutesFromStart(event.startTime, startHour);
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

"use client";

import { Course, DayOfWeek } from "@/lib/types";

const DAYS: DayOfWeek[] = ["월", "화", "수", "목", "금"];
const START_HOUR = 9;
const END_HOUR = 21;
const HOUR_HEIGHT = 60; // px per hour

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function minutesFromStart(time: string): number {
  return timeToMinutes(time) - START_HOUR * 60;
}

interface TimetableGridProps {
  courses: Course[];
  onCourseClick?: (course: Course) => void;
}

export function TimetableGrid({ courses, onCourseClick }: TimetableGridProps) {
  const totalMinutes = (END_HOUR - START_HOUR) * 60;
  const totalHeight = totalMinutes * (HOUR_HEIGHT / 60);

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[600px]">
        {/* Day headers */}
        <div className="flex ml-14 mb-1">
          {DAYS.map((day) => (
            <div key={day} className="flex-1 text-center text-sm font-medium text-muted-foreground py-2">
              {day}
            </div>
          ))}
        </div>

        {/* Grid */}
        <div className="flex">
          {/* Time labels */}
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

          {/* Day columns */}
          {DAYS.map((day) => {
            const dayCourses = courses.filter((c) => c.days.includes(day));
            return (
              <div
                key={day}
                className="flex-1 relative border-l border-t"
                style={{ height: totalHeight }}
              >
                {/* Hour lines */}
                {Array.from({ length: END_HOUR - START_HOUR }, (_, i) => (
                  <div
                    key={i}
                    className="absolute inset-x-0 border-b border-dashed border-gray-100"
                    style={{ top: (i + 1) * HOUR_HEIGHT }}
                  />
                ))}
                {/* Half-hour lines */}
                {Array.from({ length: END_HOUR - START_HOUR }, (_, i) => (
                  <div
                    key={`h-${i}`}
                    className="absolute inset-x-0 border-b border-gray-50"
                    style={{ top: i * HOUR_HEIGHT + HOUR_HEIGHT / 2 }}
                  />
                ))}

                {/* Courses */}
                {dayCourses.map((course) => {
                  const topMin = minutesFromStart(course.startTime);
                  const durationMin = timeToMinutes(course.endTime) - timeToMinutes(course.startTime);
                  const top = (topMin / 60) * HOUR_HEIGHT;
                  const height = (durationMin / 60) * HOUR_HEIGHT;

                  return (
                    <button
                      key={course.id}
                      onClick={() => onCourseClick?.(course)}
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
                          {course.startTime}–{course.endTime}
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

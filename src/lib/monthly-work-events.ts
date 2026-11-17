import type { MonthlyEvent, WorkSchedule } from "./timetable-storage";
import type { DayOfWeek } from "./types";

export interface MonthlyWorkEvent extends MonthlyEvent {
  workScheduleId: string;
}

/** Expand for display only. Each occurrence points back to its editable recurrence. */
export function monthlyWorkEvents(schedules: WorkSchedule[], dates: string[]): MonthlyWorkEvent[] {
  const days: DayOfWeek[] = ["일", "월", "화", "수", "목", "금", "토"];
  return dates.flatMap(date => {
    const day = days[new Date(`${date}T12:00:00`).getDay()];
    return schedules.flatMap(schedule => {
      const slots = schedule.allDay
        ? schedule.days.map(day => ({ day, startTime: "", endTime: "" }))
        : schedule.schedules?.length
          ? schedule.schedules
          : schedule.days.map(day => ({ day, startTime: schedule.startTime, endTime: schedule.endTime }));
      return slots.filter(slot => slot.day === day).map((slot, index) => ({
        id: `work:${schedule.id}:${date}:${index}`,
        workScheduleId: schedule.id,
        title: schedule.title,
        date,
        startTime: slot.startTime,
        endTime: slot.endTime,
        allDay: schedule.allDay,
        location: schedule.location ?? "",
        memo: schedule.memo ?? "",
        color: schedule.color,
        createdAt: schedule.createdAt,
      }));
    });
  });
}

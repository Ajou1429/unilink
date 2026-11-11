"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScheduleColorPicker } from "@/components/timetable/ScheduleColorPicker";
import { TimeField } from "@/components/timetable/TimeField";
import { SCHEDULE_COLORS } from "@/lib/schedule-colors";
import {
  ALL_DAY_END,
  ALL_DAY_START,
  type MonthlyEvent,
  type WorkSchedule,
} from "@/lib/timetable-storage";
import type { DayOfWeek } from "@/lib/types";

const DAYS: DayOfWeek[] = ["월", "화", "수", "목", "금", "토", "일"];

type DayTimes = Partial<Record<DayOfWeek, { startTime: string; endTime: string }>>;

export interface ScheduleForm {
  title: string;
  location: string;
  memo: string;
  color: string;
  /** true면 요일 반복(주간 반복 일정), false면 특정 날짜 일정 */
  repeat: boolean;
  date: string;
  days: DayOfWeek[];
  allDay: boolean;
  startTime: string;
  endTime: string;
  dayTimes: DayTimes;
}

function todayKey() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

export function emptyScheduleForm(overrides: Partial<ScheduleForm> = {}): ScheduleForm {
  return {
    title: "",
    location: "",
    memo: "",
    color: SCHEDULE_COLORS[0],
    repeat: false,
    date: todayKey(),
    days: [],
    allDay: false,
    startTime: "09:00",
    endTime: "10:00",
    dayTimes: {},
    ...overrides,
  };
}

export function formFromEvent(event: MonthlyEvent): ScheduleForm {
  return emptyScheduleForm({
    title: event.title,
    location: event.location,
    memo: event.memo,
    color: event.color,
    date: event.date,
    allDay: Boolean(event.allDay),
    startTime: event.allDay ? "09:00" : event.startTime,
    endTime: event.allDay ? "10:00" : event.endTime,
  });
}

export function formFromWork(work: WorkSchedule): ScheduleForm {
  const slots = work.schedules?.length
    ? work.schedules
    : work.days.map((day) => ({ day, startTime: work.startTime, endTime: work.endTime }));
  return emptyScheduleForm({
    title: work.title,
    location: work.location,
    memo: work.memo ?? "",
    color: work.color,
    repeat: true,
    days: work.days,
    allDay: Boolean(work.allDay),
    startTime: work.allDay ? "09:00" : work.startTime,
    endTime: work.allDay ? "10:00" : work.endTime,
    dayTimes: work.allDay
      ? {}
      : Object.fromEntries(slots.map((slot) => [slot.day, { startTime: slot.startTime, endTime: slot.endTime }])),
  });
}

function timeFor(form: ScheduleForm, day: DayOfWeek) {
  return form.dayTimes[day] ?? { startTime: form.startTime, endTime: form.endTime };
}

export function buildEvent(form: ScheduleForm, existing?: MonthlyEvent): MonthlyEvent {
  return {
    ...existing,
    id: existing?.id ?? Date.now().toString(),
    title: form.title.trim(),
    date: form.date,
    startTime: form.allDay ? ALL_DAY_START : form.startTime,
    endTime: form.allDay ? ALL_DAY_END : form.endTime,
    allDay: form.allDay || undefined,
    location: form.location.trim(),
    memo: form.memo.trim(),
    color: form.color,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  };
}

export function buildWork(form: ScheduleForm, existing?: WorkSchedule): WorkSchedule {
  const days = DAYS.filter((day) => form.days.includes(day));
  const schedules = days.map((day) =>
    form.allDay ? { day, startTime: ALL_DAY_START, endTime: ALL_DAY_END } : { day, ...timeFor(form, day) },
  );
  return {
    ...existing,
    id: existing?.id ?? `work-${Date.now()}`,
    title: form.title.trim(),
    location: form.location.trim(),
    memo: form.memo.trim() || undefined,
    days,
    schedules,
    startTime: schedules[0]?.startTime ?? form.startTime,
    endTime: schedules[0]?.endTime ?? form.endTime,
    allDay: form.allDay || undefined,
    color: form.color,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  };
}

function isValid(form: ScheduleForm) {
  if (!form.title.trim()) return false;
  if (form.repeat) {
    if (!form.days.length) return false;
    return form.allDay || form.days.every((day) => {
      const { startTime, endTime } = timeFor(form, day);
      return startTime < endTime;
    });
  }
  return Boolean(form.date) && (form.allDay || form.startTime < form.endTime);
}

function ToggleChip({ checked, onChange, children }: { checked: boolean; onChange: (value: boolean) => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
        checked ? "border-slate-800 bg-slate-800 text-white" : "bg-background text-muted-foreground hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}

function ScheduleFormBody({ initial, editing, onSubmit }: { initial: ScheduleForm; editing: boolean; onSubmit: (form: ScheduleForm) => void }) {
  const [form, setForm] = useState(initial);
  const update = (patch: Partial<ScheduleForm>) => setForm((prev) => ({ ...prev, ...patch }));

  function toggleDay(day: DayOfWeek) {
    setForm((prev) => {
      const selected = prev.days.includes(day);
      const dayTimes = { ...prev.dayTimes };
      if (selected) delete dayTimes[day];
      else dayTimes[day] = { startTime: prev.startTime, endTime: prev.endTime };
      return { ...prev, days: selected ? prev.days.filter((item) => item !== day) : [...prev.days, day], dayTimes };
    });
  }

  function setDayTime(day: DayOfWeek, patch: Partial<{ startTime: string; endTime: string }>) {
    setForm((prev) => ({ ...prev, dayTimes: { ...prev.dayTimes, [day]: { ...timeFor(prev, day), ...patch } } }));
  }

  const orderedDays = DAYS.filter((day) => form.days.includes(day));

  return (
    <div className="space-y-4 pt-2">
      <div className="space-y-2">
        <Label>일정명</Label>
        <Input autoFocus value={form.title} onChange={(event) => update({ title: event.target.value })} />
      </div>

      <div className="flex gap-2">
        <ToggleChip checked={form.repeat} onChange={(repeat) => update({ repeat })}>요일 반복</ToggleChip>
        <ToggleChip checked={form.allDay} onChange={(allDay) => update({ allDay })}>하루 종일</ToggleChip>
      </div>

      {form.repeat ? (
        <div className="space-y-2">
          <Label>요일</Label>
          <div className="flex gap-2">
            {DAYS.map((day) => (
              <button
                key={day}
                type="button"
                aria-pressed={form.days.includes(day)}
                onClick={() => toggleDay(day)}
                className={`h-9 w-9 rounded-full text-sm font-medium ${
                  form.days.includes(day) ? "bg-slate-800 text-white" : "bg-muted text-muted-foreground"
                }`}
              >
                {day}
              </button>
            ))}
          </div>
          {!form.allDay && orderedDays.length > 0 && (
            <div className="space-y-2 pt-1">
              {orderedDays.map((day) => {
                const time = timeFor(form, day);
                return (
                  <div key={day} className="grid grid-cols-[32px_1fr_1fr] items-center gap-2">
                    <span className="text-sm font-medium">{day}</span>
                    <TimeField value={time.startTime} onChange={(startTime) => setDayTime(day, { startTime })} />
                    <TimeField value={time.endTime} onChange={(endTime) => setDayTime(day, { endTime })} />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>날짜</Label>
            <Input type="date" value={form.date} onChange={(event) => update({ date: event.target.value })} />
          </div>
          {!form.allDay && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>시작 시간</Label>
                <TimeField value={form.startTime} onChange={(startTime) => update({ startTime })} />
              </div>
              <div className="space-y-2">
                <Label>종료 시간</Label>
                <TimeField value={form.endTime} onChange={(endTime) => update({ endTime })} />
              </div>
            </div>
          )}
        </div>
      )}

      <div className="space-y-2">
        <Label>장소</Label>
        <Input value={form.location} onChange={(event) => update({ location: event.target.value })} />
      </div>
      <div className="space-y-2">
        <Label>메모</Label>
        <Textarea rows={2} value={form.memo} onChange={(event) => update({ memo: event.target.value })} />
      </div>
      <div className="space-y-2">
        <Label>색상</Label>
        <ScheduleColorPicker value={form.color} labelPrefix="일정" onChange={(color) => update({ color })} />
      </div>
      <Button className="w-full" disabled={!isValid(form)} onClick={() => onSubmit(form)}>
        {editing ? "일정 수정" : "일정 추가"}
      </Button>
    </div>
  );
}

export function ScheduleDialog({
  open,
  onOpenChange,
  initial,
  editing,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: ScheduleForm;
  editing: boolean;
  onSubmit: (form: ScheduleForm) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "일정 수정" : "일정 추가"}</DialogTitle>
        </DialogHeader>
        {open && <ScheduleFormBody initial={initial} editing={editing} onSubmit={onSubmit} />}
      </DialogContent>
    </Dialog>
  );
}

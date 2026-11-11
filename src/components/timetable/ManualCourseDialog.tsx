"use client";

import { useState } from "react";
import { PencilLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TimeField } from "@/components/timetable/TimeField";
import { courseSchedules, schedulesOverlap } from "@/lib/ajou-catalog";
import { SCHEDULE_COLORS } from "@/lib/schedule-colors";
import type { WorkSchedule } from "@/lib/timetable-storage";
import type { Course, CourseSchedule, DayOfWeek } from "@/lib/types";

const DAYS: DayOfWeek[] = ["월", "화", "수", "목", "금", "토", "일"];
/** 이수구분. 전공 계열이면 전공 학점으로 센다. */
export const COURSE_CATEGORIES = ["전필", "전선", "전기", "교필", "교선", "일선"] as const;

const makeCourseId = () => `manual-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;

type DayTimes = Partial<Record<DayOfWeek, { startTime: string; endTime: string }>>;

function ManualCourseForm({
  term,
  existingCourses,
  workSchedules,
  onAdd,
}: {
  term: string;
  existingCourses: Course[];
  workSchedules: WorkSchedule[];
  onAdd: (course: Course) => void;
}) {
  const [name, setName] = useState("");
  const [professor, setProfessor] = useState("");
  const [category, setCategory] = useState<string>("전선");
  const [credits, setCredits] = useState("3");
  const [days, setDays] = useState<DayOfWeek[]>([]);
  const [times, setTimes] = useState<DayTimes>({});
  const [error, setError] = useState("");

  const ordered = DAYS.filter((day) => days.includes(day));
  const timeOf = (day: DayOfWeek) => times[day] ?? { startTime: "09:00", endTime: "10:15" };

  function toggleDay(day: DayOfWeek) {
    setDays((prev) => (prev.includes(day) ? prev.filter((item) => item !== day) : [...prev, day]));
  }

  function submit() {
    setError("");
    const creditValue = Number(credits);
    if (!name.trim()) return setError("과목명을 입력해 주세요.");
    if (!Number.isFinite(creditValue) || creditValue < 0 || creditValue > 30) return setError("학점을 확인해 주세요.");
    const schedules: CourseSchedule[] = ordered.map((day) => ({ day, ...timeOf(day), location: "" }));
    if (schedules.some((slot) => slot.startTime >= slot.endTime)) return setError("끝나는 시간이 시작 시간보다 뒤여야 해요.");
    const conflict = existingCourses.find((course) => schedulesOverlap(schedules, courseSchedules(course)))?.name
      ?? workSchedules.find((work) => !work.allDay && schedulesOverlap(schedules, courseSchedules(work)))?.title;
    if (conflict) return setError(`${conflict} 일정과 시간이 겹쳐요.`);
    onAdd({
      id: makeCourseId(),
      term,
      name: name.trim(),
      professor: professor.trim(),
      location: "",
      color: SCHEDULE_COLORS[existingCourses.length % SCHEDULE_COLORS.length],
      category,
      courseType: category.startsWith("전") ? "major" : "non-major",
      credits: creditValue,
      days: ordered,
      schedules,
      startTime: schedules[0]?.startTime ?? "",
      endTime: schedules[0]?.endTime ?? "",
    });
  }

  const control = "h-8 w-full rounded-lg border bg-white px-2 text-sm";
  return (
    <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); submit(); }}>
      <div className="space-y-1.5">
        <Label>과목명</Label>
        <Input autoFocus aria-label="과목명" value={name} onChange={(event) => setName(event.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label>요일·시간</Label>
        <div className="flex gap-1.5">
          {DAYS.map((day) => (
            <button
              key={day}
              type="button"
              aria-pressed={days.includes(day)}
              onClick={() => toggleDay(day)}
              className={`h-8 w-8 rounded-full text-sm font-medium ${days.includes(day) ? "bg-slate-800 text-white" : "bg-muted text-muted-foreground"}`}
            >
              {day}
            </button>
          ))}
        </div>
        {ordered.map((day) => (
          <div key={day} className="grid grid-cols-[24px_1fr_1fr] items-center gap-2">
            <span className="text-sm font-medium">{day}</span>
            <TimeField value={timeOf(day).startTime} onChange={(startTime) => setTimes((prev) => ({ ...prev, [day]: { ...timeOf(day), startTime } }))} />
            <TimeField value={timeOf(day).endTime} onChange={(endTime) => setTimes((prev) => ({ ...prev, [day]: { ...timeOf(day), endTime } }))} />
          </div>
        ))}
      </div>
      <div className="space-y-1.5">
        <Label>교수명</Label>
        <Input aria-label="교수명" value={professor} onChange={(event) => setProfessor(event.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>이수구분</Label>
          <select aria-label="이수구분" className={control} value={category} onChange={(event) => setCategory(event.target.value)}>
            {COURSE_CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>학점</Label>
          <Input aria-label="학점" inputMode="decimal" value={credits} onChange={(event) => setCredits(event.target.value.replace(/[^\d.]/g, ""))} />
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full">추가</Button>
    </form>
  );
}

export function ManualCourseDialog(props: {
  term: string;
  existingCourses: Course[];
  workSchedules: WorkSchedule[];
  onAdd: (course: Course) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" className="gap-2" />}>
        <PencilLine className="h-4 w-4" /> 직접 추가
      </DialogTrigger>
      <DialogContent className="max-h-[92dvh] max-w-md overflow-y-auto">
        <DialogHeader><DialogTitle>{props.term} 과목 직접 추가</DialogTitle></DialogHeader>
        {open && (
          <ManualCourseForm
            {...props}
            onAdd={(course) => {
              props.onAdd(course);
              setOpen(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

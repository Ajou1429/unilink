"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { TimetableGrid } from "@/components/timetable/TimetableGrid";
import { AjouCoursePicker } from "@/components/timetable/AjouCoursePicker";
import { ManualCourseDialog } from "@/components/timetable/ManualCourseDialog";
import {
  ScheduleDialog,
  buildEvent,
  buildWork,
  emptyScheduleForm,
  formFromEvent,
  formFromWork,
  type ScheduleForm,
} from "@/components/timetable/ScheduleDialog";
import { ScheduleColorPicker } from "@/components/timetable/ScheduleColorPicker";
import { TimeField } from "@/components/timetable/TimeField";
import { AJOU_TERM, UNSCHEDULED_LABEL, courseSchedules, isUnscheduledCourse, sameCatalogSubject, schedulesOverlap } from "@/lib/ajou-catalog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Users,
  MapPin,
  Clock,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  CheckCircle2,
  X,
  Target,
  Award,
  Repeat,
  Pencil,
  Trash2,
} from "lucide-react";
import { SCHEDULE_COLORS } from "@/lib/schedule-colors";
import { Course, DayOfWeek } from "@/lib/types";
import {
  getAllStoredCourses,
  getStoredCourses,
  saveStoredCourses,
  COURSES_CHANGED_EVENT,
} from "@/lib/course-storage";
import {
  getPersonalStudies,
  getAllPersonalStudyPlans,
  formatPersonalStudyDday,
  PersonalStudy,
  PersonalStudyPlan,
  PERSONAL_STUDY_PLANS_CHANGED_EVENT,
  PERSONAL_STUDIES_CHANGED_EVENT,
  savePersonalStudies,
  completePersonalStudy,
  deletePersonalStudy,
} from "@/lib/personal-study-storage";
import { addCompletedPersonalStudySpec } from "@/lib/record-storage";
import {
  CourseOccurrence,
  CourseSessionProgress,
  getCourseSession,
  getCourseSessions,
  getMonthlyEvents,
  MonthlyEvent,
  PaceLevel,
  saveCourseSession,
  saveMonthlyEvents,
  getWorkSchedules,
  saveWorkSchedules,
  getTimetableTerms,
  saveTimetableTerms,
  getMaxCredits,
  saveMaxCredits,
  MAX_CREDITS_RANGE,
  WorkSchedule,
  WORK_SCHEDULES_CHANGED_EVENT,
} from "@/lib/timetable-storage";
import { getMyNotes, MyNote } from "@/lib/my-notes-storage";
import {
  formatAcademicTerm,
  getCurrentAcademicTermLabel,
  parseAcademicTerm,
  sortAcademicTerms,
  TERM_SEASONS,
  type TermSeason,
} from "@/lib/academic-term";

import { flushP0Changes } from "@/lib/p0-sync";
import { getStorageUser } from "@/lib/private-storage";

const DAYS: DayOfWeek[] = ["월", "화", "수", "목", "금", "토", "일"];
const COURSE_TYPE_LABELS = {
  major: "전공",
  "non-major": "비전공",
} as const;
const LEVELS: PaceLevel[] = ["상", "중", "하"];
const TERM_YEAR_OPTIONS = (() => {
  const year = new Date().getFullYear();
  // 최근 연도가 위로: 내년 → 10년 전
  return Array.from({ length: 12 }, (_, index) => year + 1 - index);
})();
const MAX_CREDIT_OPTIONS = Array.from(
  { length: MAX_CREDITS_RANGE.max - MAX_CREDITS_RANGE.min + 1 },
  (_, index) => MAX_CREDITS_RANGE.min + index,
);

function formatCourseDays(course: Course) {
  return isUnscheduledCourse(course) ? UNSCHEDULED_LABEL : course.days.join("");
}
const KOREA_2026_HOLIDAYS: Record<string, string[]> = {
  "2026-01-01": ["신정"],
  "2026-02-16": ["설날 연휴"],
  "2026-02-17": ["설날"],
  "2026-02-18": ["설날 연휴"],
  "2026-03-01": ["삼일절"],
  "2026-03-02": ["삼일절 대체공휴일"],
  "2026-05-01": ["근로자의 날"],
  "2026-05-05": ["어린이날"],
  "2026-05-24": ["부처님 오신 날"],
  "2026-05-25": ["부처님 오신 날 대체공휴일"],
  "2026-06-03": ["지방선거일"],
  "2026-06-06": ["현충일"],
  "2026-07-17": ["제헌절"],
  "2026-08-15": ["광복절"],
  "2026-08-17": ["광복절 대체공휴일"],
  "2026-09-24": ["추석 연휴"],
  "2026-09-25": ["추석"],
  "2026-09-26": ["추석 연휴"],
  "2026-10-03": ["개천절"],
  "2026-10-05": ["개천절 대체공휴일"],
  "2026-10-09": ["한글날"],
  "2026-12-25": ["성탄절"],
};

function getPersonalStudyDeadlineEvents(
  studies: PersonalStudy[],
  plans: PersonalStudyPlan[],
): MonthlyEvent[] {
  const studyById = new Map(studies.map((study) => [study.id, study]));
  const studyEvents = studies.flatMap((study) => {
    if (!study.targetDate) return [];

    return [{
      id: `personal-deadline:${study.id}`,
      title: `${formatPersonalStudyDday(study.targetDate)} · ${study.title}`,
      date: study.targetDate,
      startTime: "07:00",
      endTime: "08:00",
      location: "개인 학습 목표",
      memo: study.goal || "개인 학습 목표 기한",
      color: study.color,
      createdAt: study.createdAt,
      kind: "personal-deadline" as const,
      personalStudyId: study.id,
    }];
  });
  const planEvents = plans.flatMap((plan) => {
    const study = studyById.get(plan.studyId);
    if (!study || !plan.dueDate) return [];

    return [{
      id: `personal-plan-deadline:${plan.id}`,
      title: `계획 마감 · ${plan.title}`,
      date: plan.dueDate,
      startTime: "08:00",
      endTime: "09:00",
      location: `${study.title} · 개인 학습`,
      memo: plan.description || "개인 학습 계획 마감일",
      color: study.color,
      createdAt: plan.createdAt,
      kind: "personal-plan-deadline" as const,
      personalStudyId: study.id,
    }];
  });

  return [...studyEvents, ...planEvents];
}

function getWeekStart(date: Date) {
  const next = new Date(date);
  const day = next.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  next.setDate(next.getDate() + diff);
  next.setHours(0, 0, 0, 0);
  return next;
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

function formatWeekRange(weekStart: Date) {
  const weekEnd = addDays(weekStart, 6);
  return `${weekStart.toLocaleDateString("ko-KR", {
    month: "long",
    day: "numeric",
  })} - ${weekEnd.toLocaleDateString("ko-KR", { month: "long", day: "numeric" })}`;
}

function getMonthStart(year: number, month: number) {
  return new Date(year, month - 1, 1);
}

function getMonthCalendarCells(year: number, month: number) {
  const firstDay = getMonthStart(year, month);
  const startOffset = firstDay.getDay();
  const calendarStart = addDays(firstDay, -startOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const date = addDays(calendarStart, index);
    return {
      date,
      dateKey: formatDateKey(date),
      inMonth: date.getMonth() === month - 1,
      dayOfWeek: date.getDay(),
    };
  });
}

function getNoteDisplayName(note?: MyNote) {
  return note?.fileName ?? note?.title ?? "";
}

export default function TimetablePage() {
  const router = useRouter();
  const currentTerm = getCurrentAcademicTermLabel();
  const [courses, setCourses] = useState<Course[]>([]);
  const [workSchedules, setWorkSchedules] = useState<WorkSchedule[]>([]);
  const [termOptions, setTermOptions] = useState<string[]>(() => [currentTerm]);
  const [selectedTerm, setSelectedTerm] = useState(currentTerm);
  const [termDialogOpen, setTermDialogOpen] = useState(false);
  const [newTerm, setNewTerm] = useState<{ year: number; season: TermSeason }>(() => {
    const parsed = parseAcademicTerm(currentTerm);
    return parsed ?? { year: new Date().getFullYear(), season: "1학기" };
  });
  const [personalStudies, setPersonalStudies] = useState<PersonalStudy[]>([]);
  const [personalStudyPlans, setPersonalStudyPlans] = useState<PersonalStudyPlan[]>([]);
  const [monthlyEvents, setMonthlyEvents] = useState<MonthlyEvent[]>([]);
  const [courseSessions, setCourseSessions] = useState<CourseSessionProgress[]>([]);
  const [myNotes, setMyNotes] = useState<MyNote[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [selectedOccurrence, setSelectedOccurrence] =
    useState<CourseOccurrence | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<MonthlyEvent | null>(null);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [viewTab, setViewTab] = useState<"weekly" | "monthly">("weekly");
  const [maxCredits, setMaxCredits] = useState(18);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const today = new Date();
    return today.getFullYear() === 2026 ? today.getMonth() + 1 : 1;
  });
  const [sessionFeedback, setSessionFeedback] = useState("");
  const [actionFeedback, setActionFeedback] = useState("");
  const [ajouCourses, setAjouCourses] = useState<Course[]>([]);
  const [personalOpen, setPersonalOpen] = useState(false);
  const [scheduleDialog, setScheduleDialog] = useState<{
    open: boolean;
    initial: ScheduleForm;
    editing: { kind: "event" | "work"; id: string } | null;
  }>(() => ({ open: false, initial: emptyScheduleForm(), editing: null }));
  const [newPersonalStudy, setNewPersonalStudy] = useState({
    title: "",
    category: "자격증",
    goal: "",
    targetDate: "",
    color: SCHEDULE_COLORS[0],
  });
  const [sessionForm, setSessionForm] = useState({
    progressTitle: "",
    progressMemo: "",
    noteId: "",
    pageStart: "",
    pageEnd: "",
    difficulty: "중" as PaceLevel,
    pace: "중" as PaceLevel,
  });

  useEffect(() => {
    function syncData() {
      const allCourses = getAllStoredCourses();
      setTermOptions(
        sortAcademicTerms([
          currentTerm,
          selectedTerm,
          ...getTimetableTerms(),
          ...(allCourses.map((course) => course.term).filter(Boolean) as string[]),
        ]),
      );
      setCourses(getStoredCourses(selectedTerm));
      setAjouCourses(getStoredCourses(AJOU_TERM));
      setWorkSchedules(getWorkSchedules());
      setMaxCredits(getMaxCredits());
      setPersonalStudies(
        getPersonalStudies().filter((study) => (study.status ?? "active") === "active"),
      );
      setPersonalStudyPlans(getAllPersonalStudyPlans());
      setMonthlyEvents(getMonthlyEvents());
      setCourseSessions(getCourseSessions());
      getMyNotes().then(setMyNotes).catch(() => setMyNotes([]));
    }

    const timeout = window.setTimeout(syncData, 0);
    window.addEventListener("storage", syncData);
    window.addEventListener(COURSES_CHANGED_EVENT, syncData);
    window.addEventListener(PERSONAL_STUDIES_CHANGED_EVENT, syncData);
    window.addEventListener(PERSONAL_STUDY_PLANS_CHANGED_EVENT, syncData);
    window.addEventListener(WORK_SCHEDULES_CHANGED_EVENT, syncData);

    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("storage", syncData);
      window.removeEventListener(COURSES_CHANGED_EVENT, syncData);
      window.removeEventListener(PERSONAL_STUDIES_CHANGED_EVENT, syncData);
      window.removeEventListener(PERSONAL_STUDY_PLANS_CHANGED_EVENT, syncData);
      window.removeEventListener(WORK_SCHEDULES_CHANGED_EVENT, syncData);
    };
  }, [selectedTerm, currentTerm]);

  useEffect(() => {
    if (!sessionFeedback && !actionFeedback) return;

    const timeout = window.setTimeout(() => {
      setSessionFeedback("");
      setActionFeedback("");
    }, 2400);
    return () => window.clearTimeout(timeout);
  }, [sessionFeedback, actionFeedback]);

  const totalCredits = courses.reduce((sum, c) => sum + c.credits, 0);
  const remainingCredits = maxCredits - totalCredits;
  const unscheduledCourses = courses.filter(isUnscheduledCourse);
  // 하루 종일 일정은 시간 겹침 검사 대상이 아니다.
  const timedWorkSchedules = workSchedules.filter((work) => !work.allDay);

  function changeMaxCredits(value: number) {
    setMaxCredits(value);
    saveMaxCredits(value);
  }

  function persistCourses(nextCourses: Course[]) {
    setCourses(nextCourses);
    saveStoredCourses(nextCourses, selectedTerm);
  }

  async function addCatalogCourses(additions: Course[]) {
    const owner = getStorageUser();
    // Re-read at commit time: another tab may have edited the timetable while the picker was open.
    const next = [...getStoredCourses(AJOU_TERM)];
    const currentWork = getWorkSchedules().filter((work) => !work.allDay);
    for (const course of additions) {
      // A failed sync keeps the local record queued. Retry the queue without duplicating it.
      if (next.some(item => item.id === course.id)) continue;
      if (next.some((item) => item.id === course.id || sameCatalogSubject({ registrationNumber: course.registrationNumber ?? "", subjectId: course.catalogSubjectId ?? "", courseCode: course.courseCode ?? "" }, item))) {
        throw new Error(`${course.name} 과목이 이미 편성되어 있습니다. 선택을 확인해주세요.`);
      }
      const conflict = next.find((item) => schedulesOverlap(courseSchedules(course), courseSchedules(item)));
      const workConflict = currentWork.find((item) => schedulesOverlap(courseSchedules(course), courseSchedules(item)));
      if (conflict || workConflict) throw new Error(`${course.name}: ${conflict?.name ?? workConflict?.title} 일정과 시간이 겹칩니다.`);
      next.push(course);
    }
    saveStoredCourses(next, AJOU_TERM);
    if (owner) {
      try {
        await flushP0Changes();
      } catch {
        throw new Error("DB 저장을 완료하지 못했습니다. 과목은 이 기기에 임시 저장되어 있으며, 연결이 복구되면 다시 동기화됩니다. 다시 시도해주세요.");
      }
      if (getStorageUser() !== owner) throw new Error("계정이 변경되었습니다. 현재 계정의 시간표를 다시 확인해주세요.");
      window.dispatchEvent(new Event("unilink:p0SyncSuccess"));
    }
    setAjouCourses(next);
    changeSelectedTerm(AJOU_TERM);
    setTermOptions((previous) => sortAcademicTerms([...previous, AJOU_TERM]));
    setCourses(next);
    setActionFeedback(owner
      ? `${additions.length}개 과목·학습 목표·수업시간을 DB에 저장했습니다.`
      : `${additions.length}개 과목을 ${AJOU_TERM} 데모 시간표에 추가했습니다.`);
  }

  function persistPersonalStudies(nextStudies: PersonalStudy[]) {
    setPersonalStudies(nextStudies);
    savePersonalStudies(nextStudies);
  }

  function persistMonthlyEvents(nextEvents: MonthlyEvent[]) {
    setMonthlyEvents(nextEvents);
    saveMonthlyEvents(nextEvents);
  }

  function persistWorkSchedules(nextSchedules: WorkSchedule[]) {
    setWorkSchedules(nextSchedules);
    saveWorkSchedules(nextSchedules);
  }

  function changeSelectedTerm(term: string) {
    setSelectedTerm(term);
    setSelectedCourse(null);
    setSelectedOccurrence(null);
    setSelectedEvent(null);
    setEditingCourse(null);
  }

  function addTimetableTerm() {
    const term = formatAcademicTerm(newTerm.year, newTerm.season);
    saveTimetableTerms([...getTimetableTerms(), term]);
    setTermOptions((previous) => sortAcademicTerms([...previous, term]));
    changeSelectedTerm(term);
    setTermDialogOpen(false);
  }

  function deleteTimetable() {
    const term = selectedTerm;
    const count = getStoredCourses(term).length;
    const message = count
      ? `${term} 시간표와 등록된 ${count}개 과목을 삭제할까요?`
      : `${term} 시간표를 삭제할까요?`;
    if (!window.confirm(message)) return;
    saveStoredCourses([], term);
    saveTimetableTerms(getTimetableTerms().filter((item) => item !== term));
    // 현재 학기는 기본 시간표라 목록에 남고 과목만 비워진다
    setTermOptions((previous) => previous.filter((item) => item !== term || item === currentTerm));
    if (term === AJOU_TERM) setAjouCourses([]);
    setCourses([]);
    changeSelectedTerm(currentTerm);
    setActionFeedback(`${term} 시간표를 삭제했습니다.`);
  }

  function addManualCourse(course: Course) {
    persistCourses([...courses, course]);
    setActionFeedback(`${course.name} 과목을 ${selectedTerm} 시간표에 추가했습니다.`);
  }

  function toggleEditingDay(day: DayOfWeek) {
    setEditingCourse((prev) => {
      if (!prev) return prev;

      return {
        ...prev,
        days: prev.days.includes(day)
          ? prev.days.filter((item) => item !== day)
          : [...prev.days, day],
      };
    });
  }

  function openScheduleDialog(
    overrides: Partial<ScheduleForm> = {},
    editing: { kind: "event" | "work"; id: string } | null = null,
    initial?: ScheduleForm,
  ) {
    setScheduleDialog({
      open: true,
      editing,
      initial:
        initial ??
        emptyScheduleForm({
          color:
            SCHEDULE_COLORS[(monthlyEvents.length + workSchedules.length) % SCHEDULE_COLORS.length],
          ...overrides,
        }),
    });
  }

  function saveSchedule(form: ScheduleForm) {
    const editing = scheduleDialog.editing;
    const existingEvent =
      editing?.kind === "event" ? monthlyEvents.find((item) => item.id === editing.id) : undefined;
    const existingWork =
      editing?.kind === "work" ? workSchedules.find((item) => item.id === editing.id) : undefined;

    if (form.repeat) {
      const work = buildWork(form, existingWork);
      persistWorkSchedules(
        existingWork
          ? workSchedules.map((item) => (item.id === work.id ? work : item))
          : [...workSchedules, work],
      );
      // 날짜 일정을 요일 반복으로 바꾼 경우 기존 날짜 일정은 지운다.
      if (existingEvent) {
        persistMonthlyEvents(monthlyEvents.filter((item) => item.id !== existingEvent.id));
        if (selectedEvent?.id === existingEvent.id) setSelectedEvent(null);
      }
    } else {
      const event = buildEvent(form, existingEvent);
      persistMonthlyEvents(
        existingEvent
          ? monthlyEvents.map((item) => (item.id === event.id ? event : item))
          : [event, ...monthlyEvents],
      );
      if (existingWork) {
        persistWorkSchedules(workSchedules.filter((item) => item.id !== existingWork.id));
      }
      if (selectedEvent && selectedEvent.id === existingEvent?.id) setSelectedEvent(event);
    }

    setScheduleDialog((prev) => ({ ...prev, open: false, editing: null }));
    setActionFeedback(
      editing ? `${form.title.trim()} 일정이 수정되었습니다.` : `${form.title.trim()} 일정이 등록되었습니다.`,
    );
  }

  function startEditingWorkSchedule(schedule: WorkSchedule) {
    openScheduleDialog({}, { kind: "work", id: schedule.id }, formFromWork(schedule));
  }

  function addPersonalStudy() {
    if (!newPersonalStudy.title.trim()) return;
    const study: PersonalStudy = {
      id: Date.now().toString(),
      title: newPersonalStudy.title.trim(),
      category: newPersonalStudy.category,
      goal: newPersonalStudy.goal.trim(),
      targetDate: newPersonalStudy.targetDate,
      color: newPersonalStudy.color,
      createdAt: new Date().toISOString(),
    };
    persistPersonalStudies([...personalStudies, study]);
    setPersonalOpen(false);
    setNewPersonalStudy({
      title: "",
      category: "자격증",
      goal: "",
      targetDate: "",
      color: SCHEDULE_COLORS[personalStudies.length % SCHEDULE_COLORS.length],
    });
    setActionFeedback(`${study.title} 개인 학습이 등록되었습니다.`);
  }

  function completeStudyFromList(study: PersonalStudy) {
    const completed = completePersonalStudy(study.id);
    if (!completed) return;
    addCompletedPersonalStudySpec(completed);
    setPersonalStudies((prev) => prev.filter((item) => item.id !== study.id));
    setActionFeedback(`${study.title} 학습을 완료하고 내 스펙에 등록했습니다.`);
  }

  function deleteStudyFromList(study: PersonalStudy) {
    if (!window.confirm(`${study.title} 학습과 연결된 계획·자료를 삭제할까요?`)) return;
    deletePersonalStudy(study.id);
    setPersonalStudies((prev) => prev.filter((item) => item.id !== study.id));
    setActionFeedback(`${study.title} 개인 학습이 삭제되었습니다.`);
  }

  function startEditingMonthlyEvent(event: MonthlyEvent) {
    openScheduleDialog({}, { kind: "event", id: event.id }, formFromEvent(event));
  }

  function selectOccurrence(occurrence: CourseOccurrence) {
    router.push(`/course?courseId=${encodeURIComponent(occurrence.course.id)}`);
    const saved = getCourseSession(
      occurrence.course.id,
      occurrence.date,
      occurrence.startTime,
    );

    setSelectedOccurrence(occurrence);
    setSelectedCourse(occurrence.course);
    setSelectedEvent(null);
    setSessionForm({
      progressTitle: saved?.progressTitle ?? "",
      progressMemo: saved?.progressMemo ?? "",
      noteId: saved?.noteId ?? "",
      pageStart: saved?.pageStart ?? "",
      pageEnd: saved?.pageEnd ?? "",
      difficulty: saved?.difficulty ?? "중",
      pace: saved?.pace ?? "중",
    });
  }

  function saveSessionProgress() {
    if (!selectedOccurrence) return;

    const note = myNotes.find((item) => item.id === sessionForm.noteId);
    const now = new Date().toISOString();
    const existing = getCourseSession(
      selectedOccurrence.course.id,
      selectedOccurrence.date,
      selectedOccurrence.startTime,
    );
    const session: CourseSessionProgress = {
      id: existing?.id ?? `${selectedOccurrence.course.id}-${selectedOccurrence.date}`,
      courseId: selectedOccurrence.course.id,
      courseName: selectedOccurrence.course.name,
      date: selectedOccurrence.date,
      startTime: selectedOccurrence.startTime,
      endTime: selectedOccurrence.endTime,
      progressTitle: sessionForm.progressTitle.trim(),
      progressMemo: sessionForm.progressMemo.trim(),
      noteId: sessionForm.noteId,
      noteTitle: getNoteDisplayName(note),
      pageStart: sessionForm.pageStart,
      pageEnd: sessionForm.pageEnd,
      difficulty: sessionForm.difficulty,
      pace: sessionForm.pace,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    saveCourseSession(session);
    setCourseSessions((prev) => {
      const existingIndex = prev.findIndex(
        (item) =>
          item.courseId === session.courseId &&
          item.date === session.date &&
          item.startTime === session.startTime,
      );

      if (existingIndex < 0) return [session, ...prev];

      return prev.map((item, index) => (index === existingIndex ? session : item));
    });
    setSessionFeedback("세션 진도가 저장되었습니다.");
  }

  function saveEditedCourse() {
    // 요일을 비우면 시간 미정·별도 운영 과목으로 저장한다.
    if (!editingCourse || !editingCourse.name.trim()) {
      return;
    }
    const fallbackStart = editingCourse.startTime || "09:00";
    const fallbackEnd = editingCourse.endTime || "10:00";

    const existingSchedules = editingCourse.schedules?.length
      ? editingCourse.schedules
      : editingCourse.days.map((day) => ({
          day,
          startTime: fallbackStart,
          endTime: fallbackEnd,
        }));
    const schedules = editingCourse.days.flatMap(
      (day) => {
        const matches = existingSchedules.filter((schedule) => schedule.day === day);
        return matches.length ? matches : [{
          day,
          startTime: fallbackStart,
          endTime: fallbackEnd,
        }];
      },
    );
    const updatedCourse: Course = {
      ...editingCourse,
      schedules,
      startTime: schedules[0]?.startTime ?? "",
      endTime: schedules[0]?.endTime ?? "",
      name: editingCourse.name.trim(),
      professor: editingCourse.professor.trim(),
      location: editingCourse.location.trim(),
      term: selectedTerm,
      courseType: editingCourse.courseType ?? "major",
    };
    const nextCourses = courses.map((course) =>
      course.id === updatedCourse.id ? updatedCourse : course,
    );

    persistCourses(nextCourses);
    setSelectedCourse(updatedCourse);
    setSelectedOccurrence((prev) =>
      prev && prev.course.id === updatedCourse.id
        ? {
            ...prev,
            course: updatedCourse,
            startTime: updatedCourse.startTime,
            endTime: updatedCourse.endTime,
          }
        : prev,
    );
    setEditingCourse(null);
    setActionFeedback(`${updatedCourse.name} 수업 정보가 수정되었습니다.`);
  }

  function removeCourse(id: string) {
    const target = courses.find((course) => course.id === id);
    persistCourses(courses.filter((c) => c.id !== id));
    setSelectedCourse(null);
    setSelectedOccurrence(null);
    setEditingCourse(null);
    setActionFeedback(
      target ? `${target.name} 수업이 삭제되었습니다.` : "수업이 삭제되었습니다.",
    );
  }

  const courseNotes = selectedCourse
    ? myNotes.filter(
        (note) => note.linkedType === "course" && note.linkedId === selectedCourse.id,
      )
    : [];
  const selectedSessionNote = myNotes.find((note) => note.id === sessionForm.noteId);
  const monthCells = getMonthCalendarCells(2026, calendarMonth);
  const personalStudyDeadlineEvents = useMemo(
    () => getPersonalStudyDeadlineEvents(personalStudies, personalStudyPlans),
    [personalStudies, personalStudyPlans],
  );
  const calendarEvents = [...monthlyEvents, ...personalStudyDeadlineEvents];

  function openNewEventForDate(dateKey: string) {
    openScheduleDialog({ date: dateKey });
  }

  function openMonthlyEvent(event: MonthlyEvent) {
    setSelectedEvent(event);
    setSelectedCourse(null);
    setSelectedOccurrence(null);
    setWeekStart(getWeekStart(new Date(event.date)));
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Header title="시간표" />
      <div className="flex-1 p-6 max-w-[1600px] mx-auto w-full">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-2">
            <Select
              value={selectedTerm}
              onValueChange={(value) => value && changeSelectedTerm(value)}
            >
              <SelectTrigger className="w-44 bg-white" aria-label="시간표 선택">
                <SelectValue />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false} align="start">
                {termOptions.map((term) => (
                  <SelectItem key={term} value={term}>
                    {term}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Dialog open={termDialogOpen} onOpenChange={setTermDialogOpen}>
              <DialogTrigger
                render={
                  <Button
                    variant="outline"
                    size="icon"
                    className="bg-white"
                    aria-label="시간표 추가"
                    title="시간표 추가"
                  />
                }
              >
                <Plus className="h-4 w-4" />
              </DialogTrigger>
              <DialogContent className="max-w-sm">
                <DialogHeader>
                  <DialogTitle>시간표 추가</DialogTitle>
                </DialogHeader>
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <Select
                    value={String(newTerm.year)}
                    onValueChange={(value) =>
                      value && setNewTerm((prev) => ({ ...prev, year: Number(value) }))
                    }
                  >
                    <SelectTrigger className="w-full" aria-label="연도">
                      <SelectValue>{`${newTerm.year}년`}</SelectValue>
                    </SelectTrigger>
                    <SelectContent alignItemWithTrigger={false} className="max-h-72">
                      {TERM_YEAR_OPTIONS.map((year) => (
                        <SelectItem key={year} value={String(year)}>
                          {year}년
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={newTerm.season}
                    onValueChange={(value) =>
                      value && setNewTerm((prev) => ({ ...prev, season: value as TermSeason }))
                    }
                  >
                    <SelectTrigger className="w-full" aria-label="학기">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent alignItemWithTrigger={false}>
                      {TERM_SEASONS.map((season) => (
                        <SelectItem key={season} value={season}>
                          {season}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button className="w-full" onClick={addTimetableTerm}>
                  {termOptions.includes(formatAcademicTerm(newTerm.year, newTerm.season))
                    ? "이 시간표로 이동"
                    : "추가"}
                </Button>
              </DialogContent>
            </Dialog>
            <Button
              variant="outline"
              size="icon"
              className="bg-white text-muted-foreground hover:text-destructive"
              aria-label="시간표 삭제"
              title="시간표 삭제"
              disabled={selectedTerm === currentTerm && courses.length === 0}
              onClick={deleteTimetable}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="gap-2" onClick={() => openScheduleDialog()}>
              <CalendarDays className="h-4 w-4" /> 일정 추가
            </Button>
            <ScheduleDialog
              open={scheduleDialog.open}
              initial={scheduleDialog.initial}
              editing={Boolean(scheduleDialog.editing)}
              onOpenChange={(open) =>
                setScheduleDialog((prev) => ({
                  ...prev,
                  open,
                  editing: open ? prev.editing : null,
                }))
              }
              onSubmit={saveSchedule}
            />

            <ManualCourseDialog
              term={selectedTerm}
              existingCourses={courses}
              workSchedules={workSchedules}
              onAdd={addManualCourse}
            />
            <AjouCoursePicker
              selectedTerm={selectedTerm}
              existingCourses={selectedTerm === AJOU_TERM ? courses : ajouCourses}
              workSchedules={timedWorkSchedules}
              onApply={addCatalogCourses}
            />
          </div>
        </div>

        {actionFeedback && (
          <div className="mb-4 flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
            <CheckCircle2 className="h-4 w-4" />
            {actionFeedback}
          </div>
        )}

        <div className="grid 2xl:grid-cols-[minmax(0,1fr)_320px] gap-6">
          <div className="min-w-0">
            <Tabs
              value={viewTab}
              onValueChange={(value) => setViewTab(value as "weekly" | "monthly")}
            >
              <div className="flex items-center justify-between gap-3 mb-3">
                <TabsList className="bg-white border shadow-sm">
                  <TabsTrigger value="weekly">주간 시간표</TabsTrigger>
                  <TabsTrigger value="monthly">월간 일정</TabsTrigger>
                </TabsList>
                {viewTab === "weekly" ? (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon-sm"
                      aria-label="이전 주"
                      onClick={() => setWeekStart((prev) => addDays(prev, -7))}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <div className="min-w-40 text-center text-sm font-medium">
                      {formatWeekRange(weekStart)}
                    </div>
                    <Button
                      variant="outline"
                      size="icon-sm"
                      aria-label="다음 주"
                      onClick={() => setWeekStart((prev) => addDays(prev, 7))}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon-sm"
                      aria-label="이전 달"
                      disabled={calendarMonth === 1}
                      onClick={() => setCalendarMonth((prev) => Math.max(1, prev - 1))}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <div className="min-w-40 text-center text-sm font-medium">
                      2026년 {calendarMonth}월
                    </div>
                    <Button
                      variant="outline"
                      size="icon-sm"
                      aria-label="다음 달"
                      disabled={calendarMonth === 12}
                      onClick={() => setCalendarMonth((prev) => Math.min(12, prev + 1))}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>

              <TabsContent value="weekly">
                <Card className="border-0 shadow-sm">
                  <CardContent className="p-4">
                    <p className="mb-3 text-xs text-muted-foreground">
                      빈 시간대를 누르면 해당 요일과 시간으로 일정을 추가할 수 있습니다.
                    </p>
                    <TimetableGrid
                      courses={courses}
                      workSchedules={workSchedules}
                      monthlyEvents={calendarEvents}
                      courseSessions={courseSessions}
                      weekStart={weekStart}
                      onCourseClick={selectOccurrence}
                      onEventClick={openMonthlyEvent}
                      onWorkClick={startEditingWorkSchedule}
                      onTimeSlotClick={({ day, date, startTime, endTime }) =>
                        openScheduleDialog({
                          repeat: true,
                          days: [day],
                          date,
                          startTime,
                          endTime,
                          dayTimes: { [day]: { startTime, endTime } },
                        })
                      }
                    />
                    {unscheduledCourses.length > 0 && (
                      <div
                        className="mt-3 overflow-hidden rounded-xl border bg-white"
                        aria-label={`${UNSCHEDULED_LABEL} 과목`}
                      >
                        {unscheduledCourses.map((course) => (
                          <button
                            key={course.id}
                            type="button"
                            onClick={() => {
                              setSelectedCourse(course);
                              setSelectedOccurrence(null);
                              setSelectedEvent(null);
                              setEditingCourse(null);
                            }}
                            className="flex w-full items-center gap-3 border-b px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-accent"
                          >
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-full"
                              style={{ backgroundColor: course.color }}
                            />
                            <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                              {course.name}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="monthly">
                <Card className="border-0 shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">
                      2026년 {calendarMonth}월 월간 일정
                    </CardTitle>
                    <p className="mt-1 text-xs text-muted-foreground">
                      날짜를 누르면 일정 추가, 일정 칩을 누르면 상세를 볼 수 있습니다.
                    </p>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-7 border-y bg-muted/30 text-center text-xs font-semibold text-muted-foreground">
                      {["일", "월", "화", "수", "목", "금", "토"].map((day) => (
                        <div key={day} className="py-2">
                          {day}
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 rounded-b-xl border-l">
                      {monthCells.map(({ date, dateKey, inMonth, dayOfWeek }) => {
                        const holidays = KOREA_2026_HOLIDAYS[dateKey] ?? [];
                        const dayEvents = calendarEvents
                          .filter((event) => event.date === dateKey)
                          .sort(
                            (a, b) =>
                              Number(Boolean(b.allDay)) - Number(Boolean(a.allDay)) ||
                              a.startTime.localeCompare(b.startTime),
                          );
                        const isSundayOrHoliday = dayOfWeek === 0 || holidays.length > 0;
                        const isSaturday = dayOfWeek === 6;

                        return (
                          <div
                            key={dateKey}
                            role="button"
                            tabIndex={0}
                            onClick={() => openNewEventForDate(dateKey)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                openNewEventForDate(dateKey);
                              }
                            }}
                            className={`min-h-28 border-b border-r p-2 text-left outline-none transition-colors hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-primary ${
                              inMonth ? "bg-white" : "bg-muted/20 text-muted-foreground"
                            }`}
                          >
                            <div className="mb-1 flex items-start justify-between gap-1">
                              <span
                                className={`text-sm font-semibold ${
                                  isSundayOrHoliday
                                    ? "text-red-600"
                                    : isSaturday
                                      ? "text-blue-600"
                                      : ""
                                }`}
                              >
                                {date.getDate()}
                              </span>
                              {holidays.length > 0 && (
                                <Badge
                                  variant="secondary"
                                  className="h-5 bg-red-50 px-1.5 text-[10px] text-red-600"
                                >
                                  휴일
                                </Badge>
                              )}
                            </div>
                            <div className="space-y-1">
                              {holidays.map((holiday) => (
                                <div
                                  key={holiday}
                                  className="truncate rounded bg-red-50 px-1.5 py-0.5 text-[11px] font-medium text-red-600"
                                >
                                  {holiday}
                                </div>
                              ))}
                              {dayEvents.slice(0, 3).map((event) => (
                                <button
                                  key={event.id}
                                  type="button"
                                  onClick={(clickEvent) => {
                                    clickEvent.stopPropagation();
                                    openMonthlyEvent(event);
                                  }}
                                  className="block w-full truncate rounded px-1.5 py-1 text-left text-[11px] font-medium text-white shadow-sm"
                                  style={{ backgroundColor: event.color }}
                                  title={event.allDay ? event.title : `${event.startTime} ${event.title}`}
                                >
                                  {event.allDay ? event.title : `${event.startTime} ${event.title}`}
                                </button>
                              ))}
                              {dayEvents.length > 3 && (
                                <div className="text-[11px] font-medium text-muted-foreground">
                                  +{dayEvents.length - 3}개 더
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">
                      공휴일은 2026년 대한민국 공휴일과 대체공휴일 기준으로 표시했습니다.
                    </p>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>

          <div className="space-y-4">
            {workSchedules.length > 0 && (
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Repeat className="h-4 w-4" /> 반복 일정
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {workSchedules.map((schedule) => (
                    <div key={schedule.id} className="flex items-center justify-between gap-2 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{schedule.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {schedule.allDay
                            ? `${schedule.days.join(", ")} · 하루 종일`
                            : schedule.schedules?.length
                            ? schedule.schedules
                                .map((item) => `${item.day} ${item.startTime}-${item.endTime}`)
                                .join(" · ")
                            : `${schedule.days.join(", ")} · ${schedule.startTime} - ${schedule.endTime}`}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          title="일정 수정"
                          aria-label="일정 수정"
                          onClick={() => startEditingWorkSchedule(schedule)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          title="일정 삭제"
                          aria-label="일정 삭제"
                          onClick={() => {
                            persistWorkSchedules(workSchedules.filter((item) => item.id !== schedule.id));
                            setActionFeedback(`${schedule.title} 일정이 삭제되었습니다.`);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
            {selectedCourse ? (
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">수업 상세</CardTitle>
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => setEditingCourse(selectedCourse)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <button
                        onClick={() => {
                          setSelectedCourse(null);
                          setSelectedOccurrence(null);
                          setEditingCourse(null);
                        }}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: selectedCourse.color }}
                    />
                    <span className="font-semibold">{selectedCourse.name}</span>
                    <Badge variant="secondary">
                      {COURSE_TYPE_LABELS[selectedCourse.courseType ?? "major"]}
                    </Badge>
                  </div>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <BookOpen className="h-3.5 w-3.5" />
                      <span>{selectedCourse.professor} 교수</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="h-3.5 w-3.5" />
                      <span>{selectedCourse.location}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5" />
                      <span>
                        {isUnscheduledCourse(selectedCourse)
                          ? UNSCHEDULED_LABEL
                          : `${selectedCourse.days.join(", ")} ${selectedCourse.startTime} - ${selectedCourse.endTime}`}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Users className="h-3.5 w-3.5" />
                      <span>같은 수업 49명</span>
                    </div>
                  </div>
                  {editingCourse?.id === selectedCourse.id && (
                    <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="col-span-2 space-y-2">
                          <Label>수업명</Label>
                          <Input
                            value={editingCourse.name}
                            onChange={(event) =>
                              setEditingCourse((prev) =>
                                prev ? { ...prev, name: event.target.value } : prev,
                              )
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>교수명</Label>
                          <Input
                            value={editingCourse.professor}
                            onChange={(event) =>
                              setEditingCourse((prev) =>
                                prev ? { ...prev, professor: event.target.value } : prev,
                              )
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>강의실</Label>
                          <Input
                            value={editingCourse.location}
                            onChange={(event) =>
                              setEditingCourse((prev) =>
                                prev ? { ...prev, location: event.target.value } : prev,
                              )
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>학점</Label>
                          <Select
                            value={String(editingCourse.credits)}
                            onValueChange={(value) =>
                              value &&
                              setEditingCourse((prev) =>
                                prev ? { ...prev, credits: Number(value) } : prev,
                              )
                            }
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {[1, 2, 3, 4].map((credit) => (
                                <SelectItem key={credit} value={String(credit)}>
                                  {credit}학점
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>구분</Label>
                          <Select
                            value={editingCourse.courseType ?? "major"}
                            onValueChange={(value) =>
                              value &&
                              setEditingCourse((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      courseType: value as Course["courseType"],
                                    }
                                  : prev,
                              )
                            }
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue>
                                {COURSE_TYPE_LABELS[editingCourse.courseType ?? "major"]}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(COURSE_TYPE_LABELS).map(([value, label]) => (
                                <SelectItem key={value} value={value}>
                                  {label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>요일</Label>
                        <div className="flex flex-wrap gap-2">
                          {DAYS.map((day) => (
                            <button
                              key={day}
                              type="button"
                              onClick={() => toggleEditingDay(day)}
                              className={`h-8 w-8 rounded-full text-xs font-medium transition-colors ${
                                editingCourse.days.includes(day)
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-background text-muted-foreground hover:bg-accent"
                              }`}
                            >
                              {day}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-2">
                          <Label>시작 시간</Label>
                          <TimeField
                            value={editingCourse.startTime}
                            onChange={(value) =>
                              setEditingCourse((prev) =>
                                prev ? { ...prev, startTime: value } : prev,
                              )
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>종료 시간</Label>
                          <TimeField
                            value={editingCourse.endTime}
                            onChange={(value) =>
                              setEditingCourse((prev) =>
                                prev ? { ...prev, endTime: value } : prev,
                              )
                            }
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>색상</Label>
                        <ScheduleColorPicker
                          value={editingCourse.color}
                          labelPrefix="수업"
                          onChange={(color) =>
                            setEditingCourse((prev) =>
                              prev ? { ...prev, color } : prev,
                            )
                          }
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Button size="sm" className="text-xs" onClick={saveEditedCourse}>
                          수정 저장
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs"
                          onClick={() => setEditingCourse(null)}
                        >
                          취소
                        </Button>
                      </div>
                    </div>
                  )}
                  <div className="pt-2 space-y-2">
                    <Link
                      href={`/course?courseId=${encodeURIComponent(selectedCourse.id)}`}
                    >
                      <Button size="sm" className="w-full text-xs gap-1">
                        <Users className="h-3.5 w-3.5" /> 수업 페이지 열기
                      </Button>
                    </Link>
                    {selectedOccurrence && (
                      <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground">
                            {selectedOccurrence.date} {selectedOccurrence.startTime} -{" "}
                            {selectedOccurrence.endTime}
                          </p>
                          <p className="text-sm font-medium mt-1">그날 수업 진도</p>
                        </div>
                        <div className="space-y-2">
                          <Label>진도 제목</Label>
                          <Input
                            placeholder="예: 프로세스 동기화"
                            value={sessionForm.progressTitle}
                            onChange={(event) =>
                              setSessionForm((prev) => ({
                                ...prev,
                                progressTitle: event.target.value,
                              }))
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>연결할 강의 노트</Label>
                          <Select
                            value={sessionForm.noteId}
                            onValueChange={(value) =>
                              setSessionForm((prev) => ({
                                ...prev,
                                noteId: value ?? prev.noteId,
                              }))
                            }
                          >
                            <SelectTrigger className="w-full">
                              {selectedSessionNote ? (
                                <span className="flex flex-1 truncate text-left">
                                  {getNoteDisplayName(selectedSessionNote)}
                                </span>
                              ) : (
                                <SelectValue placeholder="나의 노트에서 선택" />
                              )}
                            </SelectTrigger>
                            <SelectContent>
                              {courseNotes.length > 0 ? (
                                courseNotes.map((note) => (
                                  <SelectItem key={note.id} value={note.id}>
                                    {getNoteDisplayName(note)}
                                  </SelectItem>
                                ))
                              ) : (
                                <SelectItem value="none" disabled>
                                  분류된 강의 노트 없음
                                </SelectItem>
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-2">
                            <Label>시작 페이지</Label>
                            <Input
                              inputMode="numeric"
                              placeholder="예: 12"
                              value={sessionForm.pageStart}
                              onChange={(event) =>
                                setSessionForm((prev) => ({
                                  ...prev,
                                  pageStart: event.target.value,
                                }))
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>종료 페이지</Label>
                            <Input
                              inputMode="numeric"
                              placeholder="예: 24"
                              value={sessionForm.pageEnd}
                              onChange={(event) =>
                                setSessionForm((prev) => ({
                                  ...prev,
                                  pageEnd: event.target.value,
                                }))
                              }
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-2">
                            <Label>내용 난이도</Label>
                            <Select
                              value={sessionForm.difficulty}
                              onValueChange={(value) =>
                                setSessionForm((prev) => ({
                                  ...prev,
                                  difficulty: (value as PaceLevel) ?? prev.difficulty,
                                }))
                              }
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {LEVELS.map((level) => (
                                  <SelectItem key={level} value={level}>
                                    {level}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label>수업 빠르기</Label>
                            <Select
                              value={sessionForm.pace}
                              onValueChange={(value) =>
                                setSessionForm((prev) => ({
                                  ...prev,
                                  pace: (value as PaceLevel) ?? prev.pace,
                                }))
                              }
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {LEVELS.map((level) => (
                                  <SelectItem key={level} value={level}>
                                    {level}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label>수업 메모</Label>
                          <Textarea
                            rows={3}
                            placeholder="오늘 나간 세부 내용이나 복습 포인트"
                            value={sessionForm.progressMemo}
                            onChange={(event) =>
                              setSessionForm((prev) => ({
                                ...prev,
                                progressMemo: event.target.value,
                              }))
                            }
                          />
                        </div>
                        <Button
                          size="sm"
                          className="w-full text-xs"
                          onClick={saveSessionProgress}
                        >
                          세션 진도 저장
                        </Button>
                        {sessionFeedback && (
                          <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            {sessionFeedback}
                          </div>
                        )}
                        <p className="text-[11px] text-muted-foreground">
                          난이도와 빠르기는 추후 학습 코칭 AI의 진도 조절 가중치로
                          사용할 수 있습니다.
                        </p>
                      </div>
                    )}
                    <Button
                      size="sm"
                      variant="destructive"
                      className="w-full text-xs"
                      onClick={() => removeCourse(selectedCourse.id)}
                    >
                      수업 삭제
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : selectedEvent ? (
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">월간 일정 상세</CardTitle>
                    <button
                      onClick={() => setSelectedEvent(null)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: selectedEvent.color }}
                    />
                    <span className="font-semibold">{selectedEvent.title}</span>
                  </div>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <CalendarDays className="h-3.5 w-3.5" />
                      <span>{selectedEvent.date}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5" />
                      <span>
                        {selectedEvent.allDay
                          ? "하루 종일"
                          : `${selectedEvent.startTime} - ${selectedEvent.endTime}`}
                      </span>
                    </div>
                    {selectedEvent.location && (
                      <div className="flex items-center gap-2">
                        <MapPin className="h-3.5 w-3.5" />
                        <span>{selectedEvent.location}</span>
                      </div>
                    )}
                  </div>
                  {selectedEvent.memo && (
                    <p className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
                      {selectedEvent.memo}
                    </p>
                  )}
                  {selectedEvent.personalStudyId ? (
                    <Link
                      href={`/personal-study?studyId=${encodeURIComponent(selectedEvent.personalStudyId)}`}
                      className="block"
                    >
                      <Button size="sm" variant="outline" className="w-full text-xs">
                        개인 학습 열기
                      </Button>
                    </Link>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full text-xs"
                        onClick={() => startEditingMonthlyEvent(selectedEvent)}
                      >
                        <Pencil className="mr-1 h-3.5 w-3.5" />
                        일정 수정
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="w-full text-xs"
                        onClick={() => {
                          persistMonthlyEvents(
                            monthlyEvents.filter((event) => event.id !== selectedEvent.id),
                          );
                          setActionFeedback(`${selectedEvent.title} 일정이 삭제되었습니다.`);
                          setSelectedEvent(null);
                        }}
                      >
                        일정 삭제
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">수강 목록</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {courses.length > 0 ? (
                    courses.map((course) => (
                      <button
                        key={course.id}
                        onClick={() => {
                          setSelectedCourse(course);
                          setSelectedOccurrence(null);
                          setSelectedEvent(null);
                          setEditingCourse(null);
                        }}
                        className="w-full flex items-center gap-2.5 p-2 rounded-lg hover:bg-accent transition-colors text-left"
                      >
                        <div
                          className="h-3 w-3 rounded-full shrink-0"
                          style={{ backgroundColor: course.color }}
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{course.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {course.category ?? COURSE_TYPE_LABELS[course.courseType ?? "major"]} ·{" "}
                            {formatCourseDays(course)} · {course.credits}학점
                          </p>
                        </div>
                      </button>
                    ))
                  ) : (
                    <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                      현재 조건에 해당하는 수업이 없습니다.
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <div className="text-center space-y-1">
                  <div className="text-3xl font-bold text-primary">{totalCredits}</div>
                  <div className="text-xs text-muted-foreground">총 학점</div>
                  <div className="flex justify-center gap-2 mt-3">
                    <Badge variant="secondary" className="text-[10px]">
                      수업 {courses.length}개
                    </Badge>
                    <Badge
                      variant={remainingCredits <= 0 ? "destructive" : "secondary"}
                      className="text-[10px]"
                    >
                      {remainingCredits > 0
                        ? `${remainingCredits}학점 여유`
                        : remainingCredits === 0
                          ? "최대 학점"
                          : `${-remainingCredits}학점 초과`}
                    </Badge>
                  </div>
                  <div className="mt-3 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                    <span>최대 수강 학점</span>
                    <Select
                      value={String(maxCredits)}
                      onValueChange={(value) => changeMaxCredits(Number(value))}
                    >
                      <SelectTrigger className="h-7 w-24 text-xs" aria-label="최대 수강 학점">
                        <SelectValue>{`${maxCredits}학점`}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {MAX_CREDIT_OPTIONS.map((credit) => (
                          <SelectItem key={credit} value={String(credit)}>
                            {credit}학점
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Target className="h-4 w-4 text-primary" /> 개인 학습
                  </CardTitle>
                  <Dialog open={personalOpen} onOpenChange={setPersonalOpen}>
                    <DialogTrigger render={<Button size="sm" variant="outline" className="h-7 gap-1" />}>
                      <Plus className="h-3.5 w-3.5" /> 추가
                    </DialogTrigger>
                    <DialogContent className="max-w-md">
                      <DialogHeader>
                        <DialogTitle>개인 학습 추가</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 pt-2">
                        <div className="space-y-2">
                          <Label>공부 분야</Label>
                          <Input
                            placeholder="예: 정보처리기사, TOEIC, React"
                            value={newPersonalStudy.title}
                            onChange={(event) =>
                              setNewPersonalStudy((prev) => ({
                                ...prev,
                                title: event.target.value,
                              }))
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>분류</Label>
                          <Select
                            value={newPersonalStudy.category}
                            onValueChange={(value) =>
                              setNewPersonalStudy((prev) => ({
                                ...prev,
                                category: value ?? prev.category,
                              }))
                            }
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {["자격증", "어학", "취업", "개발", "취미", "기타"].map(
                                (category) => (
                                  <SelectItem key={category} value={category}>
                                    {category}
                                  </SelectItem>
                                ),
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>목표</Label>
                          <Textarea
                            rows={4}
                            placeholder="예: 6월 시험 전까지 기출 5회독"
                            value={newPersonalStudy.goal}
                            onChange={(event) =>
                              setNewPersonalStudy((prev) => ({
                                ...prev,
                                goal: event.target.value,
                              }))
                            }
                            />
                        </div>
                        <div className="space-y-2">
                          <Label>목표 기한</Label>
                          <Input
                            type="date"
                            value={newPersonalStudy.targetDate}
                            onChange={(event) =>
                              setNewPersonalStudy((prev) => ({
                                ...prev,
                                targetDate: event.target.value,
                              }))
                            }
                          />
                          <p className="text-xs text-muted-foreground">
                            설정한 날짜는 D-DAY로 표시되고 시간표 일정에 자동으로 추가됩니다.
                          </p>
                        </div>
                        <div className="space-y-2">
                          <Label>색상</Label>
                          <ScheduleColorPicker
                            value={newPersonalStudy.color}
                            labelPrefix="개인 학습"
                            onChange={(color) =>
                              setNewPersonalStudy((prev) => ({ ...prev, color }))
                            }
                          />
                        </div>
                        <Button onClick={addPersonalStudy} className="w-full">
                          추가하기
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {personalStudies.length > 0 ? (
                  personalStudies.map((study) => (
                    <div
                      key={study.id}
                      className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-accent transition-colors"
                    >
                      <Link
                        href={`/personal-study?studyId=${encodeURIComponent(study.id)}`}
                        className="flex min-w-0 flex-1 items-center gap-2.5"
                      >
                      <div
                        className="h-3 w-3 rounded-full shrink-0"
                        style={{ backgroundColor: study.color }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{study.title}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {study.category}
                          {study.targetDate
                            ? ` · ${formatPersonalStudyDday(study.targetDate)} (${study.targetDate})`
                            : ""}
                          {study.goal ? ` · ${study.goal}` : ""}
                        </p>
                      </div>
                      </Link>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        title="학습 완료"
                        onClick={() => completeStudyFromList(study)}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      </Button>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        title="학습 삭제"
                        onClick={() => deleteStudyFromList(study)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  ))
                ) : (
                  <div className="text-center py-5 text-muted-foreground">
                    <Award className="h-6 w-6 mx-auto mb-2 opacity-40" />
                    <p className="text-xs">자격증이나 개인 학습을 추가하세요.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

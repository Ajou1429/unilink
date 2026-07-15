"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { TimetableGrid } from "@/components/timetable/TimetableGrid";
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
  Pencil,
  Trash2,
} from "lucide-react";
import { COURSE_COLORS } from "@/lib/mock-data";
import { Course, DayOfWeek } from "@/lib/types";
import {
  getAllStoredCourses,
  getStoredCourses,
  saveStoredCourses,
} from "@/lib/course-storage";
import {
  getPersonalStudies,
  PersonalStudy,
  savePersonalStudies,
} from "@/lib/personal-study-storage";
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
} from "@/lib/timetable-storage";
import { getMyNotes, MyNote } from "@/lib/my-notes-storage";
import {
  getAcademicTermOptions,
  getCurrentAcademicTermLabel,
} from "@/lib/academic-term";

const DAYS: DayOfWeek[] = ["월", "화", "수", "목", "금"];
const COURSE_TYPE_LABELS = {
  major: "전공",
  "non-major": "비전공",
} as const;
const PERSONAL_COLORS = ["#2563EB", "#7C3AED", "#059669", "#D97706", "#DB2777"];
const EVENT_COLORS = ["#0F766E", "#2563EB", "#9333EA", "#EA580C", "#BE123C"];
const LEVELS: PaceLevel[] = ["상", "중", "하"];
const MONTH_OPTIONS = Array.from({ length: 12 }, (_, index) => index + 1);
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
  const currentTerm = getCurrentAcademicTermLabel();
  const [courses, setCourses] = useState<Course[]>([]);
  const [termOptions, setTermOptions] = useState<string[]>(() =>
    getAcademicTermOptions(),
  );
  const [selectedTerm, setSelectedTerm] = useState(currentTerm);
  const [courseFilter, setCourseFilter] = useState<"all" | "major" | "non-major">(
    "all",
  );
  const [personalStudies, setPersonalStudies] = useState<PersonalStudy[]>([]);
  const [monthlyEvents, setMonthlyEvents] = useState<MonthlyEvent[]>([]);
  const [courseSessions, setCourseSessions] = useState<CourseSessionProgress[]>([]);
  const [myNotes, setMyNotes] = useState<MyNote[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [selectedOccurrence, setSelectedOccurrence] =
    useState<CourseOccurrence | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<MonthlyEvent | null>(null);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const today = new Date();
    return today.getFullYear() === 2026 ? today.getMonth() + 1 : 1;
  });
  const [sessionFeedback, setSessionFeedback] = useState("");
  const [actionFeedback, setActionFeedback] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [personalOpen, setPersonalOpen] = useState(false);
  const [eventOpen, setEventOpen] = useState(false);
  const [newCourse, setNewCourse] = useState({
    name: "",
    professor: "",
    location: "",
    days: [] as DayOfWeek[],
    startTime: "09:00",
    endTime: "10:30",
    credits: 3,
    courseType: "major" as Course["courseType"],
    color: COURSE_COLORS[0],
  });
  const [newPersonalStudy, setNewPersonalStudy] = useState({
    title: "",
    category: "자격증",
    goal: "",
    color: PERSONAL_COLORS[0],
  });
  const [newEvent, setNewEvent] = useState({
    title: "",
    date: formatDateKey(new Date()),
    startTime: "09:00",
    endTime: "10:00",
    location: "",
    memo: "",
    color: EVENT_COLORS[0],
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
        getAcademicTermOptions(
          new Date(),
          allCourses.map((course) => course.term).filter(Boolean) as string[],
        ),
      );
      setCourses(getStoredCourses(selectedTerm));
      setPersonalStudies(getPersonalStudies());
      setMonthlyEvents(getMonthlyEvents());
      setCourseSessions(getCourseSessions());
      setMyNotes(getMyNotes());
    }

    const timeout = window.setTimeout(syncData, 0);
    window.addEventListener("storage", syncData);

    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("storage", syncData);
    };
  }, [selectedTerm]);

  useEffect(() => {
    if (!sessionFeedback && !actionFeedback) return;

    const timeout = window.setTimeout(() => {
      setSessionFeedback("");
      setActionFeedback("");
    }, 2400);
    return () => window.clearTimeout(timeout);
  }, [sessionFeedback, actionFeedback]);

  const filteredCourses = courses.filter((course) =>
    courseFilter === "all" ? true : (course.courseType ?? "major") === courseFilter,
  );
  const totalCredits = courses.reduce((sum, c) => sum + c.credits, 0);
  const majorCredits = courses
    .filter((course) => (course.courseType ?? "major") === "major")
    .reduce((sum, c) => sum + c.credits, 0);
  const nonMajorCredits = totalCredits - majorCredits;

  function persistCourses(nextCourses: Course[]) {
    setCourses(nextCourses);
    saveStoredCourses(nextCourses, selectedTerm);
  }

  function persistPersonalStudies(nextStudies: PersonalStudy[]) {
    setPersonalStudies(nextStudies);
    savePersonalStudies(nextStudies);
  }

  function persistMonthlyEvents(nextEvents: MonthlyEvent[]) {
    setMonthlyEvents(nextEvents);
    saveMonthlyEvents(nextEvents);
  }

  function changeSelectedTerm(term: string) {
    setSelectedTerm(term);
    setSelectedCourse(null);
    setSelectedOccurrence(null);
    setSelectedEvent(null);
    setEditingCourse(null);
    setCourseFilter("all");
    setNewCourse((prev) => ({ ...prev, color: COURSE_COLORS[0] }));
  }

  function toggleDay(day: DayOfWeek) {
    setNewCourse((prev) => ({
      ...prev,
      days: prev.days.includes(day)
        ? prev.days.filter((d) => d !== day)
        : [...prev.days, day],
    }));
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

  function addCourse() {
    if (!newCourse.name || newCourse.days.length === 0) return;
    const course: Course = {
      ...newCourse,
      id: Date.now().toString(),
      term: selectedTerm,
      courseType: newCourse.courseType ?? "major",
    };
    persistCourses([...courses, course]);
    setAddOpen(false);
    setNewCourse({
      name: "",
      professor: "",
      location: "",
      days: [],
      startTime: "09:00",
      endTime: "10:30",
      credits: 3,
      courseType: "major",
      color: COURSE_COLORS[courses.length % COURSE_COLORS.length],
    });
    setActionFeedback(`${course.name} 수업이 ${selectedTerm} 시간표에 등록되었습니다.`);
  }

  function addPersonalStudy() {
    if (!newPersonalStudy.title.trim()) return;
    const study: PersonalStudy = {
      id: Date.now().toString(),
      title: newPersonalStudy.title.trim(),
      category: newPersonalStudy.category,
      goal: newPersonalStudy.goal.trim(),
      color: newPersonalStudy.color,
      createdAt: new Date().toISOString(),
    };
    persistPersonalStudies([...personalStudies, study]);
    setPersonalOpen(false);
    setNewPersonalStudy({
      title: "",
      category: "자격증",
      goal: "",
      color: PERSONAL_COLORS[personalStudies.length % PERSONAL_COLORS.length],
    });
    setActionFeedback(`${study.title} 개인 학습이 등록되었습니다.`);
  }

  function addMonthlyEvent() {
    if (!newEvent.title.trim()) return;

    const event: MonthlyEvent = {
      id: Date.now().toString(),
      title: newEvent.title.trim(),
      date: newEvent.date,
      startTime: newEvent.startTime,
      endTime: newEvent.endTime,
      location: newEvent.location.trim(),
      memo: newEvent.memo.trim(),
      color: newEvent.color,
      createdAt: new Date().toISOString(),
    };

    persistMonthlyEvents([event, ...monthlyEvents]);
    setEventOpen(false);
    setNewEvent({
      title: "",
      date: newEvent.date,
      startTime: "09:00",
      endTime: "10:00",
      location: "",
      memo: "",
      color: EVENT_COLORS[monthlyEvents.length % EVENT_COLORS.length],
    });
    setActionFeedback(`${event.title} 일정이 등록되었습니다.`);
  }

  function selectOccurrence(occurrence: CourseOccurrence) {
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
    if (!editingCourse || !editingCourse.name.trim() || editingCourse.days.length === 0) {
      return;
    }

    const updatedCourse: Course = {
      ...editingCourse,
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

  function openNewEventForDate(dateKey: string) {
    setNewEvent((prev) => ({ ...prev, date: dateKey }));
    setEventOpen(true);
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
        <div className="flex items-center justify-between mb-6">
          <div className="space-y-2">
            <p className="text-muted-foreground text-sm">
              {selectedTerm} · 총 {totalCredits}학점 · 전공 {majorCredits}학점 · 비전공{" "}
              {nonMajorCredits}학점
            </p>
            <div className="flex flex-wrap gap-2">
              <Select
                value={selectedTerm}
                onValueChange={(value) => value && changeSelectedTerm(value)}
              >
                <SelectTrigger className="w-44 bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {termOptions.map((term) => (
                    <SelectItem key={term} value={term}>
                      {term}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={courseFilter}
                onValueChange={(value) =>
                  value &&
                  setCourseFilter(value as "all" | "major" | "non-major")
                }
              >
                <SelectTrigger className="w-36 bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 과목</SelectItem>
                  <SelectItem value="major">전공</SelectItem>
                  <SelectItem value="non-major">비전공</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-2">
            <Dialog open={eventOpen} onOpenChange={setEventOpen}>
              <DialogTrigger render={<Button variant="outline" className="gap-2" />}>
                <CalendarDays className="h-4 w-4" /> 월간 일정 추가
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>월간 일정 추가</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <div className="space-y-2">
                    <Label>일정명</Label>
                    <Input
                      placeholder="예: 알고리즘 과제 마감"
                      value={newEvent.title}
                      onChange={(event) =>
                        setNewEvent((prev) => ({ ...prev, title: event.target.value }))
                      }
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>날짜</Label>
                      <Input
                        type="date"
                        value={newEvent.date}
                        onChange={(event) =>
                          setNewEvent((prev) => ({ ...prev, date: event.target.value }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>장소</Label>
                      <Input
                        placeholder="예: 도서관"
                        value={newEvent.location}
                        onChange={(event) =>
                          setNewEvent((prev) => ({
                            ...prev,
                            location: event.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>시작 시간</Label>
                      <Input
                        type="time"
                        value={newEvent.startTime}
                        onChange={(event) =>
                          setNewEvent((prev) => ({
                            ...prev,
                            startTime: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>종료 시간</Label>
                      <Input
                        type="time"
                        value={newEvent.endTime}
                        onChange={(event) =>
                          setNewEvent((prev) => ({
                            ...prev,
                            endTime: event.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>메모</Label>
                    <Textarea
                      rows={3}
                      placeholder="세부 내용을 적어주세요"
                      value={newEvent.memo}
                      onChange={(event) =>
                        setNewEvent((prev) => ({ ...prev, memo: event.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>색상</Label>
                    <div className="flex gap-2">
                      {EVENT_COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          aria-label={`${color} 일정 색상 선택`}
                          onClick={() => setNewEvent((prev) => ({ ...prev, color }))}
                          className={`h-7 w-7 rounded-full transition-transform ${
                            newEvent.color === color
                              ? "scale-125 ring-2 ring-offset-1 ring-gray-400"
                              : "hover:scale-110"
                          }`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>
                  <Button onClick={addMonthlyEvent} className="w-full">
                    일정 추가
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogTrigger render={<Button className="gap-2" />}>
                <Plus className="h-4 w-4" /> 수업 추가
              </DialogTrigger>
              <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>수업 추가</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label>수업명</Label>
                  <Input
                    placeholder="예: 운영체제"
                    value={newCourse.name}
                    onChange={(e) =>
                      setNewCourse((p) => ({ ...p, name: e.target.value }))
                    }
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>교수명</Label>
                    <Input
                      placeholder="예: 김철수"
                      value={newCourse.professor}
                      onChange={(e) =>
                        setNewCourse((p) => ({ ...p, professor: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>학점</Label>
                    <Select
                      value={String(newCourse.credits)}
                      onValueChange={(v) =>
                        v != null &&
                        setNewCourse((p) => ({ ...p, credits: Number(v) }))
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4].map((n) => (
                          <SelectItem key={n} value={String(n)}>
                            {n}학점
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>강의실</Label>
                  <Input
                    placeholder="예: 공학관 301"
                    value={newCourse.location}
                    onChange={(e) =>
                      setNewCourse((p) => ({ ...p, location: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>구분</Label>
                  <Select
                    value={newCourse.courseType ?? "major"}
                    onValueChange={(value) => {
                      if (!value) return;
                      setNewCourse((prev) => ({
                        ...prev,
                        courseType: value as Course["courseType"],
                      }));
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
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
                <div className="space-y-2">
                  <Label>요일</Label>
                  <div className="flex gap-2">
                    {DAYS.map((day) => (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleDay(day)}
                        className={`h-9 w-9 rounded-full text-sm font-medium transition-colors ${
                          newCourse.days.includes(day)
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground hover:bg-accent"
                        }`}
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>시작 시간</Label>
                    <Input
                      type="time"
                      value={newCourse.startTime}
                      onChange={(e) =>
                        setNewCourse((p) => ({ ...p, startTime: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>종료 시간</Label>
                    <Input
                      type="time"
                      value={newCourse.endTime}
                      onChange={(e) =>
                        setNewCourse((p) => ({ ...p, endTime: e.target.value }))
                      }
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>색상</Label>
                  <div className="flex gap-2">
                    {COURSE_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        aria-label={`${color} 색상 선택`}
                        onClick={() => setNewCourse((p) => ({ ...p, color }))}
                        className={`h-7 w-7 rounded-full transition-transform ${
                          newCourse.color === color
                            ? "scale-125 ring-2 ring-offset-1 ring-gray-400"
                            : "hover:scale-110"
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>
                <Button onClick={addCourse} className="w-full">
                  추가하기
                </Button>
              </div>
              </DialogContent>
            </Dialog>
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
            <Tabs defaultValue="weekly">
              <div className="flex items-center justify-between gap-3 mb-3">
                <TabsList className="bg-white border shadow-sm">
                  <TabsTrigger value="weekly">주간 시간표</TabsTrigger>
                  <TabsTrigger value="monthly">월간 일정</TabsTrigger>
                </TabsList>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon-sm"
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
                    onClick={() => setWeekStart((prev) => addDays(prev, 7))}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <TabsContent value="weekly">
                <Card className="border-0 shadow-sm">
                  <CardContent className="p-4">
                    <TimetableGrid
                      courses={filteredCourses}
                      monthlyEvents={monthlyEvents}
                      courseSessions={courseSessions}
                      weekStart={weekStart}
                      onCourseClick={selectOccurrence}
                      onEventClick={openMonthlyEvent}
                    />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="monthly">
                <Card className="border-0 shadow-sm">
                  <CardHeader className="pb-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <CardTitle className="text-base">
                          2026년 {calendarMonth}월 월간 일정
                        </CardTitle>
                        <p className="mt-1 text-xs text-muted-foreground">
                          날짜를 누르면 일정 추가, 일정 칩을 누르면 상세를 볼 수 있습니다.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="icon-sm"
                          disabled={calendarMonth === 1}
                          onClick={() =>
                            setCalendarMonth((prev) => Math.max(1, prev - 1))
                          }
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Select
                          value={String(calendarMonth)}
                          onValueChange={(value) => setCalendarMonth(Number(value))}
                        >
                          <SelectTrigger className="w-28">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {MONTH_OPTIONS.map((month) => (
                              <SelectItem key={month} value={String(month)}>
                                {month}월
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          variant="outline"
                          size="icon-sm"
                          disabled={calendarMonth === 12}
                          onClick={() =>
                            setCalendarMonth((prev) => Math.min(12, prev + 1))
                          }
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
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
                        const dayEvents = monthlyEvents
                          .filter((event) => event.date === dateKey)
                          .sort((a, b) => a.startTime.localeCompare(b.startTime));
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
                                  title={`${event.startTime} ${event.title}`}
                                >
                                  {event.startTime} {event.title}
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
                        {selectedCourse.days.join(", ")} {selectedCourse.startTime} -{" "}
                        {selectedCourse.endTime}
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
                              <SelectValue />
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
                          <Input
                            type="time"
                            value={editingCourse.startTime}
                            onChange={(event) =>
                              setEditingCourse((prev) =>
                                prev ? { ...prev, startTime: event.target.value } : prev,
                              )
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>종료 시간</Label>
                          <Input
                            type="time"
                            value={editingCourse.endTime}
                            onChange={(event) =>
                              setEditingCourse((prev) =>
                                prev ? { ...prev, endTime: event.target.value } : prev,
                              )
                            }
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>색상</Label>
                        <div className="flex gap-2">
                          {COURSE_COLORS.map((color) => (
                            <button
                              key={color}
                              type="button"
                              aria-label={`${color} 수업 색상 선택`}
                              onClick={() =>
                                setEditingCourse((prev) =>
                                  prev ? { ...prev, color } : prev,
                                )
                              }
                              className={`h-7 w-7 rounded-full transition-transform ${
                                editingCourse.color === color
                                  ? "scale-125 ring-2 ring-offset-1 ring-gray-400"
                                  : "hover:scale-110"
                              }`}
                              style={{ backgroundColor: color }}
                            />
                          ))}
                        </div>
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
                        {selectedEvent.startTime} - {selectedEvent.endTime}
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
                </CardContent>
              </Card>
            ) : (
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">수강 목록</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {filteredCourses.length > 0 ? (
                    filteredCourses.map((course) => (
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
                            {COURSE_TYPE_LABELS[course.courseType ?? "major"]} ·{" "}
                            {course.days.join("")} · {course.credits}학점
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
                      variant={totalCredits >= 18 ? "destructive" : "secondary"}
                      className="text-[10px]"
                    >
                      {totalCredits >= 18 ? "최대 학점" : `${18 - totalCredits}학점 여유`}
                    </Badge>
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
                          <Label>색상</Label>
                          <div className="flex gap-2">
                            {PERSONAL_COLORS.map((color) => (
                              <button
                                key={color}
                                type="button"
                                aria-label={`${color} 색상 선택`}
                                onClick={() =>
                                  setNewPersonalStudy((prev) => ({ ...prev, color }))
                                }
                                className={`h-7 w-7 rounded-full transition-transform ${
                                  newPersonalStudy.color === color
                                    ? "scale-125 ring-2 ring-offset-1 ring-gray-400"
                                    : "hover:scale-110"
                                }`}
                                style={{ backgroundColor: color }}
                              />
                            ))}
                          </div>
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
                    <Link
                      key={study.id}
                      href={`/personal-study?studyId=${encodeURIComponent(study.id)}`}
                      className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-accent transition-colors"
                    >
                      <div
                        className="h-3 w-3 rounded-full shrink-0"
                        style={{ backgroundColor: study.color }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{study.title}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {study.category}
                          {study.goal ? ` · ${study.goal}` : ""}
                        </p>
                      </div>
                    </Link>
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

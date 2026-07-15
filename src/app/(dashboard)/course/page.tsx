"use client";

import { ChangeEvent, Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { NoteViewerDialog } from "@/components/notes/NoteViewerDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BookOpen,
  CalendarCheck,
  Clock,
  FileText,
  MapPin,
  Paperclip,
  Plus,
  Upload,
  Users,
} from "lucide-react";
import { Course, LectureNote, StudyPlan } from "@/lib/types";
import {
  CourseFile,
  getCourseFiles,
  getCourseNotes,
  getCoursePlans,
  getStoredCourses,
  saveCourseFile,
  saveCourseNote,
  saveCoursePlan,
} from "@/lib/course-storage";
import { getMyNotes, MY_NOTES_CHANGED_EVENT, MyNote } from "@/lib/my-notes-storage";
import {
  getMonthlyStudyPlans,
  getWeeklyStudyPlans,
  MonthlyStudyPlan,
  saveMonthlyStudyPlans,
  saveWeeklyStudyPlans,
} from "@/lib/study-storage";
import {
  getMonthlyEvents,
  MonthlyEvent,
  saveMonthlyEvents,
} from "@/lib/timetable-storage";

function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function getSundayWeekStart(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return addDays(next, -next.getDay());
}

function getMonthFromDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function EmptyCourseState() {
  return (
    <div className="flex flex-col min-h-screen">
      <Header title="수업 페이지" />
      <div className="flex-1 p-6 max-w-3xl mx-auto w-full">
        <Card className="border-0 shadow-sm">
          <CardContent className="py-12 text-center">
            <BookOpen className="h-10 w-10 mx-auto mb-4 text-muted-foreground opacity-40" />
            <h2 className="text-lg font-semibold mb-2">수업을 찾을 수 없어요</h2>
            <p className="text-sm text-muted-foreground mb-6">
              시간표에서 수업을 추가하거나 왼쪽 내 수업 목록에서 다시 선택하세요.
            </p>
            <Link href="/timetable">
              <Button>시간표로 이동</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function CourseContent() {
  const searchParams = useSearchParams();
  const courseId = searchParams.get("courseId") ?? "";
  const [courses, setCourses] = useState<Course[]>([]);
  const [notes, setNotes] = useState<LectureNote[]>([]);
  const [plans, setPlans] = useState<StudyPlan[]>([]);
  const [files, setFiles] = useState<CourseFile[]>([]);
  const [linkedMyNotes, setLinkedMyNotes] = useState<MyNote[]>([]);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [planTitle, setPlanTitle] = useState("");
  const [planDescription, setPlanDescription] = useState("");
  const [planDueDate, setPlanDueDate] = useState("");
  const [planFeedback, setPlanFeedback] = useState("");

  useEffect(() => {
    const timeout = window.setTimeout(async () => {
      setCourses(getStoredCourses());
      setNotes(courseId ? getCourseNotes(courseId) : []);
      setPlans(courseId ? getCoursePlans(courseId) : []);
      setFiles(courseId ? getCourseFiles(courseId) : []);
      const myNotes = courseId ? await getMyNotes() : [];
      setLinkedMyNotes(
        myNotes.filter(
          (note) => note.linkedType === "course" && note.linkedId === courseId,
        ),
      );
      setNoteTitle("");
      setNoteContent("");
      setPlanTitle("");
      setPlanDescription("");
      setPlanDueDate("");
      setPlanFeedback("");
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [courseId]);

  useEffect(() => {
    async function syncLinkedNotes() {
      const myNotes = courseId ? await getMyNotes() : [];
      setLinkedMyNotes(
        myNotes.filter(
          (note) => note.linkedType === "course" && note.linkedId === courseId,
        ),
      );
    }

    window.addEventListener(MY_NOTES_CHANGED_EVENT, syncLinkedNotes);
    window.addEventListener("storage", syncLinkedNotes);

    return () => {
      window.removeEventListener(MY_NOTES_CHANGED_EVENT, syncLinkedNotes);
      window.removeEventListener("storage", syncLinkedNotes);
    };
  }, [courseId]);

  const course = courses.find((item) => item.id === courseId) ?? null;

  const courseTime = useMemo(() => {
    if (!course) return "";
    return `${course.days.join(", ")} ${course.startTime} - ${course.endTime}`;
  }, [course]);

  function addNote() {
    if (!course || !noteTitle.trim()) return;

    const note: LectureNote = {
      id: Date.now().toString(),
      userId: "me",
      courseId: course.id,
      courseName: course.name,
      week: 1,
      title: noteTitle.trim(),
      content: noteContent.trim(),
      tags: [course.name],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    saveCourseNote(note);
    setNotes((prev) => [note, ...prev]);
    setNoteTitle("");
    setNoteContent("");
  }

  function syncCoursePlan(plan: StudyPlan, linkedCourse: Course) {
    const anchorDate = plan.dueDate
      ? new Date(`${plan.dueDate}T00:00:00`)
      : new Date();
    const weekStart = formatDateKey(getSundayWeekStart(anchorDate));
    const weeklyPlan: StudyPlan = {
      ...plan,
      weekStart,
    };
    const weeklyPlans = getWeeklyStudyPlans();
    const nextWeeklyPlans = weeklyPlans.some((item) => item.id === weeklyPlan.id)
      ? weeklyPlans.map((item) => (item.id === weeklyPlan.id ? weeklyPlan : item))
      : [weeklyPlan, ...weeklyPlans];
    const monthlyPlan: MonthlyStudyPlan = {
      id: `weekly-${weeklyPlan.id}`,
      month: getMonthFromDate(new Date(`${weekStart}T00:00:00`)),
      weekStart,
      courseId: weeklyPlan.courseId,
      courseName: weeklyPlan.courseName,
      title: weeklyPlan.title,
      description: weeklyPlan.description,
      isCompleted: weeklyPlan.isCompleted,
      createdAt: weeklyPlan.createdAt,
    };
    const monthlyPlans = getMonthlyStudyPlans();
    const nextMonthlyPlans = monthlyPlans.some((item) => item.id === monthlyPlan.id)
      ? monthlyPlans.map((item) => (item.id === monthlyPlan.id ? monthlyPlan : item))
      : [monthlyPlan, ...monthlyPlans];

    saveWeeklyStudyPlans(nextWeeklyPlans);
    saveMonthlyStudyPlans(nextMonthlyPlans);

    if (!weeklyPlan.dueDate) return;

    const monthlyEvent: MonthlyEvent = {
      id: `course-plan-event-${weeklyPlan.id}`,
      title: `학습 계획: ${weeklyPlan.title}`,
      date: weeklyPlan.dueDate,
      startTime: linkedCourse.startTime || "09:00",
      endTime: linkedCourse.endTime || "10:00",
      location: linkedCourse.name,
      memo: weeklyPlan.description
        ? `${linkedCourse.name} 학습 계획\n${weeklyPlan.description}`
        : `${linkedCourse.name} 학습 계획 마감일`,
      color: linkedCourse.color,
      createdAt: weeklyPlan.createdAt,
    };
    const monthlyEvents = getMonthlyEvents();
    const nextMonthlyEvents = monthlyEvents.some((event) => event.id === monthlyEvent.id)
      ? monthlyEvents.map((event) =>
          event.id === monthlyEvent.id ? monthlyEvent : event,
        )
      : [monthlyEvent, ...monthlyEvents];

    saveMonthlyEvents(nextMonthlyEvents);
  }

  function addPlan() {
    if (!course || !planTitle.trim()) return;

    const plan: StudyPlan = {
      id: `course-plan-${Date.now()}`,
      userId: "me",
      courseId: course.id,
      courseName: course.name,
      week: 1,
      title: planTitle.trim(),
      description: planDescription.trim(),
      dueDate: planDueDate,
      isCompleted: false,
      createdAt: new Date().toISOString(),
    };

    saveCoursePlan(plan);
    syncCoursePlan(plan, course);
    setPlans((prev) => [plan, ...prev]);
    setPlanTitle("");
    setPlanDescription("");
    setPlanDueDate("");
    setPlanFeedback(
      plan.dueDate
        ? "수업 계획이 학습 계획, 월별 계획, 시간표 월간 일정에 등록되었습니다."
        : "수업 계획이 학습 계획과 월별 계획에 등록되었습니다.",
    );
  }

  function uploadFiles(event: ChangeEvent<HTMLInputElement>) {
    if (!course || !event.target.files) return;

    const uploaded = Array.from(event.target.files).map((file) => ({
      id: `${Date.now()}-${file.name}`,
      courseId: course.id,
      name: file.name,
      type: file.type || "파일",
      size: file.size,
      createdAt: new Date().toISOString(),
    }));

    uploaded.forEach(saveCourseFile);
    setFiles((prev) => [...uploaded, ...prev]);
    event.target.value = "";
  }

  if (!courseId || !course) {
    return <EmptyCourseState />;
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Header title={course.name} />
      <div className="flex-1 p-6 max-w-6xl mx-auto w-full space-y-6">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div
                    className="h-4 w-4 rounded-full"
                    style={{ backgroundColor: course.color }}
                  />
                  <h2 className="text-2xl font-bold">{course.name}</h2>
                  <Badge variant="secondary">{course.credits}학점</Badge>
                </div>
                <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <BookOpen className="h-4 w-4" />
                    {course.professor} 교수
                  </span>
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-4 w-4" />
                    {course.location || "강의실 미정"}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Clock className="h-4 w-4" />
                    {courseTime}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <div className="text-xl font-bold text-primary">{notes.length}</div>
                  <div className="text-xs text-muted-foreground">노트</div>
                </div>
                <div>
                  <div className="text-xl font-bold text-primary">{plans.length}</div>
                  <div className="text-xs text-muted-foreground">계획</div>
                </div>
                <div>
                  <div className="text-xl font-bold text-primary">{files.length}</div>
                  <div className="text-xs text-muted-foreground">파일</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs key={course.id} defaultValue="notes">
          <TabsList className="bg-white border shadow-sm mb-6">
            <TabsTrigger value="notes" className="gap-2">
              <FileText className="h-4 w-4" /> 노트 정리
            </TabsTrigger>
            <TabsTrigger value="plans" className="gap-2">
              <CalendarCheck className="h-4 w-4" /> 학습 계획
            </TabsTrigger>
            <TabsTrigger value="files" className="gap-2">
              <Paperclip className="h-4 w-4" /> 자료
            </TabsTrigger>
          </TabsList>

          <TabsContent value="notes">
            <div className="grid lg:grid-cols-3 gap-6">
              <Card className="border-0 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Plus className="h-4 w-4" /> 노트 추가
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    <Label>제목</Label>
                    <Input
                      placeholder="예: 5주차 핵심 개념"
                      value={noteTitle}
                      onChange={(event) => setNoteTitle(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>내용</Label>
                    <Textarea
                      rows={8}
                      placeholder="필기 내용을 정리하세요"
                      value={noteContent}
                      onChange={(event) => setNoteContent(event.target.value)}
                    />
                  </div>
                  <Button onClick={addNote} className="w-full">
                    노트 저장
                  </Button>
                </CardContent>
              </Card>

              <div className="lg:col-span-2 space-y-3">
                {linkedMyNotes.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-muted-foreground">
                      GoodNotes 연동 노트
                    </p>
                    {linkedMyNotes.map((note) => (
                      <Card key={note.id} className="border-0 shadow-sm">
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <Upload className="h-4 w-4 text-primary mt-1 shrink-0" />
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <h3 className="font-semibold">{note.title}</h3>
                                <Badge variant="secondary">v{note.version}</Badge>
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">
                                {note.fileName ?? "GoodNotes PDF"} ·{" "}
                                {new Date(note.updatedAt).toLocaleString("ko-KR")}
                              </p>
                              <p className="text-sm text-muted-foreground mt-3 whitespace-pre-wrap">
                                {note.content || "내용이 비어 있습니다."}
                              </p>
                              <div className="mt-3">
                                <NoteViewerDialog note={note} />
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}

                {notes.length > 0 ? (
                  notes.map((note) => (
                    <Card key={note.id} className="border-0 shadow-sm">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <FileText className="h-4 w-4 text-primary mt-1 shrink-0" />
                          <div className="min-w-0">
                            <h3 className="font-semibold">{note.title}</h3>
                            <p className="text-xs text-muted-foreground mt-1">
                              {new Date(note.createdAt).toLocaleDateString("ko-KR")}
                            </p>
                            <p className="text-sm text-muted-foreground mt-3 whitespace-pre-wrap">
                              {note.content || "내용이 비어 있습니다."}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                ) : linkedMyNotes.length === 0 ? (
                  <Card className="border-0 shadow-sm">
                    <CardContent className="py-12 text-center text-muted-foreground">
                      <FileText className="h-8 w-8 mx-auto mb-3 opacity-30" />
                      <p className="text-sm">아직 정리한 노트가 없어요.</p>
                    </CardContent>
                  </Card>
                ) : null}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="plans">
            <div className="grid lg:grid-cols-3 gap-6">
              <Card className="border-0 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Plus className="h-4 w-4" /> 계획 추가
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    <Label>계획 제목</Label>
                    <Input
                      placeholder="예: 중간고사 범위 복습"
                      value={planTitle}
                      onChange={(event) => setPlanTitle(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>마감일</Label>
                    <Input
                      type="date"
                      value={planDueDate}
                      onChange={(event) => setPlanDueDate(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>설명</Label>
                    <Textarea
                      rows={5}
                      placeholder="해야 할 공부 내용을 적어주세요"
                      value={planDescription}
                      onChange={(event) => setPlanDescription(event.target.value)}
                    />
                  </div>
                  <Button onClick={addPlan} className="w-full">
                    계획 저장
                  </Button>
                  {planFeedback && (
                    <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
                      <CalendarCheck className="h-3.5 w-3.5" />
                      {planFeedback}
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="lg:col-span-2 space-y-3">
                {plans.length > 0 ? (
                  plans.map((plan) => (
                    <Card key={plan.id} className="border-0 shadow-sm">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <CalendarCheck className="h-4 w-4 text-primary mt-1 shrink-0" />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-semibold">{plan.title}</h3>
                              {plan.dueDate && (
                                <Badge variant="outline">마감 {plan.dueDate}</Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground mt-2">
                              {plan.description || "설명이 비어 있습니다."}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                ) : (
                  <Card className="border-0 shadow-sm">
                    <CardContent className="py-12 text-center text-muted-foreground">
                      <CalendarCheck className="h-8 w-8 mx-auto mb-3 opacity-30" />
                      <p className="text-sm">아직 등록한 학습 계획이 없어요.</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="files">
            <div className="grid lg:grid-cols-3 gap-6">
              <Card className="border-0 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Upload className="h-4 w-4" /> 자료 올리기
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Label htmlFor="course-files">노트 파일, PDF, 이미지</Label>
                  <Input id="course-files" type="file" multiple onChange={uploadFiles} />
                  <p className="text-xs text-muted-foreground">
                    현재 단계에서는 파일명과 용량 정보만 브라우저에 저장합니다.
                    실제 파일 업로드는 DB/스토리지 연동 때 붙이면 됩니다.
                  </p>
                </CardContent>
              </Card>

              <div className="lg:col-span-2 space-y-3">
                {files.length > 0 ? (
                  files.map((file) => (
                    <Card key={file.id} className="border-0 shadow-sm">
                      <CardContent className="p-4 flex items-center gap-3">
                        <Paperclip className="h-4 w-4 text-primary shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{file.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {file.type} · {formatBytes(file.size)} ·{" "}
                            {new Date(file.createdAt).toLocaleDateString("ko-KR")}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                ) : (
                  <Card className="border-0 shadow-sm">
                    <CardContent className="py-12 text-center text-muted-foreground">
                      <Users className="h-8 w-8 mx-auto mb-3 opacity-30" />
                      <p className="text-sm">아직 올린 자료가 없어요.</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

export default function CoursePage() {
  return (
    <Suspense fallback={<EmptyCourseState />}>
      <CourseContent />
    </Suspense>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { Header } from "@/components/layout/Header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  BookOpen,
  Calendar,
  CheckCircle2,
  Circle,
  Clock,
  FileText,
  ListChecks,
  Plus,
  Target,
} from "lucide-react";
import { getStoredCourses } from "@/lib/course-storage";
import { mockCourses, mockNotes, mockStudyPlans } from "@/lib/mock-data";
import { Course, LectureNote, StudyPlan } from "@/lib/types";
import {
  getMonthlyStudyGoals,
  getWeeklyStudyPlans,
  MonthlyStudyGoal,
  saveMonthlyStudyGoals,
  saveWeeklyStudyPlans,
} from "@/lib/study-storage";

const THIS_WEEK = 8;

export default function StudyPage() {
  const [courses, setCourses] = useState<Course[]>(mockCourses);
  const [plans, setPlans] = useState<StudyPlan[]>(mockStudyPlans);
  const [monthlyGoals, setMonthlyGoals] = useState<MonthlyStudyGoal[]>([]);
  const [notes, setNotes] = useState<LectureNote[]>(mockNotes);
  const [selectedNote, setSelectedNote] = useState<LectureNote | null>(null);
  const [planOpen, setPlanOpen] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);

  const [newPlan, setNewPlan] = useState({
    courseId: "",
    title: "",
    description: "",
    dueDate: "",
  });
  const [newGoal, setNewGoal] = useState({
    month: new Date().toISOString().slice(0, 7),
    title: "",
    description: "",
  });
  const [newNote, setNewNote] = useState({
    courseId: "",
    title: "",
    content: "",
    week: THIS_WEEK,
    tags: "",
  });

  useEffect(() => {
    window.setTimeout(() => {
      setCourses(getStoredCourses());
      setPlans(getWeeklyStudyPlans(mockStudyPlans));
      setMonthlyGoals(getMonthlyStudyGoals());
    }, 0);
  }, []);

  const completed = plans.filter((plan) => plan.isCompleted).length;
  const total = plans.length;
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

  const currentMonthLabel = useMemo(() => {
    const [year, month] = newGoal.month.split("-");
    return `${year}년 ${Number(month)}월`;
  }, [newGoal.month]);

  function persistPlans(nextPlans: StudyPlan[]) {
    setPlans(nextPlans);
    saveWeeklyStudyPlans(nextPlans);
  }

  function persistMonthlyGoals(nextGoals: MonthlyStudyGoal[]) {
    setMonthlyGoals(nextGoals);
    saveMonthlyStudyGoals(nextGoals);
  }

  function togglePlan(id: string) {
    persistPlans(
      plans.map((plan) =>
        plan.id === id ? { ...plan, isCompleted: !plan.isCompleted } : plan,
      ),
    );
  }

  function addPlan() {
    if (!newPlan.title.trim()) return;

    const course = courses.find((item) => item.id === newPlan.courseId);
    const plan: StudyPlan = {
      id: Date.now().toString(),
      userId: "me",
      courseId: newPlan.courseId || "self",
      courseName: course?.name ?? "개인 공부",
      week: THIS_WEEK,
      title: newPlan.title.trim(),
      description: newPlan.description.trim(),
      dueDate: newPlan.dueDate,
      isCompleted: false,
      createdAt: new Date().toISOString(),
    };

    persistPlans([plan, ...plans]);
    setPlanOpen(false);
    setNewPlan({ courseId: "", title: "", description: "", dueDate: "" });
  }

  function addMonthlyGoal() {
    if (!newGoal.title.trim()) return;

    const goal: MonthlyStudyGoal = {
      id: Date.now().toString(),
      month: newGoal.month,
      title: newGoal.title.trim(),
      description: newGoal.description.trim(),
      createdAt: new Date().toISOString(),
    };

    persistMonthlyGoals([goal, ...monthlyGoals]);
    setGoalOpen(false);
    setNewGoal((prev) => ({ ...prev, title: "", description: "" }));
  }

  function addNote() {
    if (!newNote.courseId || !newNote.title.trim()) return;

    const course = courses.find((item) => item.id === newNote.courseId);
    const note: LectureNote = {
      id: Date.now().toString(),
      userId: "me",
      courseId: newNote.courseId,
      courseName: course?.name ?? "",
      week: newNote.week,
      title: newNote.title.trim(),
      content: newNote.content.trim(),
      tags: newNote.tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setNotes((prev) => [note, ...prev]);
    setSelectedNote(note);
    setNoteOpen(false);
    setNewNote({ courseId: "", title: "", content: "", week: THIS_WEEK, tags: "" });
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header title="학습 플랜" />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-6">
        <section className="grid gap-4 lg:grid-cols-[1.4fr_0.9fr]">
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <ListChecks className="h-5 w-5 text-primary" />
                    이번주 학습 목표
                  </CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    완료한 계획만 진행률에 반영됩니다.
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-primary">
                    {completed}/{total}
                  </div>
                  <p className="text-xs text-muted-foreground">완료</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-2 rounded-full bg-muted">
                <div
                  className="h-2 rounded-full bg-primary transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                <span>이번주 계획 {total}개</span>
                <span>{progress}% 달성</span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Target className="h-5 w-5 text-primary" />
                  월별 학습 목표
                </CardTitle>
                <Dialog open={goalOpen} onOpenChange={setGoalOpen}>
                  <DialogTrigger render={<Button size="sm" variant="outline" />}>
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    목표 추가
                  </DialogTrigger>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle>월별 학습 목표 추가</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-2">
                      <div className="space-y-2">
                        <Label>월</Label>
                        <Input
                          type="month"
                          value={newGoal.month}
                          onChange={(event) =>
                            setNewGoal((prev) => ({ ...prev, month: event.target.value }))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>목표</Label>
                        <Input
                          placeholder="예: 정보처리기사 필기 1회독"
                          value={newGoal.title}
                          onChange={(event) =>
                            setNewGoal((prev) => ({ ...prev, title: event.target.value }))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>메모</Label>
                        <Textarea
                          rows={3}
                          placeholder="월말까지 보고 싶은 범위나 기준을 적어주세요."
                          value={newGoal.description}
                          onChange={(event) =>
                            setNewGoal((prev) => ({
                              ...prev,
                              description: event.target.value,
                            }))
                          }
                        />
                      </div>
                      <Button onClick={addMonthlyGoal} className="w-full">
                        추가하기
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
              <p className="text-sm text-muted-foreground">{currentMonthLabel}</p>
            </CardHeader>
            <CardContent>
              {monthlyGoals.length > 0 ? (
                <div className="space-y-3">
                  {monthlyGoals.map((goal) => (
                    <div key={goal.id} className="rounded-lg border bg-background p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium">{goal.title}</p>
                        <Badge variant="secondary">{goal.month}</Badge>
                      </div>
                      {goal.description && (
                        <p className="mt-1 text-sm text-muted-foreground">
                          {goal.description}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  월별 목표는 체크해서 사라지지 않고 리스트로만 관리됩니다.
                </p>
              )}
            </CardContent>
          </Card>
        </section>

        <Tabs defaultValue="plans">
          <TabsList className="mb-6 border bg-white shadow-sm">
            <TabsTrigger value="plans" className="gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4" />
              이번주 계획
            </TabsTrigger>
            <TabsTrigger value="notes" className="gap-2 text-sm">
              <FileText className="h-4 w-4" />
              강의 노트
            </TabsTrigger>
          </TabsList>

          <TabsContent value="plans" className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-medium text-muted-foreground">
                {THIS_WEEK}주차 · 이번주
              </h2>
              <Dialog open={planOpen} onOpenChange={setPlanOpen}>
                <DialogTrigger
                  render={<Button size="sm" variant="outline" className="gap-1.5" />}
                >
                  <Plus className="h-3.5 w-3.5" />
                  계획 추가
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>이번주 학습 계획 추가</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 pt-2">
                    <div className="space-y-2">
                      <Label>연결할 수업</Label>
                      <Select
                        value={newPlan.courseId}
                        onValueChange={(value) =>
                          setNewPlan((prev) => ({
                            ...prev,
                            courseId: value ?? prev.courseId,
                          }))
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="선택하지 않으면 개인 공부로 저장" />
                        </SelectTrigger>
                        <SelectContent>
                          {courses.map((course) => (
                            <SelectItem key={course.id} value={course.id}>
                              {course.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>계획</Label>
                      <Input
                        placeholder="예: 운영체제 5장 복습"
                        value={newPlan.title}
                        onChange={(event) =>
                          setNewPlan((prev) => ({ ...prev, title: event.target.value }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>내용</Label>
                      <Textarea
                        rows={3}
                        placeholder="세부 범위나 해야 할 일을 적어주세요."
                        value={newPlan.description}
                        onChange={(event) =>
                          setNewPlan((prev) => ({
                            ...prev,
                            description: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>마감일</Label>
                      <Input
                        type="date"
                        value={newPlan.dueDate}
                        onChange={(event) =>
                          setNewPlan((prev) => ({ ...prev, dueDate: event.target.value }))
                        }
                      />
                    </div>
                    <Button onClick={addPlan} className="w-full">
                      추가하기
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            {plans.length > 0 ? (
              <div className="grid gap-3 md:grid-cols-2">
                {plans.map((plan) => (
                  <Card
                    key={plan.id}
                    className={`border-0 shadow-sm transition-opacity ${
                      plan.isCompleted ? "opacity-65" : ""
                    }`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <button
                          type="button"
                          onClick={() => togglePlan(plan.id)}
                          className="mt-0.5 shrink-0"
                          aria-label={`${plan.title} 완료 상태 변경`}
                        >
                          {plan.isCompleted ? (
                            <CheckCircle2 className="h-5 w-5 text-primary" />
                          ) : (
                            <Circle className="h-5 w-5 text-muted-foreground" />
                          )}
                        </button>
                        <div className="min-w-0 flex-1">
                          <p
                            className={`font-medium ${
                              plan.isCompleted ? "line-through text-muted-foreground" : ""
                            }`}
                          >
                            {plan.title}
                          </p>
                          {plan.description && (
                            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                              {plan.description}
                            </p>
                          )}
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <Badge variant="secondary">{plan.courseName}</Badge>
                            {plan.dueDate && (
                              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Clock className="h-3 w-3" />
                                {plan.dueDate}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="border-dashed shadow-sm">
                <CardContent className="p-8 text-center text-muted-foreground">
                  <CheckCircle2 className="mx-auto mb-3 h-8 w-8 opacity-40" />
                  <p>이번주 학습 계획을 추가하면 진행률이 계산됩니다.</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="notes">
            <div className="grid gap-6 lg:grid-cols-3">
              <div className="space-y-3 lg:col-span-1">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-medium text-muted-foreground">강의 노트</h2>
                  <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
                    <DialogTrigger
                      render={<Button size="sm" variant="outline" className="gap-1.5" />}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      노트 추가
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>강의 노트 작성</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 pt-2">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label>수업</Label>
                            <Select
                              value={newNote.courseId}
                              onValueChange={(value) =>
                                setNewNote((prev) => ({
                                  ...prev,
                                  courseId: value ?? prev.courseId,
                                }))
                              }
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="수업 선택" />
                              </SelectTrigger>
                              <SelectContent>
                                {courses.map((course) => (
                                  <SelectItem key={course.id} value={course.id}>
                                    {course.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label>주차</Label>
                            <Input
                              type="number"
                              min={1}
                              max={16}
                              value={newNote.week}
                              onChange={(event) =>
                                setNewNote((prev) => ({
                                  ...prev,
                                  week: Number(event.target.value),
                                }))
                              }
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label>제목</Label>
                          <Input
                            placeholder="예: 8주차 - 프로세스 스케줄링"
                            value={newNote.title}
                            onChange={(event) =>
                              setNewNote((prev) => ({ ...prev, title: event.target.value }))
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>내용</Label>
                          <Textarea
                            rows={8}
                            placeholder="강의 내용을 정리하세요."
                            value={newNote.content}
                            onChange={(event) =>
                              setNewNote((prev) => ({
                                ...prev,
                                content: event.target.value,
                              }))
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>태그</Label>
                          <Input
                            placeholder="예: 운영체제, 시험범위"
                            value={newNote.tags}
                            onChange={(event) =>
                              setNewNote((prev) => ({ ...prev, tags: event.target.value }))
                            }
                          />
                        </div>
                        <Button onClick={addNote} className="w-full">
                          저장하기
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>

                {notes.map((note) => (
                  <Card
                    key={note.id}
                    onClick={() => setSelectedNote(note)}
                    className={`cursor-pointer border-0 shadow-sm transition-all hover:shadow-md ${
                      selectedNote?.id === note.id ? "ring-2 ring-primary" : ""
                    }`}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-start gap-2">
                        <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{note.title}</p>
                          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            {note.courseName} · {note.week}주차
                          </p>
                          <div className="mt-2 flex flex-wrap gap-1">
                            {note.tags.map((tag) => (
                              <Badge
                                key={tag}
                                variant="secondary"
                                className="px-1.5 py-0 text-[10px]"
                              >
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="lg:col-span-2">
                {selectedNote ? (
                  <Card className="h-full border-0 shadow-sm">
                    <CardHeader className="border-b pb-3">
                      <CardTitle className="text-base">{selectedNote.title}</CardTitle>
                      <p className="text-sm text-muted-foreground">
                        {selectedNote.courseName} · {selectedNote.week}주차
                      </p>
                    </CardHeader>
                    <CardContent className="p-4">
                      <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
                        {selectedNote.content || "아직 작성한 내용이 없습니다."}
                      </pre>
                    </CardContent>
                  </Card>
                ) : (
                  <Card className="flex h-64 items-center justify-center border-0 shadow-sm">
                    <div className="text-center text-muted-foreground">
                      <FileText className="mx-auto mb-3 h-8 w-8 opacity-30" />
                      <p className="text-sm">노트를 선택하면 여기에 표시됩니다.</p>
                    </div>
                  </Card>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

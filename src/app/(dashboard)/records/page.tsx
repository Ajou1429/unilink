"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Header } from "@/components/layout/Header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Award, BookOpen, Briefcase, Plus, Target } from "lucide-react";
import {
  COURSES_CHANGED_EVENT,
  getStoredCourses,
} from "@/lib/course-storage";
import { getCurrentAcademicTermLabel } from "@/lib/academic-term";
import {
  getGradeRecords,
  getSpecRecords,
  GradeRecord,
  RECORDS_CHANGED_EVENT,
  saveGradeRecords,
  saveSpecRecords,
  SpecRecord,
} from "@/lib/record-storage";
import {
  getPersonalStudies,
  PersonalStudy,
  PERSONAL_STUDIES_CHANGED_EVENT,
} from "@/lib/personal-study-storage";
import { Course } from "@/lib/types";

const GRADE_OPTIONS = ["A+", "A0", "B+", "B0", "C+", "C0", "D+", "D0", "F", "P", "미정"];
const STATUS_LABELS: Record<SpecRecord["status"], string> = {
  planned: "예정",
  "in-progress": "진행 중",
  done: "완료",
};

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getGradePoint(grade: string) {
  const points: Record<string, number> = {
    "A+": 4.5,
    A0: 4,
    "B+": 3.5,
    B0: 3,
    "C+": 2.5,
    C0: 2,
    "D+": 1.5,
    D0: 1,
    F: 0,
  };

  return points[grade];
}

export default function RecordsPage() {
  const currentTerm = getCurrentAcademicTermLabel();
  const [courses, setCourses] = useState<Course[]>([]);
  const [personalStudies, setPersonalStudies] = useState<PersonalStudy[]>([]);
  const [gradeRecords, setGradeRecords] = useState<GradeRecord[]>([]);
  const [specRecords, setSpecRecords] = useState<SpecRecord[]>([]);
  const [selectedTerm, setSelectedTerm] = useState(currentTerm);
  const [gradeMessage, setGradeMessage] = useState("");
  const [specMessage, setSpecMessage] = useState("");
  const [newGrade, setNewGrade] = useState({
    term: currentTerm,
    courseId: "custom",
    courseName: "",
    credits: "3",
    grade: "미정",
    score: "",
    memo: "",
  });
  const [newSpec, setNewSpec] = useState({
    personalStudyId: "custom",
    title: "",
    category: "",
    status: "planned" as SpecRecord["status"],
    completedAt: "",
    memo: "",
  });

  useEffect(() => {
    function syncData() {
      setCourses(getStoredCourses());
      setPersonalStudies(getPersonalStudies());
      setGradeRecords(getGradeRecords());
      setSpecRecords(getSpecRecords());
    }

    syncData();
    window.addEventListener(COURSES_CHANGED_EVENT, syncData);
    window.addEventListener(PERSONAL_STUDIES_CHANGED_EVENT, syncData);
    window.addEventListener(RECORDS_CHANGED_EVENT, syncData);
    window.addEventListener("storage", syncData);

    return () => {
      window.removeEventListener(COURSES_CHANGED_EVENT, syncData);
      window.removeEventListener(PERSONAL_STUDIES_CHANGED_EVENT, syncData);
      window.removeEventListener(RECORDS_CHANGED_EVENT, syncData);
      window.removeEventListener("storage", syncData);
    };
  }, []);

  const terms = useMemo(() => {
    const values = new Set([currentTerm, ...gradeRecords.map((record) => record.term)]);
    return Array.from(values);
  }, [currentTerm, gradeRecords]);

  const currentGrades = gradeRecords.filter((record) => record.term === selectedTerm);
  const linkedCourseIds = new Set(
    currentGrades.map((record) => record.courseId).filter(Boolean),
  );
  const unlinkedCourses = courses.filter((course) => !linkedCourseIds.has(course.id));
  const linkedStudyIds = new Set(
    specRecords.map((record) => record.personalStudyId).filter(Boolean),
  );
  const unlinkedStudies = personalStudies.filter(
    (study) => !linkedStudyIds.has(study.id),
  );
  const gradedCredits = currentGrades.reduce(
    (sum, record) => sum + Number(record.credits || 0),
    0,
  );
  const gpaBase = currentGrades.reduce((sum, record) => {
    const point = getGradePoint(record.grade);
    return point === undefined ? sum : sum + point * Number(record.credits || 0);
  }, 0);
  const gpaCredits = currentGrades.reduce((sum, record) => {
    const point = getGradePoint(record.grade);
    return point === undefined ? sum : sum + Number(record.credits || 0);
  }, 0);
  const gpa = gpaCredits > 0 ? (gpaBase / gpaCredits).toFixed(2) : "-";

  function persistGrades(nextRecords: GradeRecord[]) {
    setGradeRecords(nextRecords);
    saveGradeRecords(nextRecords);
  }

  function persistSpecs(nextRecords: SpecRecord[]) {
    setSpecRecords(nextRecords);
    saveSpecRecords(nextRecords);
  }

  function addCourseGrade(course: Course) {
    const now = new Date().toISOString();
    const record: GradeRecord = {
      id: makeId("grade"),
      term: selectedTerm,
      courseId: course.id,
      courseName: course.name,
      credits: course.credits,
      grade: "미정",
      score: "",
      memo: "",
      createdAt: now,
      updatedAt: now,
    };

    persistGrades([record, ...gradeRecords]);
    setGradeMessage(`${course.name} 과목을 ${selectedTerm} 성적 항목에 추가했습니다.`);
  }

  function addAllCourseGrades() {
    if (unlinkedCourses.length === 0) return;

    const now = new Date().toISOString();
    const records = unlinkedCourses.map<GradeRecord>((course) => ({
      id: makeId("grade"),
      term: selectedTerm,
      courseId: course.id,
      courseName: course.name,
      credits: course.credits,
      grade: "미정",
      score: "",
      memo: "",
      createdAt: now,
      updatedAt: now,
    }));

    persistGrades([...records, ...gradeRecords]);
    setGradeMessage(`${unlinkedCourses.length}개 시간표 과목을 성적 항목에 추가했습니다.`);
  }

  function addCustomGrade(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const linkedCourse = courses.find((course) => course.id === newGrade.courseId);
    const courseName = linkedCourse?.name ?? newGrade.courseName.trim();

    if (!courseName) {
      setGradeMessage("과목명을 입력하거나 시간표 과목을 선택해주세요.");
      return;
    }

    const now = new Date().toISOString();
    const record: GradeRecord = {
      id: makeId("grade"),
      term: newGrade.term.trim() || selectedTerm,
      courseId: linkedCourse?.id,
      courseName,
      credits: Number(newGrade.credits) || linkedCourse?.credits || 0,
      grade: newGrade.grade,
      score: newGrade.score.trim(),
      memo: newGrade.memo.trim(),
      createdAt: now,
      updatedAt: now,
    };

    persistGrades([record, ...gradeRecords]);
    setSelectedTerm(record.term);
    setNewGrade({
      term: record.term,
      courseId: "custom",
      courseName: "",
      credits: "3",
      grade: "미정",
      score: "",
      memo: "",
    });
    setGradeMessage(`${courseName} 성적 항목을 추가했습니다.`);
  }

  function updateGrade(id: string, patch: Partial<GradeRecord>) {
    persistGrades(
      gradeRecords.map((record) =>
        record.id === id
          ? { ...record, ...patch, updatedAt: new Date().toISOString() }
          : record,
      ),
    );
  }

  function addStudySpec(study: PersonalStudy) {
    const now = new Date().toISOString();
    const record: SpecRecord = {
      id: makeId("spec"),
      personalStudyId: study.id,
      title: study.title,
      category: study.category,
      status: "in-progress",
      completedAt: "",
      memo: study.goal,
      createdAt: now,
      updatedAt: now,
    };

    persistSpecs([record, ...specRecords]);
    setSpecMessage(`${study.title} 개인 과제를 스펙 항목에 추가했습니다.`);
  }

  function addAllStudySpecs() {
    if (unlinkedStudies.length === 0) return;

    const now = new Date().toISOString();
    const records = unlinkedStudies.map<SpecRecord>((study) => ({
      id: makeId("spec"),
      personalStudyId: study.id,
      title: study.title,
      category: study.category,
      status: "in-progress",
      completedAt: "",
      memo: study.goal,
      createdAt: now,
      updatedAt: now,
    }));

    persistSpecs([...records, ...specRecords]);
    setSpecMessage(`${unlinkedStudies.length}개 개인 과제를 스펙 항목에 추가했습니다.`);
  }

  function addCustomSpec(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const linkedStudy = personalStudies.find(
      (study) => study.id === newSpec.personalStudyId,
    );
    const title = linkedStudy?.title ?? newSpec.title.trim();

    if (!title) {
      setSpecMessage("스펙 이름을 입력하거나 개인 과제를 선택해주세요.");
      return;
    }

    const now = new Date().toISOString();
    const record: SpecRecord = {
      id: makeId("spec"),
      personalStudyId: linkedStudy?.id,
      title,
      category: linkedStudy?.category ?? newSpec.category.trim(),
      status: newSpec.status,
      completedAt: newSpec.completedAt,
      memo: linkedStudy?.goal || newSpec.memo.trim(),
      createdAt: now,
      updatedAt: now,
    };

    persistSpecs([record, ...specRecords]);
    setNewSpec({
      personalStudyId: "custom",
      title: "",
      category: "",
      status: "planned",
      completedAt: "",
      memo: "",
    });
    setSpecMessage(`${title} 스펙 항목을 추가했습니다.`);
  }

  function updateSpec(id: string, patch: Partial<SpecRecord>) {
    persistSpecs(
      specRecords.map((record) =>
        record.id === id
          ? { ...record, ...patch, updatedAt: new Date().toISOString() }
          : record,
      ),
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header title="성적 및 스펙" />
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-6">
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <div className="mb-3 inline-flex rounded-lg bg-blue-50 p-2 text-blue-600">
                <BookOpen className="h-4 w-4" />
              </div>
              <p className="text-2xl font-bold">{currentGrades.length}</p>
              <p className="text-sm text-muted-foreground">이번 학기 성적 항목</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <div className="mb-3 inline-flex rounded-lg bg-emerald-50 p-2 text-emerald-600">
                <Award className="h-4 w-4" />
              </div>
              <p className="text-2xl font-bold">{gpa}</p>
              <p className="text-sm text-muted-foreground">평균 평점</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <div className="mb-3 inline-flex rounded-lg bg-violet-50 p-2 text-violet-600">
                <Briefcase className="h-4 w-4" />
              </div>
              <p className="text-2xl font-bold">{specRecords.length}</p>
              <p className="text-sm text-muted-foreground">스펙 항목</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="grades" className="gap-4">
          <TabsList className="w-fit">
            <TabsTrigger value="grades">성적</TabsTrigger>
            <TabsTrigger value="specs">스펙</TabsTrigger>
          </TabsList>

          <TabsContent value="grades" className="space-y-4">
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <CardTitle>학기별 성적</CardTitle>
                  <Select
                    value={selectedTerm}
                    onValueChange={(value) => value && setSelectedTerm(value)}
                  >
                    <SelectTrigger className="w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {terms.map((term) => (
                        <SelectItem key={term} value={term}>
                          {term}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 rounded-lg border bg-muted/20 p-3 md:grid-cols-3">
                  <div>
                    <p className="text-sm font-medium">총 학점</p>
                    <p className="text-xl font-bold">{gradedCredits}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium">평점 반영 학점</p>
                    <p className="text-xl font-bold">{gpaCredits}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium">현재 평균</p>
                    <p className="text-xl font-bold">{gpa}</p>
                  </div>
                </div>

                <div className="rounded-lg border p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium">시간표 과목 연동</p>
                      <p className="text-sm text-muted-foreground">
                        현재 입력된 시간표 과목을 {selectedTerm} 성적 항목으로 가져옵니다.
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={addAllCourseGrades}
                      disabled={unlinkedCourses.length === 0}
                    >
                      전체 추가
                    </Button>
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    {unlinkedCourses.length > 0 ? (
                      unlinkedCourses.map((course) => (
                        <div
                          key={course.id}
                          className="flex items-center justify-between rounded-md border bg-background p-3"
                        >
                          <div className="min-w-0">
                            <p className="truncate font-medium">{course.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {course.credits}학점 · {course.days.join(", ")}
                            </p>
                          </div>
                          <Button size="sm" onClick={() => addCourseGrade(course)}>
                            추가
                          </Button>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        이 학기에 추가할 새 시간표 과목이 없습니다.
                      </p>
                    )}
                  </div>
                </div>

                <form className="rounded-lg border p-4" onSubmit={addCustomGrade}>
                  <div className="mb-3 flex items-center gap-2">
                    <Plus className="h-4 w-4 text-primary" />
                    <p className="font-medium">성적 직접 추가</p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label>학기</Label>
                      <Input
                        value={newGrade.term}
                        onChange={(event) =>
                          setNewGrade((prev) => ({ ...prev, term: event.target.value }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>시간표 과목 연결</Label>
                      <Select
                        value={newGrade.courseId}
                        onValueChange={(value) => {
                          if (!value) return;
                          const course = courses.find((item) => item.id === value);
                          setNewGrade((prev) => ({
                            ...prev,
                            courseId: value,
                            courseName: course?.name ?? "",
                            credits: course ? String(course.credits) : prev.credits,
                          }));
                        }}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="custom">직접 입력</SelectItem>
                          {courses.map((course) => (
                            <SelectItem key={course.id} value={course.id}>
                              {course.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>과목명</Label>
                      <Input
                        value={newGrade.courseName}
                        disabled={newGrade.courseId !== "custom"}
                        onChange={(event) =>
                          setNewGrade((prev) => ({
                            ...prev,
                            courseName: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>학점</Label>
                      <Input
                        type="number"
                        min="0"
                        value={newGrade.credits}
                        onChange={(event) =>
                          setNewGrade((prev) => ({
                            ...prev,
                            credits: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>등급</Label>
                      <Select
                        value={newGrade.grade}
                        onValueChange={(value) => {
                          if (!value) return;
                          setNewGrade((prev) => ({ ...prev, grade: value }));
                        }}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {GRADE_OPTIONS.map((grade) => (
                            <SelectItem key={grade} value={grade}>
                              {grade}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>점수</Label>
                      <Input
                        placeholder="예: 95"
                        value={newGrade.score}
                        onChange={(event) =>
                          setNewGrade((prev) => ({ ...prev, score: event.target.value }))
                        }
                      />
                    </div>
                  </div>
                  <div className="mt-3 space-y-2">
                    <Label>메모</Label>
                    <Textarea
                      value={newGrade.memo}
                      onChange={(event) =>
                        setNewGrade((prev) => ({ ...prev, memo: event.target.value }))
                      }
                    />
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <p className="text-sm text-primary">{gradeMessage}</p>
                    <Button type="submit">성적 추가</Button>
                  </div>
                </form>

                <div className="grid gap-3">
                  {currentGrades.length > 0 ? (
                    currentGrades.map((record) => (
                      <Card key={record.id} className="border shadow-none">
                        <CardContent className="p-4">
                          <div className="grid gap-3 lg:grid-cols-[1fr_120px_120px_120px]">
                            <div>
                              <div className="mb-2 flex flex-wrap items-center gap-2">
                                <p className="font-semibold">{record.courseName}</p>
                                {record.courseId && (
                                  <Badge variant="secondary">시간표 연동</Badge>
                                )}
                              </div>
                              <Textarea
                                value={record.memo}
                                placeholder="성적 관련 메모"
                                onChange={(event) =>
                                  updateGrade(record.id, { memo: event.target.value })
                                }
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>학점</Label>
                              <Input
                                type="number"
                                min="0"
                                value={record.credits}
                                onChange={(event) =>
                                  updateGrade(record.id, {
                                    credits: Number(event.target.value) || 0,
                                  })
                                }
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>등급</Label>
                              <Select
                                value={record.grade}
                                onValueChange={(value) => {
                                  if (!value) return;
                                  updateGrade(record.id, { grade: value });
                                }}
                              >
                                <SelectTrigger className="w-full">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {GRADE_OPTIONS.map((grade) => (
                                    <SelectItem key={grade} value={grade}>
                                      {grade}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label>점수</Label>
                              <Input
                                value={record.score}
                                onChange={(event) =>
                                  updateGrade(record.id, { score: event.target.value })
                                }
                              />
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  ) : (
                    <Card className="border-dashed shadow-none">
                      <CardContent className="p-6 text-sm text-muted-foreground">
                        아직 {selectedTerm}에 등록된 성적 항목이 없습니다.
                      </CardContent>
                    </Card>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="specs" className="space-y-4">
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle>스펙 관리</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium">개인 과제 연동</p>
                      <p className="text-sm text-muted-foreground">
                        시간표 하단의 개인 과제를 스펙 항목으로 가져옵니다.
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={addAllStudySpecs}
                      disabled={unlinkedStudies.length === 0}
                    >
                      전체 추가
                    </Button>
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    {unlinkedStudies.length > 0 ? (
                      unlinkedStudies.map((study) => (
                        <div
                          key={study.id}
                          className="flex items-center justify-between rounded-md border bg-background p-3"
                        >
                          <div className="min-w-0">
                            <p className="truncate font-medium">{study.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {study.category || "분류 없음"}
                            </p>
                          </div>
                          <Button size="sm" onClick={() => addStudySpec(study)}>
                            추가
                          </Button>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        스펙으로 추가할 새 개인 과제가 없습니다.
                      </p>
                    )}
                  </div>
                </div>

                <form className="rounded-lg border p-4" onSubmit={addCustomSpec}>
                  <div className="mb-3 flex items-center gap-2">
                    <Target className="h-4 w-4 text-primary" />
                    <p className="font-medium">스펙 직접 추가</p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>개인 과제 연결</Label>
                      <Select
                        value={newSpec.personalStudyId}
                        onValueChange={(value) => {
                          if (!value) return;
                          const study = personalStudies.find((item) => item.id === value);
                          setNewSpec((prev) => ({
                            ...prev,
                            personalStudyId: value,
                            title: study?.title ?? "",
                            category: study?.category ?? prev.category,
                            memo: study?.goal ?? prev.memo,
                          }));
                        }}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="custom">직접 입력</SelectItem>
                          {personalStudies.map((study) => (
                            <SelectItem key={study.id} value={study.id}>
                              {study.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>스펙 이름</Label>
                      <Input
                        value={newSpec.title}
                        disabled={newSpec.personalStudyId !== "custom"}
                        onChange={(event) =>
                          setNewSpec((prev) => ({ ...prev, title: event.target.value }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>분류</Label>
                      <Input
                        placeholder="예: 자격증, 공모전, 포트폴리오"
                        value={newSpec.category}
                        onChange={(event) =>
                          setNewSpec((prev) => ({
                            ...prev,
                            category: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>상태</Label>
                      <Select
                        value={newSpec.status}
                        onValueChange={(value) => {
                          if (!value) return;
                          setNewSpec((prev) => ({
                            ...prev,
                            status: value as SpecRecord["status"],
                          }));
                        }}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(STATUS_LABELS).map(([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>완료일</Label>
                      <Input
                        type="date"
                        value={newSpec.completedAt}
                        onChange={(event) =>
                          setNewSpec((prev) => ({
                            ...prev,
                            completedAt: event.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>
                  <div className="mt-3 space-y-2">
                    <Label>메모</Label>
                    <Textarea
                      value={newSpec.memo}
                      onChange={(event) =>
                        setNewSpec((prev) => ({ ...prev, memo: event.target.value }))
                      }
                    />
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <p className="text-sm text-primary">{specMessage}</p>
                    <Button type="submit">스펙 추가</Button>
                  </div>
                </form>

                <div className="grid gap-3 md:grid-cols-2">
                  {specRecords.length > 0 ? (
                    specRecords.map((record) => (
                      <Card key={record.id} className="border shadow-none">
                        <CardContent className="space-y-3 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate font-semibold">{record.title}</p>
                              <p className="text-sm text-muted-foreground">
                                {record.category || "분류 없음"}
                              </p>
                            </div>
                            {record.personalStudyId && (
                              <Badge variant="secondary">개인 과제 연동</Badge>
                            )}
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-2">
                              <Label>상태</Label>
                              <Select
                                value={record.status}
                                onValueChange={(value) => {
                                  if (!value) return;
                                  updateSpec(record.id, {
                                    status: value as SpecRecord["status"],
                                  });
                                }}
                              >
                                <SelectTrigger className="w-full">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {Object.entries(STATUS_LABELS).map(([value, label]) => (
                                    <SelectItem key={value} value={value}>
                                      {label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label>완료일</Label>
                              <Input
                                type="date"
                                value={record.completedAt}
                                onChange={(event) =>
                                  updateSpec(record.id, {
                                    completedAt: event.target.value,
                                  })
                                }
                              />
                            </div>
                          </div>
                          <Textarea
                            value={record.memo}
                            placeholder="스펙 관련 메모"
                            onChange={(event) =>
                              updateSpec(record.id, { memo: event.target.value })
                            }
                          />
                        </CardContent>
                      </Card>
                    ))
                  ) : (
                    <Card className="border-dashed shadow-none md:col-span-2">
                      <CardContent className="p-6 text-sm text-muted-foreground">
                        아직 등록된 스펙 항목이 없습니다.
                      </CardContent>
                    </Card>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

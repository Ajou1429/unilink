"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Header } from "@/components/layout/Header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import {
  COURSES_CHANGED_EVENT,
  getStoredCourses,
} from "@/lib/course-storage";
import {
  getWeeklyStudyPlans,
  STUDY_PLANS_CHANGED_EVENT,
} from "@/lib/study-storage";
import {
  CourseSessionProgress,
  getCourseSessions,
  TIMETABLE_CHANGED_EVENT,
} from "@/lib/timetable-storage";
import { Course, StudyPlan } from "@/lib/types";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

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

function getSundayWeekStart(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return addDays(next, -next.getDay());
}

function formatProgress(session: CourseSessionProgress) {
  if (session.noteTitle && session.pageStart && session.pageEnd) {
    return `${session.noteTitle} ${session.pageStart}-${session.pageEnd}p`;
  }

  if (session.progressTitle) return session.progressTitle;
  return "진도 내용 미입력";
}

export default function AiCoachingPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [plans, setPlans] = useState<StudyPlan[]>([]);
  const [courseSessions, setCourseSessions] = useState<CourseSessionProgress[]>([]);

  useEffect(() => {
    function syncData() {
      setCourses(getStoredCourses());
      setPlans(getWeeklyStudyPlans());
      setCourseSessions(getCourseSessions());
    }

    syncData();
    window.addEventListener(COURSES_CHANGED_EVENT, syncData);
    window.addEventListener(STUDY_PLANS_CHANGED_EVENT, syncData);
    window.addEventListener(TIMETABLE_CHANGED_EVENT, syncData);
    window.addEventListener("storage", syncData);

    return () => {
      window.removeEventListener(COURSES_CHANGED_EVENT, syncData);
      window.removeEventListener(STUDY_PLANS_CHANGED_EVENT, syncData);
      window.removeEventListener(TIMETABLE_CHANGED_EVENT, syncData);
      window.removeEventListener("storage", syncData);
    };
  }, []);

  const currentWeekStartKey = formatDateKey(getSundayWeekStart(new Date()));
  const weeklyPlans = plans.filter(
    (plan) => (plan.weekStart ?? currentWeekStartKey) === currentWeekStartKey,
  );
  const pendingPlans = weeklyPlans.filter((plan) => !plan.isCompleted);
  const completedPlans = weeklyPlans.length - pendingPlans.length;
  const recentSessions = useMemo(
    () =>
      [...courseSessions]
        .sort(
          (a, b) =>
            new Date(b.updatedAt || b.createdAt).getTime() -
            new Date(a.updatedAt || a.createdAt).getTime(),
        )
        .slice(0, 5),
    [courseSessions],
  );
  const latestSessionByCourse = useMemo(() => {
    const latest = new Map<string, CourseSessionProgress>();

    [...courseSessions]
      .sort(
        (a, b) =>
          new Date(b.updatedAt || b.createdAt).getTime() -
          new Date(a.updatedAt || a.createdAt).getTime(),
      )
      .forEach((session) => {
        if (!latest.has(session.courseId)) {
          latest.set(session.courseId, session);
        }
      });

    return latest;
  }, [courseSessions]);
  const courseCoaching = courses.map((course) => {
    const latestSession = latestSessionByCourse.get(course.id);
    const coursePendingPlans = pendingPlans.filter(
      (plan) => plan.courseId === course.id,
    );
    const updatedAt = latestSession
      ? new Date(latestSession.updatedAt || latestSession.createdAt).getTime()
      : 0;
    const isStale = !updatedAt || Date.now() - updatedAt > WEEK_MS;

    return {
      course,
      latestSession,
      pendingPlanCount: coursePendingPlans.length,
      isStale,
    };
  });
  const priorityCourses = courseCoaching
    .filter((item) => item.isStale || item.pendingPlanCount > 0)
    .slice(0, 4);

  return (
    <div className="flex min-h-screen flex-col">
      <Header title="AI 진도 코칭" />

      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-6">
        <section className="grid gap-4 md:grid-cols-3">
          <Card className="border-0 shadow-sm">
            <CardContent className="p-5">
              <div className="mb-4 inline-flex rounded-lg bg-primary/10 p-2 text-primary">
                <Sparkles className="h-5 w-5" />
              </div>
              <p className="text-2xl font-bold">{priorityCourses.length}개</p>
              <p className="mt-1 text-sm text-muted-foreground">
                우선 확인할 과목
              </p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardContent className="p-5">
              <div className="mb-4 inline-flex rounded-lg bg-green-50 p-2 text-green-600">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <p className="text-2xl font-bold">
                {completedPlans}/{weeklyPlans.length}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                이번 주 학습 계획 이행
              </p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardContent className="p-5">
              <div className="mb-4 inline-flex rounded-lg bg-violet-50 p-2 text-violet-600">
                <TrendingUp className="h-5 w-5" />
              </div>
              <p className="text-2xl font-bold">{courseSessions.length}개</p>
              <p className="mt-1 text-sm text-muted-foreground">
                저장된 강의 진도
              </p>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Target className="h-4 w-4 text-primary" />
                  우선 코칭 과목
                </CardTitle>
                <Button
                  render={<Link href="/timetable" />}
                  nativeButton={false}
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1 text-xs text-primary"
                >
                  시간표 보기 <ArrowRight className="h-3 w-3" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {priorityCourses.length > 0 ? (
                priorityCourses.map(
                  ({ course, latestSession, pendingPlanCount, isStale }) => (
                    <div
                      key={course.id}
                      className="rounded-lg border bg-white p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-full"
                              style={{ backgroundColor: course.color }}
                            />
                            <p className="font-semibold">{course.name}</p>
                          </div>
                          <p className="mt-2 text-sm text-muted-foreground">
                            {latestSession
                              ? `최근 진도: ${formatProgress(latestSession)}`
                              : "아직 저장된 강의 진도가 없습니다."}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {isStale && (
                            <Badge variant="secondary">진도 확인 필요</Badge>
                          )}
                          {pendingPlanCount > 0 && (
                            <Badge variant="outline">
                              미완료 계획 {pendingPlanCount}개
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  ),
                )
              ) : (
                <div className="rounded-lg border border-dashed p-8 text-center">
                  <p className="text-sm font-medium">우선 코칭할 과목이 없습니다.</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    시간표에서 강의 진도를 저장하거나 학습 계획을 추가하면 이곳에
                    표시됩니다.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <BookOpen className="h-4 w-4 text-primary" />
                  이번 주 미완료 계획
                </CardTitle>
                <Button
                  render={<Link href="/study" />}
                  nativeButton={false}
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1 text-xs text-primary"
                >
                  학습 계획 <ArrowRight className="h-3 w-3" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {pendingPlans.length > 0 ? (
                pendingPlans.slice(0, 5).map((plan) => (
                  <div key={plan.id} className="rounded-lg border bg-white p-3">
                    <p className="text-sm font-semibold">{plan.title}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="secondary" className="text-[10px]">
                        {plan.courseName}
                      </Badge>
                      {plan.dueDate && (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {plan.dueDate}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-lg border border-dashed p-8 text-center">
                  <p className="text-sm font-medium">
                    이번 주 미완료 계획이 없습니다.
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    새 계획을 넣으면 코칭 기준으로 함께 반영됩니다.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="h-4 w-4 text-primary" />
              최근 반영된 강의 진도
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentSessions.length > 0 ? (
              recentSessions.map((session) => (
                <div
                  key={session.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-white p-4"
                >
                  <div className="min-w-0">
                    <p className="font-semibold">{session.courseName}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {formatProgress(session)}
                    </p>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <p>{session.date}</p>
                    <p>
                      {session.startTime} - {session.endTime}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-lg border border-dashed p-8 text-center">
                <p className="text-sm font-medium">저장된 강의 진도가 없습니다.</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  주간 시간표에서 수업 칸을 눌러 진도를 저장해 주세요.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

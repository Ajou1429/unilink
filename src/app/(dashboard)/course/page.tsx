"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BookOpen, Clock, MapPin } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { CourseOverview, COURSE_DATA_CHANGED_EVENT } from "@/components/course/CourseOverview";
import { CourseEvents } from "@/components/course/CourseEvents";
import { CourseSettingsDialog } from "@/components/course/CourseSettingsDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { Course } from "@/lib/types";
import { UNSCHEDULED_LABEL, isUnscheduledCourse } from "@/lib/ajou-catalog";
import { COURSES_CHANGED_EVENT, getCourseFiles, getCourseNotes, getStoredCourses } from "@/lib/course-storage";
import { getMyNotes, MY_NOTES_CHANGED_EVENT } from "@/lib/my-notes-storage";
import { listPlans } from "@/lib/course-overview/data";

// 수업 자료 전체 목록, 문제·계획과 편집 가능한 과제·시험 일정을 제공한다.

function formatDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
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
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [counts, setCounts] = useState({ notes: 0, plans: 0, files: 0 });

  useEffect(() => {
    let alive = true;
    async function refresh() {
      setCourses(getStoredCourses());
      if (!courseId) return;
      const todayKey = formatDateKey(new Date());
      const [myNotes, plans] = await Promise.all([getMyNotes().catch(() => []), listPlans(courseId).catch(() => [])]);
      if (!alive) return;
      setCounts({
        notes: getCourseNotes(courseId).length + myNotes.filter((note) => note.linkedType === "course" && note.linkedId === courseId).length,
        plans: plans.filter((plan) => !plan.done && plan.date.slice(0, 10) >= todayKey).length,
        files: getCourseFiles(courseId).length,
      });
    }
    const timeout = window.setTimeout(() => void refresh(), 0);
    const reload = () => void refresh();
    const events = [COURSES_CHANGED_EVENT, MY_NOTES_CHANGED_EVENT, COURSE_DATA_CHANGED_EVENT, "unilink:studyPlansChanged", "storage"];
    events.forEach((event) => window.addEventListener(event, reload));
    return () => { alive = false; window.clearTimeout(timeout); events.forEach((event) => window.removeEventListener(event, reload)); };
  }, [courseId]);

  const course = courses?.find((item) => item.id === courseId) ?? null;
  const courseTime = useMemo(() => {
    if (!course) return "";
    if (isUnscheduledCourse(course)) return UNSCHEDULED_LABEL;
    return `${course.days.join(", ")} ${course.startTime} - ${course.endTime}`;
  }, [course]);

  if (courses === null) return null;
  if (!courseId || !course) return <EmptyCourseState />;

  return (
    <div className="flex flex-col min-h-screen">
      <Header title={course.name} />
      <div className="flex-1 p-6 max-w-6xl mx-auto w-full space-y-6">
        <Card className="border-0 shadow-sm">
          <CardContent className="relative p-5">
            <div className="absolute right-3 top-3">
              <CourseSettingsDialog courseId={course.id} courseName={course.name} />
            </div>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pr-10">
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
                {Boolean(course.gradingWeights?.length) && (
                  <div className="flex flex-wrap items-center gap-1.5 text-xs" aria-label="성적 반영비율">
                    <span className="font-medium text-foreground">성적 반영비율</span>
                    {course.gradingWeights!.map((item) => (
                      <span key={item.item} className="rounded-md bg-muted px-2 py-0.5">
                        {item.item} <b>{item.weight}%</b>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <div className="text-xl font-bold text-primary">{counts.notes}</div>
                  <div className="text-xs text-muted-foreground">노트</div>
                </div>
                <div>
                  <div className="text-xl font-bold text-primary">{counts.plans}</div>
                  <div className="text-xs text-muted-foreground">계획</div>
                </div>
                <div>
                  <div className="text-xl font-bold text-primary">{counts.files}</div>
                  <div className="text-xs text-muted-foreground">파일</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <CourseEvents key={`events-${course.id}`} courseId={course.id} />
        <CourseOverview key={course.id} courseId={course.id} />
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

"use client";

import { useCurrentTime } from "@/lib/use-current-time";
import { TodayPlans } from "@/components/dashboard/TodayPlans";
import { ExamAssignments } from "@/components/dashboard/ExamAssignments";
import { ChatHome } from "@/components/home/ChatHome";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Header } from "@/components/layout/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { mockCourses, mockStudyPlans } from "@/lib/mock-data";
import { getActiveTermCourses, getStoredCourses } from "@/lib/course-storage";
import { getGreeting } from "@/lib/greeting";
import {
  getWeeklyStudyPlans,
  STUDY_PLANS_CHANGED_EVENT,
} from "@/lib/study-storage";
import { Course, DayOfWeek, StudyPlan } from "@/lib/types";
import {
  TIMETABLE_CHANGED_EVENT,
} from "@/lib/timetable-storage";
import {
  AUTH_CHANGED_EVENT,
  getCurrentUser,
  type CurrentUser,
} from "@/lib/auth-storage";
import {
  KOREA_TIME_ZONE,
} from "@/lib/academic-term";

const COURSE_WEEKDAYS: DayOfWeek[] = ["월", "화", "수", "목", "금"];

function getKoreanToday() {
  const now = new Date();
  const dateParts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: KOREA_TIME_ZONE,
    year: "numeric",
    month: "long",
    day: "numeric",
  }).formatToParts(now);
  const weekday = new Intl.DateTimeFormat("ko-KR", {
    timeZone: KOREA_TIME_ZONE,
    weekday: "long",
  }).format(now);
  const compactWeekday = weekday.replace("요일", "") as DayOfWeek;

  return {
    label: `${dateParts.find((part) => part.type === "year")?.value}년 ${
      dateParts.find((part) => part.type === "month")?.value
    } ${dateParts.find((part) => part.type === "day")?.value}일 ${weekday}`,
    courseDayOfWeek: COURSE_WEEKDAYS.includes(compactWeekday) ? compactWeekday : null,
  };
}

export default function DashboardPage() {
  const now = useCurrentTime();
  const [courses, setCourses] = useState<Course[]>(mockCourses);
  // 시험·과제·계획을 붙일 과목 (방학 중에는 직전 학기)
  const [termCourses, setTermCourses] = useState<Course[]>([]);
  const [plans, setPlans] = useState<StudyPlan[]>(mockStudyPlans);
  const [koreanToday, setKoreanToday] = useState(getKoreanToday);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);

  useEffect(() => {
    function loadDashboardData() {
      setCourses(getStoredCourses());
      setTermCourses(getActiveTermCourses().courses);
      setPlans(getWeeklyStudyPlans(mockStudyPlans));
      setKoreanToday(getKoreanToday());
      setCurrentUser(getCurrentUser());
    }

    window.setTimeout(loadDashboardData, 0);
    window.addEventListener(STUDY_PLANS_CHANGED_EVENT, loadDashboardData);
    window.addEventListener(TIMETABLE_CHANGED_EVENT, loadDashboardData);
    window.addEventListener(AUTH_CHANGED_EVENT, loadDashboardData);
    window.addEventListener("storage", loadDashboardData);

    return () => {
      window.removeEventListener(STUDY_PLANS_CHANGED_EVENT, loadDashboardData);
      window.removeEventListener(TIMETABLE_CHANGED_EVENT, loadDashboardData);
      window.removeEventListener(AUTH_CHANGED_EVENT, loadDashboardData);
      window.removeEventListener("storage", loadDashboardData);
    };
  }, []);

  const todaySchedule = courses.filter((course) =>
    koreanToday.courseDayOfWeek
      ? course.days.includes(koreanToday.courseDayOfWeek)
      : false,
  );
  const displayName =
    currentUser?.displayName || currentUser?.username || "게스트";
  // 정적 빌드 시각과 접속 시각의 인사말이 다를 수 있어 h2에 suppressHydrationWarning을 둔다.
  const greeting = getGreeting(displayName, new Date(now));
  return (
    <div className="flex min-h-[calc(100dvh-var(--app-top,0px))] flex-col lg:h-[calc(100dvh-var(--app-top,0px))] lg:overflow-hidden">
      <Header title="대시보드" bare />
      <div className="flex flex-1 flex-col lg:min-h-0">
      <ChatHome
        greeting={greeting}
        widgets={
        // 오늘 계획·시험·과제·오늘 수업은 입력창 아래에 한 줄로, 각 박스 안에서 스크롤
        <div className="grid gap-4 md:grid-cols-2 lg:h-full lg:grid-cols-[3fr_2fr_2fr] max-lg:[&>*]:h-80 lg:[&>*]:min-h-0">
          <TodayPlans date={new Intl.DateTimeFormat("sv-SE", { timeZone: KOREA_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now))} plans={plans} courses={termCourses} />

          <ExamAssignments now={now} courses={termCourses} />
          <Card className="flex min-h-0 min-w-0 flex-col border-0 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">오늘 수업</CardTitle>
                <Button
                  render={<Link href="/timetable" />}
                  nativeButton={false}
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1 text-primary"
                >
                  시간표 <ArrowRight className="h-3 w-3" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="min-h-0 flex-1 space-y-3 overflow-y-auto">
              {todaySchedule.length > 0 ? (
                todaySchedule.map((course) => (
                  <Link
                    key={course.id}
                    href={`/course?courseId=${encodeURIComponent(course.id)}`}
                    aria-label={`${course.name} 수업 페이지로 이동`}
                    className="flex items-start gap-3 rounded-lg p-2 -m-2 transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div
                      className="w-1 h-12 rounded-full shrink-0 mt-0.5"
                      style={{ backgroundColor: course.color }}
                    />
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{course.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {course.startTime} - {course.endTime}
                      </p>
                      <p className="text-xs text-muted-foreground">{course.location}</p>
                    </div>
                  </Link>
                ))
              ) : (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  오늘 수업이 없어요.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
        }
      />
      </div>
    </div>
  );
}

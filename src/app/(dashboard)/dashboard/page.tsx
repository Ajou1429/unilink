"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Header } from "@/components/layout/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  CalendarDays,
  MessageSquare,
  BookOpen,
  Sparkles,
  ArrowRight,
  Circle,
  Clock,
  Target,
  Users,
  TrendingUp,
} from "lucide-react";
import { mockCourses, mockPosts, mockStudyPlans } from "@/lib/mock-data";
import { getStoredCourses } from "@/lib/course-storage";
import {
  getPersonalStudies,
  PERSONAL_STUDIES_CHANGED_EVENT,
  PersonalStudy,
} from "@/lib/personal-study-storage";
import {
  getWeeklyStudyPlans,
  saveWeeklyStudyPlans,
  STUDY_PLANS_CHANGED_EVENT,
} from "@/lib/study-storage";
import { Course, DayOfWeek, StudyPlan } from "@/lib/types";

const recentPosts = mockPosts.slice(0, 3);
const KOREA_TIME_ZONE = "Asia/Seoul";
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
  const [courses, setCourses] = useState<Course[]>(mockCourses);
  const [plans, setPlans] = useState<StudyPlan[]>(mockStudyPlans);
  const [personalStudies, setPersonalStudies] = useState<PersonalStudy[]>([]);
  const [koreanToday, setKoreanToday] = useState(getKoreanToday);

  useEffect(() => {
    function loadDashboardData() {
      setCourses(getStoredCourses());
      setPlans(getWeeklyStudyPlans(mockStudyPlans));
      setPersonalStudies(getPersonalStudies());
      setKoreanToday(getKoreanToday());
    }

    window.setTimeout(loadDashboardData, 0);
    window.addEventListener(STUDY_PLANS_CHANGED_EVENT, loadDashboardData);
    window.addEventListener(PERSONAL_STUDIES_CHANGED_EVENT, loadDashboardData);
    window.addEventListener("storage", loadDashboardData);

    return () => {
      window.removeEventListener(STUDY_PLANS_CHANGED_EVENT, loadDashboardData);
      window.removeEventListener(PERSONAL_STUDIES_CHANGED_EVENT, loadDashboardData);
      window.removeEventListener("storage", loadDashboardData);
    };
  }, []);

  const todaySchedule = courses.filter((course) =>
    koreanToday.courseDayOfWeek
      ? course.days.includes(koreanToday.courseDayOfWeek)
      : false,
  );
  const upcomingPlans = plans.filter((plan) => !plan.isCompleted).slice(0, 4);

  function completePlan(planId: string) {
    const nextPlans = plans.map((plan) =>
      plan.id === planId ? { ...plan, isCompleted: true } : plan,
    );
    setPlans(nextPlans);
    saveWeeklyStudyPlans(nextPlans);
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Header title="대시보드" />
      <div className="flex-1 p-6 space-y-6 max-w-6xl mx-auto w-full">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">안녕하세요, 이지민님</h2>
            <p className="text-muted-foreground mt-1">
              2024년 1학기 · 연세대학교 컴퓨터과학과
            </p>
          </div>
          <Badge
            variant="outline"
            className="gap-1 text-primary border-primary/30 bg-primary/5 hidden md:flex"
          >
            <CalendarDays className="h-3.5 w-3.5" />
            {koreanToday.label}
          </Badge>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              label: "수강 중인 수업",
              value: String(courses.length),
              icon: BookOpen,
              color: "text-blue-600 bg-blue-50",
            },
            {
              label: "같은 수업 친구",
              value: "247명",
              icon: Users,
              color: "text-violet-600 bg-violet-50",
            },
            {
              label: "개인 공부",
              value: String(personalStudies.length),
              icon: Target,
              color: "text-green-600 bg-green-50",
            },
            {
              label: "커뮤니티 활동",
              value: "12",
              icon: TrendingUp,
              color: "text-amber-600 bg-amber-50",
            },
          ].map((stat) => (
            <Card key={stat.label} className="border-0 shadow-sm">
              <CardContent className="p-4">
                <div className={`inline-flex p-2 rounded-lg mb-3 ${stat.color}`}>
                  <stat.icon className="h-4 w-4" />
                </div>
                <div className="text-2xl font-bold">{stat.value}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {stat.label}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <Card className="border-0 shadow-sm">
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
            <CardContent className="space-y-3">
              {todaySchedule.length > 0 ? (
                todaySchedule.map((course) => (
                  <div key={course.id} className="flex items-start gap-3">
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
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  오늘 수업이 없어요.
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">이번 주 학습 계획</CardTitle>
                <Button
                  render={<Link href="/study" />}
                  nativeButton={false}
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1 text-primary"
                >
                  전체 보기 <ArrowRight className="h-3 w-3" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {upcomingPlans.length > 0 ? (
                upcomingPlans.map((plan) => (
                  <div key={plan.id} className="flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => completePlan(plan.id)}
                      className="mt-0.5 shrink-0 rounded-full text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={`${plan.title} 완료 처리`}
                    >
                      <Circle className="h-4 w-4" />
                    </button>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{plan.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          {plan.courseName}
                        </Badge>
                        {plan.dueDate && (
                          <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {plan.dueDate}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  아직 해결 안 된 이번주 계획이 없어요.
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm bg-linear-to-br from-primary/5 to-violet-50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                AI 오늘의 추천
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-white rounded-lg p-3 shadow-sm">
                <p className="text-sm font-medium">중간고사 D-7 준비 플랜</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  운영체제 교착상태와 데이터베이스 정규화를 우선 복습하는 것을
                  추천합니다.
                </p>
                <Button size="sm" className="mt-3 h-7 text-xs w-full gap-1">
                  학습 플랜 생성 <Sparkles className="h-3 w-3" />
                </Button>
              </div>
              <div className="bg-white rounded-lg p-3 shadow-sm">
                <p className="text-sm font-medium">놓치지 마세요</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  알고리즘 과제 제출 마감이 3일 남았습니다.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">커뮤니티 최신 글</CardTitle>
              <Button
                render={<Link href="/community" />}
                nativeButton={false}
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1 text-primary"
              >
                전체 보기 <ArrowRight className="h-3 w-3" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-0">
              {recentPosts.map((post, idx) => (
                <div key={post.id}>
                  <Link href="/community">
                    <div className="py-3 flex items-center gap-3 hover:bg-accent/50 -mx-2 px-2 rounded-lg transition-colors cursor-pointer">
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        {post.category}
                      </Badge>
                      <p className="text-sm font-medium truncate flex-1">{post.title}</p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                        <span className="flex items-center gap-1">
                          <MessageSquare className="h-3 w-3" />
                          {post.commentCount}
                        </span>
                        <span>
                          {new Date(post.createdAt).toLocaleDateString("ko-KR", {
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      </div>
                    </div>
                  </Link>
                  {idx < recentPosts.length - 1 && <Separator />}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

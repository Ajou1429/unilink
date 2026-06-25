import Link from "next/link";
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
  CheckCircle2,
  Circle,
  Clock,
  Users,
  TrendingUp,
} from "lucide-react";
import { mockCourses, mockPosts, mockStudyPlans } from "@/lib/mock-data";

const todaySchedule = mockCourses.filter((c) => c.days.includes("월"));
const recentPosts = mockPosts.slice(0, 3);
const upcomingPlans = mockStudyPlans.filter((p) => !p.isCompleted).slice(0, 3);

export default function DashboardPage() {
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
            2024년 3월 25일 월요일
          </Badge>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              label: "수강 중인 수업",
              value: "5",
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
              label: "이번 주 학습 목표",
              value: "3/5",
              icon: CheckCircle2,
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
                <Link href="/timetable">
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-primary">
                    시간표 <ArrowRight className="h-3 w-3" />
                  </Button>
                </Link>
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
                <Link href="/study">
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-primary">
                    전체 보기 <ArrowRight className="h-3 w-3" />
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {upcomingPlans.map((plan) => (
                <div key={plan.id} className="flex items-start gap-3">
                  <Circle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{plan.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {plan.courseName}
                      </Badge>
                      <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {plan.dueDate}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
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
              <Link href="/community">
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-primary">
                  전체 보기 <ArrowRight className="h-3 w-3" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-0">
              {recentPosts.map((post, idx) => (
                <div key={post.id}>
                  <Link href={`/community/${post.id}`}>
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

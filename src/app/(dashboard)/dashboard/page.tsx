import { Header } from "@/components/layout/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  CalendarDays,
  MessageSquare,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  Clock,
  Loader2,
  TrendingUp,
  BookOpen,
  Brain,
  HardDrive,
} from "lucide-react";
import Link from "next/link";
import { mockCourses, mockPosts, mockSessions, mockAnalyses } from "@/lib/mock-data";

const todaySchedule = mockCourses.filter((c) => c.days.includes("월"));
const recentPosts = mockPosts.slice(0, 3);

const SESSION_STATUS = {
  done: { label: "분석 완료", icon: CheckCircle2, color: "text-green-600" },
  processing: { label: "분석 중", icon: Loader2, color: "text-blue-600" },
  pending: { label: "대기 중", icon: Clock, color: "text-amber-600" },
  error: { label: "오류", icon: Clock, color: "text-red-600" },
} as const;

const doneSessions = mockSessions.filter((s) => s.status === "done");
const avgScore = doneSessions.length > 0
  ? Math.round(doneSessions.reduce((sum, s) => sum + (mockAnalyses[s.id]?.comprehensionScore ?? 0), 0) / doneSessions.length)
  : 0;

export default function DashboardPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <Header title="홈" />
      <div className="flex-1 p-6 space-y-6 max-w-6xl mx-auto w-full">

        {/* Welcome */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">안녕하세요, 이준원님</h2>
            <p className="text-muted-foreground mt-1">2026년 1학기 · 연세대학교 컴퓨터과학과</p>
          </div>
          <Badge variant="outline" className="gap-1 text-primary border-primary/30 bg-primary/5 hidden md:flex">
            <CalendarDays className="h-3.5 w-3.5" />
            8주차 진행 중
          </Badge>
        </div>

        {/* Pipeline stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "이번 주 세션", value: String(mockSessions.length), icon: BookOpen, color: "text-blue-600 bg-blue-50" },
            { label: "AI 정리 완료", value: String(doneSessions.length), icon: CheckCircle2, color: "text-green-600 bg-green-50" },
            { label: "평균 이해도", value: `${avgScore}점`, icon: Brain, color: "text-violet-600 bg-violet-50" },
            { label: "Drive 저장 파일", value: String(doneSessions.length), icon: HardDrive, color: "text-amber-600 bg-amber-50" },
          ].map((stat) => (
            <Card key={stat.label} className="border-0 shadow-sm">
              <CardContent className="p-4">
                <div className={`inline-flex p-2 rounded-lg mb-3 ${stat.color}`}>
                  <stat.icon className="h-4 w-4" />
                </div>
                <div className="text-2xl font-bold">{stat.value}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{stat.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Recent sessions */}
          <Card className="border-0 shadow-sm lg:col-span-2">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">최근 수업 세션</CardTitle>
                <Link href="/sessions">
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-primary">
                    전체 보기 <ArrowRight className="h-3 w-3" />
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {mockSessions.map((session) => {
                const cfg = SESSION_STATUS[session.status];
                const Icon = cfg.icon;
                const analysis = mockAnalyses[session.id];
                return (
                  <Link key={session.id} href="/sessions">
                    <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent/50 transition-colors cursor-pointer">
                      <div
                        className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0 text-white text-xs font-bold"
                        style={{ backgroundColor: mockCourses.find((c) => c.id === session.courseId)?.color ?? "#4F46E5" }}
                      >
                        {session.week}주
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{session.courseName}</p>
                        <p className="text-xs text-muted-foreground">{session.date}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {analysis && (
                          <span className="text-xs font-semibold text-primary">{analysis.comprehensionScore}점</span>
                        )}
                        <span className={`flex items-center gap-1 text-xs font-medium ${cfg.color}`}>
                          <Icon className={`h-3.5 w-3.5 ${session.status === "processing" ? "animate-spin" : ""}`} />
                          {cfg.label}
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
              <Link href="/sessions">
                <Button variant="outline" className="w-full mt-2 gap-2 text-sm">
                  <Sparkles className="h-4 w-4 text-primary" />
                  새 수업 세션 시작하기
                </Button>
              </Link>
            </CardContent>
          </Card>

          {/* AI pipeline + today */}
          <div className="space-y-4">
            {/* AI flow card */}
            <Card className="border-0 shadow-sm bg-linear-to-br from-primary/5 to-violet-50">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  AI 학습 파이프라인
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {[
                  { step: "①", label: "수업 중 필기", done: true },
                  { step: "②", label: "AI 자동 분석", done: true },
                  { step: "③", label: "Drive 저장", done: true },
                  { step: "④", label: "시험 학습 계획", done: false },
                ].map((item) => (
                  <div key={item.step} className="flex items-center gap-2">
                    <span className={`text-xs font-bold w-5 ${item.done ? "text-primary" : "text-muted-foreground"}`}>{item.step}</span>
                    <span className={`text-xs ${item.done ? "text-foreground" : "text-muted-foreground"}`}>{item.label}</span>
                    {item.done && <CheckCircle2 className="h-3 w-3 text-primary ml-auto" />}
                  </div>
                ))}
                <Link href="/sessions">
                  <Button size="sm" className="w-full mt-3 gap-2">
                    <Sparkles className="h-3.5 w-3.5" /> 세션 분석 보기
                  </Button>
                </Link>
              </CardContent>
            </Card>

            {/* Today's schedule */}
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
                      <div className="w-1 h-10 rounded-full shrink-0 mt-0.5" style={{ backgroundColor: course.color }} />
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{course.name}</p>
                        <p className="text-xs text-muted-foreground">{course.startTime} – {course.endTime}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground py-2 text-center">오늘 수업이 없어요</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Community feed */}
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
                  <div className="py-3 flex items-center gap-3 hover:bg-accent/50 -mx-2 px-2 rounded-lg transition-colors cursor-pointer">
                    <Badge variant="outline" className="text-[10px] shrink-0">{post.category}</Badge>
                    <p className="text-sm font-medium truncate flex-1">{post.title}</p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                      <span className="flex items-center gap-1">
                        <MessageSquare className="h-3 w-3" />{post.commentCount}
                      </span>
                      <span>{new Date(post.createdAt).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}</span>
                    </div>
                  </div>
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

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  CalendarDays,
  Users,
  MessageSquare,
  Sparkles,
  GraduationCap,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";

const features = [
  {
    icon: CalendarDays,
    title: "스마트 시간표",
    description:
      "수업을 등록하고 같은 강의를 듣는 친구들과 자연스럽게 연결하세요.",
    color: "bg-blue-50 text-blue-600",
  },
  {
    icon: Users,
    title: "수업 커뮤니티",
    description:
      "과제, 시험 범위, 강의 자료와 같은 정보를 수업별로 모아볼 수 있습니다.",
    color: "bg-violet-50 text-violet-600",
  },
  {
    icon: MessageSquare,
    title: "익명 게시판",
    description:
      "학교생활의 고민과 정보를 부담 없이 나누는 커뮤니티 공간입니다.",
    color: "bg-pink-50 text-pink-600",
  },
  {
    icon: Sparkles,
    title: "AI 학습 계획",
    description:
      "과목, 시험 일정, 현재 진도를 바탕으로 학습 계획을 추천합니다.",
    color: "bg-amber-50 text-amber-600",
  },
];

const stats = [
  { value: "50+", label: "연동 대학" },
  { value: "12만", label: "활성 사용자" },
  { value: "98%", label: "사용자 만족도" },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      <header className="fixed top-0 inset-x-0 z-50 border-b bg-white/80 backdrop-blur-md">
        <div className="mx-auto max-w-6xl px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GraduationCap className="h-7 w-7 text-primary" />
            <span className="text-xl font-bold text-primary">UniLink</span>
          </div>
          <nav className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">
              기능
            </a>
            <a href="#how" className="hover:text-foreground transition-colors">
              이용 방법
            </a>
            <a href="#pricing" className="hover:text-foreground transition-colors">
              요금제
            </a>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost" size="sm">
                로그인
              </Button>
            </Link>
            <Link href="/signup">
              <Button size="sm">시작하기</Button>
            </Link>
          </div>
        </div>
      </header>

      <section className="pt-32 pb-20 px-4">
        <div className="mx-auto max-w-4xl text-center">
          <Badge
            variant="secondary"
            className="mb-6 text-primary border-primary/20 bg-primary/5"
          >
            대학생을 위한 개인화 플랫폼
          </Badge>
          <h1 className="text-5xl md:text-6xl font-bold tracking-tight text-foreground leading-tight mb-6">
            시간표로 시작하는
            <br />
            <span className="text-primary">대학생활 커뮤니티</span>
          </h1>
          <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed">
            같은 강의를 듣는 사람들과 연결되고, 익명으로 소통하며, AI가
            도와주는 학습 계획으로 성적까지 관리하세요.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/signup">
              <Button size="lg" className="text-base px-8 gap-2">
                무료로 시작하기 <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/dashboard">
              <Button size="lg" variant="outline" className="text-base px-8">
                데모 보기
              </Button>
            </Link>
          </div>
          <div className="mt-16 grid grid-cols-3 gap-8 max-w-lg mx-auto">
            {stats.map((s) => (
              <div key={s.label} className="text-center">
                <div className="text-3xl font-bold text-primary">{s.value}</div>
                <div className="text-sm text-muted-foreground mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 pb-24">
        <div className="mx-auto max-w-5xl rounded-2xl overflow-hidden border shadow-2xl bg-slate-900">
          <div className="bg-slate-800 h-10 flex items-center gap-2 px-4">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <div className="w-3 h-3 rounded-full bg-yellow-500" />
              <div className="w-3 h-3 rounded-full bg-green-500" />
            </div>
            <div className="flex-1 mx-4">
              <div className="bg-slate-700 rounded h-5 w-48 mx-auto" />
            </div>
          </div>
          <div className="aspect-video bg-linear-to-br from-slate-900 via-blue-950 to-indigo-950 flex items-center justify-center">
            <div className="text-center text-white/40">
              <GraduationCap className="h-16 w-16 mx-auto mb-4 opacity-30" />
              <p className="text-lg font-medium opacity-50">UniLink 대시보드</p>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="py-24 px-4 bg-slate-50">
        <div className="mx-auto max-w-5xl">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">
              대학생활에 필요한 모든 것
            </h2>
            <p className="text-muted-foreground text-lg">
              하나의 앱으로 수업, 커뮤니티, 학습을 관리하세요.
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            {features.map((f) => (
              <Card
                key={f.title}
                className="border-0 shadow-sm hover:shadow-md transition-shadow"
              >
                <CardContent className="p-6">
                  <div className={`inline-flex p-3 rounded-xl mb-4 ${f.color}`}>
                    <f.icon className="h-6 w-6" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">{f.title}</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    {f.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section id="how" className="py-24 px-4">
        <div className="mx-auto max-w-4xl">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">3분이면 충분해요</h2>
            <p className="text-muted-foreground text-lg">
              간단하게 시작하고 바로 활용할 수 있습니다.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: "01",
                title: "학교 이메일로 가입",
                desc: "재학생 인증을 바탕으로 신뢰할 수 있는 커뮤니티를 만듭니다.",
              },
              {
                step: "02",
                title: "시간표 입력",
                desc: "이번 학기 수업을 입력하면 같은 수업 친구들과 연결됩니다.",
              },
              {
                step: "03",
                title: "함께 공부 시작",
                desc: "커뮤니티에 참여하고 AI 학습 계획으로 성적을 관리하세요.",
              },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="text-5xl font-black text-primary/10 mb-4">
                  {item.step}
                </div>
                <h3 className="font-semibold text-lg mb-2">{item.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="py-24 px-4 bg-slate-50">
        <div className="mx-auto max-w-4xl">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">합리적인 요금제</h2>
            <p className="text-muted-foreground text-lg">
              학생을 위한 가격으로 시작하세요.
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-6 max-w-2xl mx-auto">
            <Card className="border shadow-sm">
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold mb-1">무료</h3>
                <div className="text-3xl font-bold mb-4">
                  0원
                  <span className="text-sm font-normal text-muted-foreground">/월</span>
                </div>
                <ul className="space-y-3 mb-6">
                  {["시간표 생성", "수업 커뮤니티", "익명 게시판", "기본 학습 노트"].map(
                    (f) => (
                      <li key={f} className="flex items-center gap-2 text-sm">
                        <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                        {f}
                      </li>
                    ),
                  )}
                </ul>
                <Link href="/signup">
                  <Button variant="outline" className="w-full">
                    시작하기
                  </Button>
                </Link>
              </CardContent>
            </Card>
            <Card className="border-primary shadow-md relative overflow-hidden">
              <div className="absolute top-3 right-3">
                <Badge className="text-xs">인기</Badge>
              </div>
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold mb-1">Pro</h3>
                <div className="text-3xl font-bold mb-4">
                  4,900원
                  <span className="text-sm font-normal text-muted-foreground">/월</span>
                </div>
                <ul className="space-y-3 mb-6">
                  {[
                    "무료 플랜 모든 기능",
                    "AI 학습 계획 생성",
                    "강의 노트 AI 정리",
                    "시험 대비 맞춤 문제",
                    "광고 없음",
                  ].map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link href="/signup">
                  <Button className="w-full">Pro 시작하기</Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section className="py-24 px-4 bg-primary">
        <div className="mx-auto max-w-3xl text-center text-white">
          <h2 className="text-4xl font-bold mb-4">지금 바로 시작하세요</h2>
          <p className="text-primary-foreground/80 text-lg mb-8">
            UniLink와 함께 더 똑똑한 대학생활을 만들어보세요.
          </p>
          <Link href="/signup">
            <Button size="lg" variant="secondary" className="text-base px-8 gap-2">
              무료로 시작하기 <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      <footer className="py-8 px-4 border-t">
        <div className="mx-auto max-w-6xl flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-primary" />
            <span className="font-bold text-primary">UniLink</span>
          </div>
          <p className="text-sm text-muted-foreground">
            © 2024 UniLink. All rights reserved.
          </p>
          <div className="flex gap-6 text-sm text-muted-foreground">
            <a href="#" className="hover:text-foreground">
              이용약관
            </a>
            <a href="#" className="hover:text-foreground">
              개인정보처리방침
            </a>
            <a href="#" className="hover:text-foreground">
              문의
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

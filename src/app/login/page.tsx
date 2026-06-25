import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GraduationCap } from "lucide-react";

export default function LoginPage() {
  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex lg:w-1/2 bg-primary flex-col justify-between p-12">
        <div className="flex items-center gap-2 text-white">
          <GraduationCap className="h-8 w-8" />
          <span className="text-2xl font-bold">UniLink</span>
        </div>
        <div className="text-white">
          <blockquote className="text-2xl font-medium leading-relaxed mb-4">
            &ldquo;같은 강의, 같은 고민을 가진 친구들과 함께하니 대학생활이
            훨씬 또렷해졌어요.&rdquo;
          </blockquote>
          <p className="text-primary-foreground/70">
            UniLink 사용자, 연세대학교 컴퓨터과학과
          </p>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[
            { value: "50+", label: "연동 대학" },
            { value: "12만", label: "사용자" },
            { value: "4.9점", label: "앱 평점" },
          ].map((s) => (
            <div key={s.label} className="text-white">
              <div className="text-2xl font-bold">{s.value}</div>
              <div className="text-primary-foreground/70 text-sm">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-2 text-primary mb-8">
            <GraduationCap className="h-6 w-6" />
            <span className="text-xl font-bold">UniLink</span>
          </div>

          <h1 className="text-2xl font-bold mb-2">다시 만나서 반가워요</h1>
          <p className="text-muted-foreground mb-8">
            계정이 없으신가요?{" "}
            <Link href="/signup" className="text-primary font-medium hover:underline">
              회원가입
            </Link>
          </p>

          <form className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">이메일</Label>
              <Input
                id="email"
                type="email"
                placeholder="university@school.ac.kr"
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between">
                <Label htmlFor="password">비밀번호</Label>
                <a href="#" className="text-sm text-primary hover:underline">
                  비밀번호 찾기
                </a>
              </div>
              <Input
                id="password"
                type="password"
                placeholder="비밀번호를 입력하세요"
                className="h-11"
              />
            </div>
            <Link href="/dashboard">
              <Button className="w-full h-11 mt-2">로그인</Button>
            </Link>
          </form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">또는</span>
            </div>
          </div>

          <div className="space-y-3">
            <Button variant="outline" className="w-full h-11 gap-3">
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              Google로 로그인
            </Button>
            <Button variant="outline" className="w-full h-11 gap-3">
              카카오로 로그인
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

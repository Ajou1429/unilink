"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { GraduationCap, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function LoginContent() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/dashboard";
  const hasError = searchParams.get("error") === "auth";

  async function handleGoogleLogin() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        scopes: [
          "email",
          "profile",
          "https://www.googleapis.com/auth/drive.file",
        ].join(" "),
        redirectTo: `${window.location.origin}/api/auth/callback?next=${next}`,
        queryParams: {
          access_type: "offline",
          prompt: "consent",
        },
      },
    });
  }

  return (
    <div className="min-h-screen flex">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-primary flex-col justify-between p-12">
        <div className="flex items-center gap-2 text-white">
          <GraduationCap className="h-8 w-8" />
          <span className="text-2xl font-bold">UniLink</span>
        </div>
        <div className="text-white">
          <h2 className="text-3xl font-bold mb-4 leading-tight">
            수업 중 필기하고<br />
            AI가 자동으로 정리해요
          </h2>
          <p className="text-primary-foreground/70 text-lg leading-relaxed">
            강의 노트를 AI가 진도 정리·이해도 분석·교수 강조점으로<br />
            자동 요약하고 Google Drive에 저장합니다.
          </p>
          <div className="mt-8 space-y-3">
            {[
              "수업 종료 시 자동 AI 정리본 생성",
              "Google Drive에 주차별 자동 폴더링",
              "시험기간 맞춤 학습 계획 자동 수립",
            ].map((item) => (
              <div key={item} className="flex items-center gap-3 text-primary-foreground/90">
                <div className="h-1.5 w-1.5 rounded-full bg-white/70 shrink-0" />
                <span className="text-sm">{item}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[
            { value: "iOS", label: "네이티브 필기 앱" },
            { value: "Drive", label: "자동 동기화" },
            { value: "AI", label: "5종 자동 정리" },
          ].map((s) => (
            <div key={s.label} className="text-white">
              <div className="text-2xl font-bold">{s.value}</div>
              <div className="text-primary-foreground/70 text-sm">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-2 text-primary mb-8">
            <GraduationCap className="h-6 w-6" />
            <span className="text-xl font-bold">UniLink</span>
          </div>

          <h1 className="text-2xl font-bold mb-2">시작하기</h1>
          <p className="text-muted-foreground mb-8">
            Google 계정으로 로그인하면 Drive 연동이 자동으로 설정됩니다.
          </p>

          {hasError && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg px-4 py-3 mb-6">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>로그인에 실패했습니다. 다시 시도해주세요.</span>
            </div>
          )}

          <Button
            className="w-full h-12 gap-3 text-base"
            onClick={handleGoogleLogin}
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Google로 계속하기
          </Button>

          <p className="text-xs text-muted-foreground text-center mt-4 leading-relaxed">
            로그인 시 Google Drive 접근 권한이 요청됩니다.<br />
            UniLink가 만든 파일에만 접근하며 기존 파일은 수정하지 않습니다.
          </p>

          <div className="mt-8 pt-6 border-t text-center">
            <p className="text-sm text-muted-foreground">
              계정이 없으신가요?{" "}
              <Link href="/signup" className="text-primary font-medium hover:underline">
                회원가입
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}

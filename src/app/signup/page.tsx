"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GraduationCap } from "lucide-react";
import { signupWithPassword } from "@/lib/auth-storage";

export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    username: "",
    displayName: "",
    password: "",
    passwordConfirm: "",
    university: "",
    department: "",
    birthday: "",
  });
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateField(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage("");

    const result = await signupWithPassword(form);
    setIsSubmitting(false);

    if (!result.ok) {
      setMessage(result.message);
      return;
    }

    router.push("/dashboard");
  }

  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex lg:w-1/2 bg-primary flex-col justify-between p-12">
        <div className="flex items-center gap-2 text-white">
          <GraduationCap className="h-8 w-8" />
          <span className="text-2xl font-bold">UniLink</span>
        </div>
        <div className="space-y-6 text-white">
          <h2 className="text-3xl font-bold leading-snug">
            수업과 필기,
            <br />
            학습 계획을 한 번에
          </h2>
          {[
            "대학교와 학과 기반으로 수업 커뮤니티 준비",
            "강의 노트와 주간 진도 관리",
            "추후 학교 인증과 소셜 로그인 연동 예정",
          ].map((text) => (
            <div key={text} className="flex items-center gap-3 text-primary-foreground/90">
              <div className="h-2 w-2 rounded-full bg-white" />
              {text}
            </div>
          ))}
        </div>
        <p className="text-sm text-primary-foreground/60">
          지금은 기본 회원가입만 받고, 학교 인증 절차는 나중에 추가할 수 있습니다.
        </p>
      </div>

      <div className="flex flex-1 items-center justify-center overflow-y-auto p-8">
        <div className="w-full max-w-md py-8">
          <div className="mb-8 flex items-center gap-2 text-primary lg:hidden">
            <GraduationCap className="h-6 w-6" />
            <span className="text-xl font-bold">UniLink</span>
          </div>

          <h1 className="mb-2 text-2xl font-bold">회원가입</h1>
          <p className="mb-8 text-muted-foreground">
            이미 계정이 있나요?{" "}
            <Link href="/login" className="font-medium text-primary hover:underline">
              로그인
            </Link>
          </p>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="username">아이디</Label>
              <Input
                id="username"
                autoComplete="username"
                placeholder="로그인에 사용할 아이디"
                className="h-11"
                value={form.username}
                onChange={(event) => updateField("username", event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="displayName">사용자 이름</Label>
              <Input
                id="displayName"
                autoComplete="name"
                placeholder="화면에 표시될 이름"
                className="h-11"
                value={form.displayName}
                onChange={(event) =>
                  updateField("displayName", event.target.value)
                }
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="password">비밀번호</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="6자 이상"
                  className="h-11"
                  value={form.password}
                  onChange={(event) => updateField("password", event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="passwordConfirm">비밀번호 확인</Label>
                <Input
                  id="passwordConfirm"
                  type="password"
                  autoComplete="new-password"
                  placeholder="다시 입력"
                  className="h-11"
                  value={form.passwordConfirm}
                  onChange={(event) =>
                    updateField("passwordConfirm", event.target.value)
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="university">대학교</Label>
              <Input
                id="university"
                placeholder="예: 아주대학교"
                className="h-11"
                value={form.university}
                onChange={(event) => updateField("university", event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="department">학과</Label>
              <Input
                id="department"
                placeholder="예: 소프트웨어학과"
                className="h-11"
                value={form.department}
                onChange={(event) => updateField("department", event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="birthday">생일</Label>
              <Input
                id="birthday"
                type="date"
                className="h-11"
                value={form.birthday}
                onChange={(event) => updateField("birthday", event.target.value)}
              />
            </div>

            {message && (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
                {message}
              </p>
            )}

            <div className="pt-2">
              <p className="mb-3 text-xs text-muted-foreground">
                현재는 학교 이메일 인증 없이 기본 정보만 저장합니다. 실제 인증과
                약관 동의는 추후 추가 예정입니다.
              </p>
              <Button className="h-11 w-full" type="submit" disabled={isSubmitting}>
                {isSubmitting ? "가입 중..." : "회원가입"}
              </Button>
            </div>
          </form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">
                또는 소셜로 가입
              </span>
            </div>
          </div>

          <div className="space-y-3">
            <Button variant="outline" className="h-11 w-full gap-3">
              Google로 가입
            </Button>
            <Button variant="outline" className="h-11 w-full gap-3">
              카카오로 가입
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

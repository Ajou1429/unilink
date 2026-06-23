import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GraduationCap } from "lucide-react";

const universities = [
  "서울대학교", "연세대학교", "고려대학교", "성균관대학교", "한양대학교",
  "중앙대학교", "경희대학교", "서강대학교", "이화여자대학교", "숙명여자대학교",
  "KAIST", "POSTECH", "UNIST", "GIST",
];

export default function SignupPage() {
  return (
    <div className="min-h-screen flex">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-primary flex-col justify-between p-12">
        <div className="flex items-center gap-2 text-white">
          <GraduationCap className="h-8 w-8" />
          <span className="text-2xl font-bold">UniLink</span>
        </div>
        <div className="text-white space-y-6">
          <h2 className="text-3xl font-bold leading-snug">
            대학 생활을<br />더 스마트하게
          </h2>
          {[
            "시간표 공유로 같은 수업 친구 찾기",
            "익명 게시판으로 자유로운 소통",
            "AI 학습 플랜으로 성적 향상",
            "학교 공식 데이터 연동",
          ].map((t) => (
            <div key={t} className="flex items-center gap-3 text-primary-foreground/90">
              <div className="h-2 w-2 rounded-full bg-white" />
              {t}
            </div>
          ))}
        </div>
        <p className="text-primary-foreground/60 text-sm">
          학교 이메일로 가입하면 재학생 인증이 자동으로 완료됩니다.
        </p>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-8 overflow-y-auto">
        <div className="w-full max-w-md py-8">
          <div className="lg:hidden flex items-center gap-2 text-primary mb-8">
            <GraduationCap className="h-6 w-6" />
            <span className="text-xl font-bold">UniLink</span>
          </div>

          <h1 className="text-2xl font-bold mb-2">회원가입</h1>
          <p className="text-muted-foreground mb-8">
            이미 계정이 있으신가요?{" "}
            <Link href="/login" className="text-primary font-medium hover:underline">
              로그인
            </Link>
          </p>

          <form className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">이름</Label>
                <Input id="name" placeholder="홍길동" className="h-11" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="studentId">학번</Label>
                <Input id="studentId" placeholder="20240001" className="h-11" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="university">대학교</Label>
              <Select>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="학교를 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  {universities.map((u) => (
                    <SelectItem key={u} value={u}>{u}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">학교 이메일</Label>
              <Input
                id="email"
                type="email"
                placeholder="student@university.ac.kr"
                className="h-11"
              />
              <p className="text-xs text-muted-foreground">학교 이메일로 가입하면 재학생 인증이 자동 완료됩니다.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">비밀번호</Label>
              <Input
                id="password"
                type="password"
                placeholder="8자 이상 입력하세요"
                className="h-11"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="passwordConfirm">비밀번호 확인</Label>
              <Input
                id="passwordConfirm"
                type="password"
                placeholder="비밀번호를 다시 입력하세요"
                className="h-11"
              />
            </div>

            <div className="pt-2">
              <p className="text-xs text-muted-foreground mb-3">
                가입하면{" "}
                <a href="#" className="text-primary hover:underline">이용약관</a>
                {" "}및{" "}
                <a href="#" className="text-primary hover:underline">개인정보처리방침</a>
                에 동의하는 것으로 간주됩니다.
              </p>
              <Link href="/dashboard">
                <Button className="w-full h-11">이메일 인증 후 가입하기</Button>
              </Link>
            </div>
          </form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">또는 소셜로 가입</span>
            </div>
          </div>

          <Button variant="outline" className="w-full h-11 gap-3">
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Google로 가입
          </Button>
        </div>
      </div>
    </div>
  );
}

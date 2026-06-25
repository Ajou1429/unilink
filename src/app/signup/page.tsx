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
  "서울대학교",
  "연세대학교",
  "고려대학교",
  "성균관대학교",
  "한양대학교",
  "중앙대학교",
  "경희대학교",
  "서강대학교",
  "이화여자대학교",
  "숙명여자대학교",
  "KAIST",
  "POSTECH",
  "UNIST",
  "GIST",
];

export default function SignupPage() {
  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex lg:w-1/2 bg-primary flex-col justify-between p-12">
        <div className="flex items-center gap-2 text-white">
          <GraduationCap className="h-8 w-8" />
          <span className="text-2xl font-bold">UniLink</span>
        </div>
        <div className="text-white space-y-6">
          <h2 className="text-3xl font-bold leading-snug">
            대학생활을
            <br />더 스마트하게
          </h2>
          {[
            "시간표 공유로 같은 수업 친구 찾기",
            "익명 게시판으로 자유로운 소통",
            "AI 학습 플랜으로 성적 관리",
            "학교 공식 데이터 연동 준비",
          ].map((t) => (
            <div key={t} className="flex items-center gap-3 text-primary-foreground/90">
              <div className="h-2 w-2 rounded-full bg-white" />
              {t}
            </div>
          ))}
        </div>
        <p className="text-primary-foreground/60 text-sm">
          학교 이메일로 가입하면 재학생 인증을 진행할 수 있습니다.
        </p>
      </div>

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
                <SelectTrigger className="h-11 w-full">
                  <SelectValue placeholder="학교를 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  {universities.map((u) => (
                    <SelectItem key={u} value={u}>
                      {u}
                    </SelectItem>
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
              <p className="text-xs text-muted-foreground">
                학교 이메일로 가입하면 재학생 인증이 가능합니다.
              </p>
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
                <a href="#" className="text-primary hover:underline">
                  이용약관
                </a>
                {" 및 "}
                <a href="#" className="text-primary hover:underline">
                  개인정보처리방침
                </a>
                에 동의하는 것으로 간주합니다.
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
              <span className="bg-background px-2 text-muted-foreground">
                또는 소셜로 가입
              </span>
            </div>
          </div>

          <Button variant="outline" className="w-full h-11 gap-3">
            Google로 가입
          </Button>
        </div>
      </div>
    </div>
  );
}

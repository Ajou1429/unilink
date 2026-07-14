"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AUTH_CHANGED_EVENT,
  getCurrentUser,
  type CurrentUser,
  updateDisplayName,
} from "@/lib/auth-storage";

export default function SettingsPage() {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    function syncUser() {
      const user = getCurrentUser();
      setCurrentUser(user);
      setDisplayName(user?.displayName || user?.username || "");
    }

    syncUser();
    window.addEventListener(AUTH_CHANGED_EVENT, syncUser);
    window.addEventListener("storage", syncUser);

    return () => {
      window.removeEventListener(AUTH_CHANGED_EVENT, syncUser);
      window.removeEventListener("storage", syncUser);
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage("");

    const result = await updateDisplayName(displayName);
    setIsSubmitting(false);
    setMessage(result.message);

    if (result.ok) {
      const user = getCurrentUser();
      setCurrentUser(user);
      setDisplayName(user?.displayName || "");
    }
  }

  const schoolLabel =
    currentUser && (currentUser.university || currentUser.department)
      ? `${currentUser.university} ${currentUser.department}`.trim()
      : "학교/학과 정보 없음";

  return (
    <div className="flex min-h-screen flex-col">
      <Header title="설정" />
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-6">
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle>프로필</CardTitle>
          </CardHeader>
          <CardContent>
            {currentUser ? (
              <form className="space-y-5" onSubmit={handleSubmit}>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="username">아이디</Label>
                    <Input
                      id="username"
                      className="h-11"
                      value={currentUser.username}
                      readOnly
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="displayName">사용자 이름</Label>
                    <Input
                      id="displayName"
                      className="h-11"
                      value={displayName}
                      maxLength={30}
                      onChange={(event) => setDisplayName(event.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="school">학교/학과</Label>
                  <Input id="school" className="h-11" value={schoolLabel} readOnly />
                </div>

                {message && (
                  <p
                    className={`rounded-md px-3 py-2 text-sm ${
                      message.includes("변경")
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-red-50 text-red-600"
                    }`}
                  >
                    {message}
                  </p>
                )}

                <div className="flex justify-end">
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "저장 중..." : "저장"}
                  </Button>
                </div>
              </form>
            ) : (
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm text-muted-foreground">
                  로그인 후 프로필을 수정할 수 있습니다.
                </p>
                <Button render={<Link href="/login" />}>로그인</Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

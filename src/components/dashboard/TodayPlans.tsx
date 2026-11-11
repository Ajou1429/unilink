"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSupabaseBrowserClient } from "@/lib/supabase-client";
import { getStorageUser } from "@/lib/private-storage";
import { flushP0Changes } from "@/lib/p0-sync";
import type { StudyPlan } from "@/lib/types";

type PlanItem = { id: string; title: string; scheduled_start: string | null; planned_minutes: number };

export function TodayPlans({ date, plans }: { date: string; plans: StudyPlan[] }) {
  const [items, setItems] = useState<PlanItem[]>([]);
  const [message, setMessage] = useState("계획을 불러오는 중입니다.");
  useEffect(() => {
    let active = true;
    async function load() {
      const db = getSupabaseBrowserClient();
      const user = db ? (await db.auth.getUser()).data.user : null;
      if (!db || !user || getStorageUser() !== user.id) {
        if (active) { setItems([]); setMessage(""); }
        return;
      }
      await flushP0Changes();
      const start = new Date(`${date}T00:00:00+09:00`);
      const end = new Date(start.getTime() + 86400000);
      const result = await db.from("study_plan_items")
        .select("id,title,scheduled_start,planned_minutes,study_plans!inner(source_type,status)")
        .eq("user_id", user.id).eq("study_plans.source_type", "ai")
        .in("study_plans.status", ["approved", "active", "completed"])
        .in("status", ["planned", "in_progress"])
        .gte("scheduled_start", start.toISOString()).lt("scheduled_start", end.toISOString()).order("scheduled_start");
      if (!active || getStorageUser() !== user.id) return;
      if (result.error) throw new Error("오늘의 AI 계획을 불러오지 못했습니다.");
      setItems(result.data ?? []); setMessage("");
    }
    void load().catch(() => { if (active) { setItems([]); setMessage("오늘의 AI 계획을 불러오지 못했습니다."); } });
    return () => { active = false; };
  }, [date, plans]);
  const time = (value: string) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
  const rows = [
    ...items.map((item) => ({ id: `ai-${item.id}`, title: item.title, label: `${item.scheduled_start ? time(item.scheduled_start) + " · " : ""}${item.planned_minutes}분` })),
    ...plans.filter((plan) => !plan.isCompleted && plan.dueDate.slice(0, 10) === date)
      .map((plan) => ({ id: `plan-${plan.id}`, title: plan.title, label: plan.courseName })),
  ];
  return <Card className="min-w-0 border-0 shadow-sm">
    <CardHeader className="pb-3"><CardTitle className="text-base">오늘 계획</CardTitle></CardHeader>
    <CardContent className="space-y-3">
      {rows.map((row) => <Link key={row.id} href="/study" className="block rounded-lg border bg-muted/30 p-3 hover:bg-accent/50">
        <p className="break-words text-sm font-medium">{row.title}</p><p className="mt-1 text-xs text-muted-foreground">{row.label}</p>
      </Link>)}
      {message && <p role="status" className="text-xs text-muted-foreground">{message}</p>}
      {!rows.length && !message && <p className="py-6 text-center text-sm text-muted-foreground">오늘 예정된 계획이 없어요.</p>}
    </CardContent>
  </Card>;
}

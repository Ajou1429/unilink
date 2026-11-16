"use client";

import { useRef, useState } from "react";
import { Check, CalendarPlus, Loader2, X } from "lucide-react";
import { approveAgentCalendar, createWorkflowGuard, type AgentPlan } from "@/lib/service-agent";
import { CoachingRequestPanel } from "@/components/coaching/CoachingRequestPanel";

export function ServiceWorkflowCard({ plan, owner, text, recordsReady, assertActive }: {
  plan: AgentPlan; owner: string; text: string; recordsReady: boolean; assertActive: () => void;
}) {
  const [actions] = useState(() => plan.calendar.map(draft => ({ id: crypto.randomUUID(), draft })));
  const [saved, setSaved] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const busyRef = useRef(false);
  const [error, setError] = useState("");
  const [cancelled, setCancelled] = useState(false);
  const [guard] = useState(() => createWorkflowGuard(owner, assertActive));
  const check = () => guard.assert();
  async function approve(id: string) {
    if (busyRef.current || saved.includes(id) || !recordsReady) return;
    busyRef.current = true; setBusy(id); setError("");
    try {
      check();
      await approveAgentCalendar(id, actions.find(a => a.id === id)!.draft, owner, check);
      check();
      setSaved(current => [...current, id]);
    } catch (e) { setError(e instanceof Error ? e.message : "저장하지 못했습니다."); }
    finally { busyRef.current = false; setBusy(null); }
  }
  const ready = recordsReady && actions.every(a => saved.includes(a.id));
  if (cancelled) return <p className="text-sm text-muted-foreground">남은 작업을 취소했습니다. 이미 저장된 기록은 유지됩니다.</p>;
  return <section aria-label="비서 작업 확인" className="space-y-3 border-l-2 border-primary pl-4">
    {!recordsReady && <p role="status" className="text-sm">앞선 학습 기록을 저장하거나 누락 정보를 확인한 뒤 이어갈 수 있습니다.</p>}
    {actions.map(({ id, draft }) => <div key={id} className="space-y-1 border-b pb-3 text-sm">
      <strong>{draft.title}</strong>
      <p className="text-muted-foreground">{draft.goal_title ?? "과목과 연결하지 않은 개인 일정"}</p>
      <p>{draft.kind === "assignment" ? "과제 마감" : draft.kind === "appointment" ? "일정" : "시험·퀴즈"} · {new Date((draft.due_at ?? draft.starts_at)!).toLocaleString("ko-KR")}{draft.ends_at && ` ~ ${new Date(draft.ends_at).toLocaleString("ko-KR")}`}</p>
      {draft.description && <p className="whitespace-pre-wrap break-words">{draft.description}</p>}
      {draft.exam_scope && <p>시험 범위: {draft.exam_scope}</p>}
      {saved.includes(id) ? <p className="flex items-center gap-1 text-green-700"><Check size={16} /> DB 저장 완료</p>
        : <button type="button" disabled={!!busy || !recordsReady} onClick={() => void approve(id)} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 disabled:opacity-50">
          {busy === id ? <Loader2 size={16} className="animate-spin" /> : <CalendarPlus size={16} />}확인하고 일정 추가
        </button>}
    </div>)}
    {plan.coaching && (ready
      ? <CoachingRequestPanel initialRequest={{ ...plan.coaching, requestNote: text }} assertActive={check} />
      : <p className="text-sm text-muted-foreground">선행 기록·일정 저장 후 계획 추천을 이어갑니다.</p>)}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <button type="button" disabled={!!busy} onClick={() => { guard.cancel(); setCancelled(true); }} className="inline-flex items-center gap-1 text-xs text-muted-foreground"><X size={14} />남은 작업 취소</button>
  </section>;
}

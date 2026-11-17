"use client";

import { ChatRequestDetails } from "./ChatRequestDetails";
import { conciseChatTitle } from "@/lib/chat-title";
import { useRef, useState } from "react";
import { CalendarPlus, Loader2, X } from "lucide-react";
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
  return <section aria-label="비서 작업 확인" className="space-y-3">
    {!recordsReady && <p role="status" className="text-sm">앞선 학습 기록을 저장하거나 누락 정보를 확인한 뒤 이어갈 수 있습니다.</p>}
    {recordsReady&&actions.map(({ id, draft }) => saved.includes(id)?<p key={id} className="text-sm">{conciseChatTitle(draft.title)??"일정"}을 등록했어요.</p>:<section key={id} aria-label="반영 전 일정 확인" className="space-y-4 rounded-2xl border bg-white p-5">
      <ChatRequestDetails details={{
        title:`${conciseChatTitle(draft.goal_title)??conciseChatTitle(draft.title)??"학습"} ${draft.kind==="assignment"?"과제 마감":draft.kind==="appointment"?"일정":"시험 일자"}`,
        content:[draft.description,draft.exam_scope?`시험 범위: ${draft.exam_scope}`:""].filter(Boolean),
        dates:[`${draft.kind==="assignment"?"마감":"일시"}: ${new Date((draft.due_at??draft.starts_at)!).toLocaleString("ko-KR")}${draft.ends_at?` ~ ${new Date(draft.ends_at).toLocaleString("ko-KR")}`:""}`],
      }}>
        <button type="button" disabled={!!busy || !recordsReady} onClick={() => void approve(id)} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm disabled:opacity-50">
          {busy === id ? <Loader2 size={16} className="animate-spin" /> : <CalendarPlus size={16} />}확인하고 일정 추가
        </button>
      </ChatRequestDetails>
    </section>)}
    {plan.coaching && (ready
      ? <CoachingRequestPanel initialRequest={{ ...plan.coaching, requestNote: text }} assertActive={check} />
      : <p className="text-sm text-muted-foreground">선행 기록·일정 저장 후 계획 추천을 이어갑니다.</p>)}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <button type="button" disabled={!!busy} onClick={() => { guard.cancel(); setCancelled(true); }} className="inline-flex items-center gap-1 text-xs text-muted-foreground"><X size={14} />남은 작업 취소</button>
  </section>;
}

"use client";

import { Loader2 } from "lucide-react";
import { ProposalTimetable } from "@/components/coaching/CoachingRequestPanel";
import type { PreparedCommand } from "@/lib/chat-command-executor";

export type CommandStatus = "preparing" | "needs_input" | "ready" | "running" | "done" | "cancelled" | "error";
export function ChatCommandCard({prepared,status,message,onDecision}:{prepared?:PreparedCommand;status:CommandStatus;message?:string;onDecision:(yes:boolean)=>void}) {
  const busy=status==="preparing"||status==="running";
  const canConfirm=!!prepared&&(status==="ready"||status==="error");
  return <section className="space-y-3 rounded-2xl border bg-white p-4" aria-label="채팅 요청 확인">
    <p className="flex items-center gap-2 font-medium">{busy&&<Loader2 className="h-4 w-4 animate-spin"/>}{busy?status==="preparing"?"요청을 준비하고 있어요":"확인한 요청을 실행하고 있어요":status==="done"?"실행 결과":status==="cancelled"?"취소했어요":status==="needs_input"?"한 가지만 더 알려주세요":"이 내용으로 진행할까요?"}</p>
    {prepared&&<ul className="space-y-1 text-sm">{prepared.summary.map((line,i)=><li key={i}>{line}</li>)}</ul>}
    {prepared?.proposal&&<div className="overflow-x-auto"><ProposalTimetable items={prepared.proposal.proposal.items} goals={prepared.goals??[]}/></div>}
    {prepared?.proposal&&<ul className="space-y-2 text-sm">{prepared.proposal.proposal.items.map((item,i)=><li key={i}><strong>{item.title}</strong>{item.completion_criteria&&<p>학습 범위: {item.completion_criteria.task_scope}<br/>완료 기준: {item.completion_criteria.observable_check}</p>}</li>)}</ul>}
    {message&&<p role={status==="error"?"alert":"status"} className="whitespace-pre-wrap text-sm">{message}</p>}
    {canConfirm&&<div className="flex gap-2"><button type="button" onClick={()=>onDecision(true)} className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground">예</button><button type="button" onClick={()=>onDecision(false)} className="rounded-lg border px-4 py-2 text-sm">아니오</button></div>}
    {status==="needs_input"&&<button type="button" onClick={()=>onDecision(false)} className="rounded-lg border px-3 py-1 text-sm">아니오, 취소</button>}
  </section>;
}

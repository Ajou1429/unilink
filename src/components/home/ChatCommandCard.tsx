"use client";

import { Loader2 } from "lucide-react";
import { ProposalTimetable } from "@/components/coaching/CoachingRequestPanel";
import type { PreparedCommand } from "@/lib/chat-command-executor";
import { commandDisplay } from "@/lib/chat-request-display";
import { ChatRequestDetails } from "./ChatRequestDetails";

export type CommandStatus = "preparing" | "needs_input" | "ready" | "running" | "done" | "cancelled" | "error";
export function ChatCommandCard({prepared,status,message,subjectTitle,courseName,resume,onResume,onDecision}:{prepared?:PreparedCommand;status:CommandStatus;message?:string;subjectTitle?:string;courseName?:string;resume?:boolean;onResume?:()=>void;onDecision:(yes:boolean)=>void}) {
  const busy=status==="preparing"||status==="running";
  // Only a complete, revalidated action about to be applied is a confirmation card.
  if(status!=="ready"||!prepared)return <div className="space-y-2 text-[15px] leading-relaxed">
    {busy?<p role="status" className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin"/>{status==="preparing"?"요청 내용을 확인하고 있어요.":prepared?.phase==="plan_analysis"?"강의자료를 확인하고 계획을 짜고 있어요.":"요청한 작업을 진행하고 있어요."}</p>:<p role={status==="error"?"alert":"status"} className="whitespace-pre-wrap">{message??(status==="cancelled"?"요청을 취소했어요.":"필요한 정보를 알려주세요.")}</p>}
    {resume&&onResume&&(status==="needs_input"||status==="error")&&<button type="button" className="text-sm underline underline-offset-4" onClick={onResume}>이전 요청 이어서 확인</button>}
    {status==="error"&&prepared&&<button type="button" className="text-sm underline underline-offset-4" onClick={()=>onDecision(true)}>다시 시도</button>}
  </div>;
  const details=commandDisplay(prepared.command,{courseName,subjectTitle,summary:prepared.summary,phase:prepared.phase});
  return <section className="space-y-4 overflow-hidden rounded-2xl border bg-white p-5 sm:p-6" aria-label="반영 전 요청 확인">
    <ChatRequestDetails details={details}>
      {prepared.proposal&&<div className="space-y-3 border-t pt-3">
        <div className="overflow-x-auto"><ProposalTimetable items={prepared.proposal.proposal.items} goals={prepared.goals??[]}/></div>
        <ul className="space-y-2 text-sm">{prepared.proposal.proposal.items.map((item,i)=><li key={i}><strong>{item.title}</strong>{item.completion_criteria&&<p>학습 범위: {item.completion_criteria.task_scope}<br/>완료 기준: {item.completion_criteria.observable_check}</p>}</li>)}</ul>
      </div>}
      <div className="flex items-center justify-between gap-3 border-t pt-3 text-sm"><p>{prepared.phase==="plan_analysis"?"자료 분석을 진행할까요?":prepared.phase==="approve_plan"?"이 계획을 저장할까요?":"이 내용으로 반영할까요?"}</p><div className="flex shrink-0 gap-2"><button type="button" onClick={()=>onDecision(true)} className="rounded-lg bg-primary px-4 py-2 text-primary-foreground">예</button><button type="button" onClick={()=>onDecision(false)} className="rounded-lg border px-4 py-2">아니오</button></div></div>
    </ChatRequestDetails>
  </section>;
}

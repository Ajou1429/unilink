"use client";

import { useState } from "react";
import { CHAT_FEATURES, type AssistantTool } from "../../../supabase/functions/_shared/chatAssistant";
import type { MyNote } from "@/lib/my-notes-storage";
import { captureStorageScope } from "@/lib/private-storage";
import { chatFeatureUrl } from "@/lib/chat-feature-url";
import { CoachingRequestPanel } from "@/components/coaching/CoachingRequestPanel";
import { NoteAnalysisPanel } from "@/components/notes/NoteAnalysisPanel";
import { NoteViewerDialog } from "@/components/notes/NoteViewerDialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Reuse real app workflows, including their validation/consent/approval controls. */
export function ChatFeatureCard({ tool, goalIds, request, notes, userId }: {
  tool: AssistantTool; goalIds: string[]; request: string; notes: MyNote[]; userId: string | null;
}) {
  const [open,setOpen]=useState(false),[url,setUrl]=useState("");
  const [error,setError]=useState("");
  const [noteId,setNoteId]=useState(tool.note_id??"");
  const [owner]=useState(()=>captureStorageScope(userId));
  const note=notes.find(n=>n.id===noteId);
  function execute() {
    try {
      owner();
      setUrl(chatFeatureUrl(tool,window.location.pathname.startsWith("/unilink/")?"/unilink":""));
      setOpen(true);
    } catch(e) { setError(e instanceof Error?e.message:"기능을 열지 못했어요."); }
  }
  return <section className="space-y-3 rounded-2xl border bg-white p-4" aria-label={CHAT_FEATURES[tool.feature].label}>
    <h3 className="font-semibold">{CHAT_FEATURES[tool.feature].label}</h3>
    {tool.feature==="study_plan" ? <>
      <p className="text-sm text-muted-foreground">대화의 요청과 과목을 추천 조건에 전달했어요. 가능한 시간과 자료 분석 동의를 확인한 뒤 계획을 생성하고, 마음에 들면 승인하세요. 직접 추가한 계획은 유지해요.</p>
      <CoachingRequestPanel initialRequest={{goal_ids:goalIds,requestNote:request,intent:tool.intent??"weekly_plan",daily_minutes:tool.daily_minutes??null,period_start:null,period_end:null,startHour:tool.start_hour,endHour:tool.end_hour}} />
    </> : tool.feature==="pdf_analysis" ? <>
      <p className="text-sm text-muted-foreground">분석할 PDF를 선택하세요. 파일 분류와 PDF 본문 분석은 별도이며, 아래에서 동의 후 분석을 실행해요.</p>
      <select aria-label="분석할 PDF" className="w-full rounded-lg border p-2 text-sm" value={noteId} onChange={e=>{try{owner();setNoteId(e.target.value);}catch{setError("계정이 변경됐어요. 다시 요청해 주세요.");}}}>
        <option value="">PDF 선택</option>
        {notes.filter(n=>n.fileName?.toLowerCase().endsWith(".pdf")).map(n=><option key={n.id} value={n.id}>{n.title}</option>)}
      </select>
      {note && <><NoteViewerDialog note={note} /><NoteAnalysisPanel key={note.id} note={note} /></>}
      {!notes.length && <p className="text-sm">먼저 강의 노트를 첨부하거나 나의 노트에서 PDF를 가져와 주세요.</p>}
    </> : <p className="text-sm text-muted-foreground">대화를 유지한 채 실제 기능 화면에서 조회·입력·실행할 수 있어요. 변경이나 삭제는 해당 화면에서 확인한 뒤 반영돼요.</p>}
    {tool.feature!=="study_plan" && <button type="button" className="rounded-lg border px-3 py-2 text-sm hover:bg-accent" onClick={execute}>실행 화면 열기</button>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="flex h-[90dvh] w-[96vw] max-w-none flex-col sm:max-w-[1200px]">
        <DialogHeader>
          <DialogTitle>{CHAT_FEATURES[tool.feature].label}</DialogTitle>
          <DialogDescription>{tool.feature==="drive" ? "인증 팝업이 필요한 Drive 연결은 전체 화면으로 열어 진행하세요." : "대화로 돌아오려면 이 창을 닫으세요. 실행 결과는 해당 기능에 저장됩니다."}</DialogDescription>
          <a className="text-sm underline" href={url} target="_blank" rel="noopener noreferrer">전체 화면으로 열기</a>
        </DialogHeader>
        {open && <iframe title={`${CHAT_FEATURES[tool.feature].label} 실행 화면`} src={url} className="min-h-0 w-full flex-1 rounded-xl border" />}
      </DialogContent>
    </Dialog>
  </section>;
}

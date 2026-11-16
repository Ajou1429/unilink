import type { ThreadItem } from "../components/home/ChatHome";
import type { IntakeRecord } from "./file-intake/settings";
import type { HistoryItem } from "./chat-history";

const statusNames:Record<string,string>={done:"실행 완료",cancelled:"취소",error:"오류",ready:"미확정 제안",needs_input:"추가 정보 대기",preparing:"준비 중 중단",running:"실행 결과 확인 필요",saved:"저장 완료",undone:"취소/되돌림",waiting:"미확정 기록",saving:"저장 결과 확인 필요",undoing:"되돌리기 결과 확인 필요"};
/** Explicit projection: never persist approval capabilities, rollback payloads, tokens, or PDF bytes. */
export function snapshotThread(thread:ThreadItem[],files:IntakeRecord[]=[]):HistoryItem[] {
  return thread.flatMap((item):HistoryItem[]=>{
    if(item.kind==="archive")return [item];
    if(item.kind==="user")return [{id:item.id,kind:"user",text:item.text,fileNames:item.fileNames}];
    if(item.kind==="assistant")return item.pending?[]:[{id:item.id,kind:"assistant",text:item.text}];
    if(item.kind==="notice")return [{id:item.id,kind:"archive",text:item.text}];
    if(item.kind==="consent")return [{id:item.id,kind:"archive",text:"AI 전송 동의 대기 중이던 요청입니다. 계속하려면 요청을 다시 입력해 주세요."}];
    if(item.kind==="command") {
      const p=item.prepared;
      const plan=p?.proposal?.proposal.items.map(row=>[
        `${row.planned_date} ${row.start_time} · ${row.planned_minutes}분 · ${row.title}`,
        row.reason,
        row.completion_criteria?`학습 범위: ${row.completion_criteria.task_scope}\n완료 기준: ${row.completion_criteria.observable_check}`:"",
      ].filter(Boolean).join("\n")).join("\n\n");
      const text=[`요청 내역 · ${statusNames[item.status]??item.status}`,item.command.title??item.source,...(p?.summary??[]),plan,item.message,
        !["done","cancelled"].includes(item.status)?"보관된 요청입니다. 실행 버튼은 복원하지 않아요. 필요하면 다시 요청해 주세요.":null].filter(Boolean).join("\n");
      return [{id:item.id,kind:"archive",text}];
    }
    if(item.kind==="records")return [{id:item.id,kind:"archive",text:item.entries.map(e=>[
      `학습 기록 · ${statusNames[e.status]??e.status}`,e.source,
      e.action.kind==="topic"?[e.action.topic,e.action.status,e.action.rating?`이해도 ${e.action.rating}/5`:null].filter(Boolean).join(" · "):
      e.action.kind==="session"?[e.action.date,e.action.progress_title,e.action.page_start?`${e.action.page_start}–${e.action.page_end??e.action.page_start}쪽`:null,e.action.difficulty,e.action.pace].filter(Boolean).join(" · "):
      `${e.action.problem_file??"문제"} · ${e.action.problem_labels.join(", ")} · 단계 ${e.action.problem_level??"미정"}`,
      e.error,
    ].filter(Boolean).join("\n")).join("\n\n")}];
    if (item.kind === "workflow") return [{ id: item.id, kind: "archive", text: [item.text, item.plan.reply, ...item.plan.calendar.map(row => row.title), "보관된 비서 요청입니다. 실행하려면 다시 요청해 주세요."].filter(Boolean).join("\n") }];
    if(item.kind==="tools")return [{id:item.id,kind:"archive",text:`기능 열기 요청: ${item.request}\n${item.tools.map(t=>t.feature).join(", ")}`}];
    return [{id:item.id,kind:"archive",text:item.recordIds.map(id=>{
      const file=files.find(f=>f.id===id);
      return file?[file.fileName,file.courseName,file.status==="done"?"첨부 처리 완료":file.status==="error"?"첨부 처리 실패":"처리 중 중단",file.message].filter(Boolean).join(" · "):"첨부 파일 처리 내역";
    }).join("\n")}];
  });
}

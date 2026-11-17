import { parseChatOutput, type ChatAction } from "../../supabase/functions/_shared/chatRecord";
import type { ChatContext } from "./chat-record/apply";
import { parseCommands, type ChatCommand } from "../../supabase/functions/_shared/chatCommands";
import type { HistoryItem } from "./chat-history";

export interface CommandDraft { version:1; command:ChatCommand; source:string; status:"ready"|"needs_input"|"preparing"; question?:string }
/** Only a declarative draft. No prepared payload, proposal/run ID, approval token or rollback data. */
export function readCommandDraft(value:unknown):CommandDraft|undefined {
  if(!value||typeof value!=="object")return;
  const d=value as Record<string,unknown>;
  if(d.version!==1||!["ready","needs_input","preparing"].includes(String(d.status))||typeof d.source!=="string"||d.source.length>4000||!d.command||typeof d.command!=="object")return;
  const raw=d.command as ChatCommand;
  const ids=[raw.course_id,...(Array.isArray(raw.course_ids)?raw.course_ids:[])].filter((id):id is string=>typeof id==="string");
  const command=parseCommands([raw],{courses:ids.map(id=>({id})),notes:typeof raw.note_id==="string"?[{id:raw.note_id}]:[]})[0];
  if(!command)return;
  return {version:1,command,source:d.source,status:d.status as CommandDraft["status"],...(typeof d.question==="string"?{question:d.question.slice(0,2000)}:{})};
}

/** Same context projection before and after reopening; saved outcomes are data, never instructions. */
export function conversationContext(items:HistoryItem[],limit=6):{role:"user"|"assistant";text:string}[] {
  const turns=items.flatMap(item=>{
    const text=[item.text,item.kind==="user"&&item.fileNames?.length?`첨부 자료: ${item.fileNames.join(", ")}`:"",
      item.draft?`미확정 요청 (저장되지 않음): ${JSON.stringify(item.draft.command)}`:"",
      item.recordDraft?`미확정 학습 기록: ${JSON.stringify(item.recordDraft.entries.map(e=>e.action))}`:""].filter(Boolean).join("\n");
    return text?[{role:item.kind==="user"?"user" as const:"assistant" as const,text:text.slice(0,3000)}]:[];
  });
  if(turns.length<=limit)return turns;
  // Preserve the original task and its attachment names alongside the latest turns.
  return [turns[0],...turns.slice(-(limit-1))];
}

export interface RecordDraft { version:1; entries:{action:ChatAction;source:string;requestId?:string;observedAt?:string;missing:"course"|"date"|"file"|null}[] }

export function validateRecordDraftAction(action:ChatAction, context:Pick<ChatContext,"courses"|"files">,today:string) {
  return parseChatOutput({actions:[action]},{message:"",history:[],today,
    courses:context.courses.map(c=>({id:c.id,name:c.name,code:c.courseCode??null,days:c.days.join(",")})),topics:[],
    problems:[...context.files].map(([course_id,files])=>({course_id,files})),
  }).actions[0];
}
export function readRecordDraft(value:unknown):RecordDraft|undefined {
  if(!value||typeof value!=="object")return;
  const d=value as Record<string,unknown>;
  if(d.version!==1||!Array.isArray(d.entries)||d.entries.length>10)return;
  const entries=d.entries.flatMap(row=>{
    if(!row||typeof row.source!=="string"||row.source.length>4000||!row.action||typeof row.action!=="object")return [];
    const a=row.action as ChatAction;
    const action=parseChatOutput({actions:[a]},{message:"",history:[],today:"9999-12-31",topics:[],
      courses:typeof a.course_id==="string"?[{id:a.course_id,name:"",code:null,days:""}]:[],
      problems:typeof a.course_id==="string"?[{course_id:a.course_id,files:[{file:a.problem_file??"draft",label:"",problems:Array.isArray(a.problem_labels)?a.problem_labels:[]}]}]:[],
    }).actions[0];
    if(!action)return [];
    const requestId=typeof row.requestId==="string"&&/^[0-9a-f-]{36}$/i.test(row.requestId)?row.requestId:undefined;
    const observedAt=typeof row.observedAt==="string"&&row.observedAt.length<=40&&Number.isFinite(Date.parse(row.observedAt))?row.observedAt:undefined;
    return [{action,source:row.source,requestId,observedAt,missing:["course","date","file"].includes(row.missing)?row.missing as "course"|"date"|"file":null}];
  });
  return entries.length?{version:1,entries}:undefined;
}

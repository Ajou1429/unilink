import { getSupabaseBrowserClient } from "./supabase-client";
import { captureStorageScope, privateStorage } from "./private-storage";
import { describeFunctionError } from "./supabase/function-error";
import { getMyNotes, type MyNote } from "./my-notes-storage";
import { getMonthlyEvents } from "./timetable-storage";
import { getWeeklyStudyPlans } from "./study-storage";
import type { IntakeRecord } from "./file-intake/settings";
import type { ChatContext } from "./chat-record/apply";
import type { AssistantResult } from "../../supabase/functions/_shared/chatAssistant";
import type { ChatCommand } from "../../supabase/functions/_shared/chatCommands";

const CONSENT_KEY="unilink:chat-assistant-consent:v2";
// Expanded metadata/tutoring scope requires fresh consent; do not reuse recorder consent.
export function getAssistantConsent(): "granted" | "declined" | null {
  const value=privateStorage.getItem(CONSENT_KEY);
  return value==="granted" || value==="declined"?value:null;
}
export function setAssistantConsent(value:"granted"|"declined") { privateStorage.setItem(CONSENT_KEY,value); }

/** Only metadata is sent. PDF bytes use the existing separate analysis consent. */
export async function converse(context: ChatContext, message: string, history: {role:"user"|"assistant";text:string}[], today: string, files: IntakeRecord[] = [], pendingCommand?: ChatCommand) {
  if(getAssistantConsent()!=="granted") throw new Error("대화와 기능 연결에 대한 AI 전송 동의가 필요해요.");
  const current=captureStorageScope(context.userId),db=getSupabaseBrowserClient();
  if(!db || !context.signedIn || !context.userId) throw new Error("로그인 후 AI와 대화할 수 있어요.");
  const allNotes=await getMyNotes(); current();
  const attached=new Set(files.map(f=>f.noteId));
  const notes=[...allNotes.filter(n=>attached.has(n.id)),...allNotes.filter(n=>!attached.has(n.id))].slice(0,40);
  const courseFor=(note:MyNote)=>context.courses.find(c=>c.id===note.linkedId || c.name===note.courseName)?.id??null;
  const [aiPlans,states,goals]=await Promise.all([
    db.from("study_plan_items").select("id,goal_id,title,scheduled_start,planned_minutes,status,study_plans!inner(source_type,status)")
      .eq("user_id",context.userId!).eq("study_plans.source_type","ai").in("study_plans.status",["approved","active","completed"])
      .in("status",["planned","in_progress","completed"]).gte("scheduled_start",`${today}T00:00:00+09:00`).order("scheduled_start").limit(8),
    context.goals.size ? db.from("topic_learning_states").select("topic_id,learning_status,self_rating,observed_at")
      .eq("user_id",context.userId!).in("goal_id",[...context.goals.values()]).order("observed_at",{ascending:false}).limit(12)
      : Promise.resolve({data:[],error:null}),
    db.from("learning_goals").select("id,title,goal_type").eq("user_id",context.userId).eq("status","active").limit(30),
  ]);
  current();
  const plans=getWeeklyStudyPlans().filter(p=>!p.isCompleted).slice(0,15);
  const overview=JSON.stringify({source:"본인 시간표·일정·수동 계획, 승인된 AI 계획 일부와 최근 자기보고 이해도. 전체 이력이나 PDF 본문은 포함하지 않음. unavailable은 조회 실패이며 기록 없음이 아님",
    approved_ai_plans:aiPlans.error?{unavailable:true}:aiPlans.data,
    active_goals:goals.error?{unavailable:true}:goals.data,
    reported_understanding:states.error?{unavailable:true}:states.data?.map(s=>({...s,topic:[...context.topics.values()].flat().find(t=>t.id===s.topic_id)?.title??"주제명 미확인"})),
    courses:context.courses.map(c=>({name:c.name,days:c.days,start:c.startTime,end:c.endTime})),
    upcoming_events:getMonthlyEvents().filter(e=>e.date>=today).slice(0,15).map(e=>({title:e.title,date:e.date,start:e.startTime,end:e.endTime})),
    manual_learning_plans:plans.map(p=>({id:p.id,title:p.title,date:p.dueDate,course:p.courseName}))});
  const result=await db.functions.invoke<{result:AssistantResult}>("chat-record",{body:{assistant_protocol:2,consent:true,message,history,today,pending_command:pendingCommand,
    courses:context.courses.map(c=>({id:c.id,name:c.name,code:c.courseCode??null,days:c.days.join(",")})),
    topics:[...context.topics].map(([course_id,topics])=>({course_id,titles:topics.map(t=>t.title)})),
    problems:[...context.files].map(([course_id,files])=>({course_id,files})),
    notes:notes.map(n=>({id:n.id,title:n.title,course_id:courseFor(n)})),
    files:files.filter(f=>f.status!=="processing").map(f=>({name:f.fileName,status:f.status,course_id:f.courseId??null,note_id:f.noteId??null})),overview}});
  current();
  if(result.error) throw new Error(await describeFunctionError(result.error,"대화 답변을 준비하지 못했어요."));
  if(!result.data?.result || result.data.result.protocol_version!==2) throw new Error("대화 서버를 최신 버전으로 업데이트해야 해요. 현재 예/아니오 확인 실행 프로토콜을 지원하지 않습니다.");
  return {result:result.data.result,notes};
}

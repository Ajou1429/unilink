import { chatDocumentContext, loadChatDocumentAnalysis, type ChatDocumentAnalysis } from "./chat-document-analysis";
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
import { belongsToCourse, matchMaterialCourse, requestedChapters, selectChapterMaterials } from "./chat-course-materials";

const CONSENT_KEY="unilink:chat-assistant-consent:v3";
const PREVIOUS_CONSENT_KEY="unilink:chat-assistant-consent:v2";
// Chat permission now includes needed PDF content analysis. Preserve prior opt-outs.
export function getAssistantConsent(): "granted" | "declined" | null {
  const value=privateStorage.getItem(CONSENT_KEY);
  if(value==="granted" || value==="declined")return value;
  return privateStorage.getItem(PREVIOUS_CONSENT_KEY)==="declined"?"declined":null;
}
export function setAssistantConsent(value:"granted"|"declined") { privateStorage.setItem(CONSENT_KEY,value); }

/** Reuse completed analysis excerpts when available. PDF transfer runs through note-analyze. */
export async function converse(context: ChatContext, message: string, history: {role:"user"|"assistant";text:string}[], today: string, files: IntakeRecord[] = [], pendingCommand?: ChatCommand, analysis?: ChatDocumentAnalysis, materialRequest = message) {
  if(getAssistantConsent()!=="granted") throw new Error("대화와 기능 연결에 대한 AI 전송 동의가 필요해요.");
  const current=captureStorageScope(context.userId),db=getSupabaseBrowserClient();
  if(!db || !context.signedIn || !context.userId) throw new Error("로그인 후 AI와 대화할 수 있어요.");
  const allNotes=await getMyNotes(); current();
  const attached=new Set([...files.map(f=>f.noteId),pendingCommand?.note_id]);
  const materialCourse = matchMaterialCourse(context.courses, materialRequest) ?? context.courses.find(c => c.id === pendingCommand?.course_id);
  const chapters = requestedChapters(materialRequest);
  const chapterMatches = materialCourse ? selectChapterMaterials(allNotes, materialCourse.id, chapters.slice(0, 5), materialRequest) : [];
  const notes = [...new Map([...chapterMatches.flatMap(group => group.candidates),
    ...allNotes.filter(n => attached.has(n.id) || n.id === analysis?.noteId),
    ...allNotes.filter(n => materialCourse && belongsToCourse(n, materialCourse.id)), ...allNotes].map(n => [n.id, n])).values()].slice(0, 40);
  if (!analysis) {
    const requested = allNotes.filter(note => [note.title, note.fileName].some(name => name && name.length >= 4 && message.normalize("NFC").includes(name.normalize("NFC"))));
    const attachedNotes = allNotes.filter(note => attached.has(note.id));
    const priorText = history.map(turn => turn.text).join("\n").normalize("NFC");
    const mentionedNotes = allNotes.filter(note => [note.title, note.fileName].some(name => name && name.length >= 4 && priorText.includes(name.normalize("NFC"))));
    const candidates = requested.length ? requested : attachedNotes.length ? attachedNotes : mentionedNotes;
    if (candidates.length === 1) analysis = await loadChatDocumentAnalysis(candidates[0], context.userId, current);
    current();
  }
  const courseFor=(note:MyNote)=>context.courses.find(c=>belongsToCourse(note,c.id))?.id??null;
  const [aiPlans,states,goals,assignments]=await Promise.all([
    db.from("study_plan_items").select("id,goal_id,title,scheduled_start,planned_minutes,status,study_plans!inner(source_type,status)")
      .eq("user_id",context.userId!).eq("study_plans.source_type","ai").in("study_plans.status",["approved","active","completed"])
      .in("status",["planned","in_progress","completed"]).gte("scheduled_start",`${today}T00:00:00+09:00`).order("scheduled_start").limit(8),
    context.goals.size ? db.from("topic_learning_states").select("topic_id,learning_status,self_rating,observed_at")
      .eq("user_id",context.userId!).in("goal_id",[...context.goals.values()]).order("observed_at",{ascending:false}).limit(12)
      : Promise.resolve({data:[],error:null}),
    db.from("learning_goals").select("id,title,goal_type").eq("user_id",context.userId).eq("status","active").limit(30),
    context.goals.size ? db.from("calendar_events").select("id,goal_id,title,due_at,status,event_type,updated_at")
      .eq("user_id",context.userId).in("goal_id",[...context.goals.values()]).in("event_type",["assignment","project"])
      .eq("status","scheduled").order("due_at",{ascending:false}).limit(40) : Promise.resolve({data:[],error:null}),
  ]);
  current();
  const plans=getWeeklyStudyPlans().filter(p=>!p.isCompleted).slice(0,15);
  const overview=JSON.stringify({material_course:materialCourse?.id, requested_chapters:chapters.slice(0,5), chapter_matches:chapterMatches.map(group=>({chapter:group.chapter, count:group.candidates.length, unavailable:group.unavailable})), document_analysis:chatDocumentContext(analysis,allNotes,message),source:"본인 시간표·일정·수동 계획, 승인된 AI 계획 일부와 최근 자기보고 이해도. 전체 이력이나 PDF 본문은 포함하지 않음. unavailable은 조회 실패이며 기록 없음이 아님",
    approved_ai_plans:aiPlans.error?{unavailable:true}:aiPlans.data,
    active_goals:goals.error?{unavailable:true}:goals.data?.filter(goal=>goal.goal_type==="personal"||[...context.goals.values()].includes(goal.id)),
    assignment_events:assignments.error?{unavailable:true}:assignments.data,
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
  return {result:result.data.result,notes,allNotes};
}

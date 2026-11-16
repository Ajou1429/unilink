import { getSupabaseBrowserClient } from "./supabase-client";
import { captureStorageScope, getStorageUser } from "./private-storage";
import { flushP0Changes } from "./p0-sync";
import { describeFunctionError } from "./supabase/function-error";
import { getMonthlyEvents, saveMonthlyEvents, getMaxCredits } from "./timetable-storage";
import { getAllStoredCourses, saveStoredCourses } from "./course-storage";
import { getPersonalStudies, savePersonalStudies } from "./personal-study-storage";
import { addWeeklyStudyPlan, getWeeklyStudyPlans, saveWeeklyStudyPlans } from "./study-storage";
import { getGradeRecords, saveGradeRecords, GRADE_OPTIONS, type GradeValue } from "./record-storage";
import { getCurrentAcademicTermLabel, parseAcademicTerm } from "./academic-term";
import { listProblems, listSubjects } from "./problem-bank-storage";
import { getDriveConnectionStatus, syncDriveFolder } from "./drive-connection";
import { courseKnowledgeEnabled, prepareCourseKnowledge, requestCourseKnowledge } from "./course-knowledge";
import { getMyNotes, type MyNote } from "./my-notes-storage";
import type { ChatCommand } from "../../supabase/functions/_shared/chatCommands.ts";
import type { ChatContext } from "./chat-record/apply";
import type { ChatCoachingResult } from "../components/coaching/CoachingRequestPanel";

type Db = NonNullable<ReturnType<typeof getSupabaseBrowserClient>>;
type Data = Record<string, unknown>;
export interface PreparedCommand {
  id: string; userId: string; command: ChatCommand; summary: string[]; expiresAt: number;
  phase: "write" | "plan_analysis" | "approve_plan";
  payload: Data; proposal?: ChatCoachingResult; goals?: {id:string;title:string}[];
}
export type Preparation = {question:string;command:ChatCommand} | {prepared:PreparedCommand};
export interface CommandResult { message: string; next?: PreparedCommand }
const jobs=new Map<string,Promise<CommandResult>>();
const running=new Set<string>();
const drafts=new Map<string,{value:PreparedCommand;owner:()=>void}>();
const dayName=["일","월","화","수","목","금","토"] as const;
const resultData = <T>(r:{data:T;error:unknown}):T=>{if(r.error)throw new Error((r.error as {message?:string}).message??"요청을 처리하지 못했어요.");return r.data;};
const iso=(date:string,time:string)=>new Date(`${date}T${time}:00`).toISOString();
const shift=(date:string,days:number)=>{const d=new Date(date+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);};
const frozen=<T>(value:T):T=>{if(value&&typeof value==="object"){Object.values(value).forEach(frozen);Object.freeze(value);}return value;};
function seal(value:PreparedCommand) {
  const prepared=frozen(value);
  drafts.set(value.id,{value:prepared,owner:captureStorageScope(value.userId)});
  for(const [id,entry] of drafts){const key=`${entry.value.userId}:${id}`;if(entry.value.expiresAt<Date.now()&&!running.has(key)){drafts.delete(id);jobs.delete(key);}}
  return prepared;
}
export function discardPreparedCommand(p:PreparedCommand) { if(drafts.get(p.id)?.value===p){drafts.delete(p.id);jobs.delete(`${p.userId}:${p.id}`);} }
export function discardChatDrafts() {drafts.clear();jobs.clear();running.clear();}
async function session(userId:string,check:()=>void){
  check();const db=getSupabaseBrowserClient();if(!db)throw new Error("로그인이 필요해요.");
  const user=(await db.auth.getUser()).data.user;check();
  if(!user||user.id!==userId||getStorageUser()!==userId)throw new Error("계정이 변경됐어요. 다시 요청해 주세요.");return db;
}
const question=(command:ChatCommand,text:string):Preparation=>({question:text,command});
function ready(command:ChatCommand,userId:string,summary:string[],payload:Data={},phase:PreparedCommand["phase"]="write",id=crypto.randomUUID()):Preparation {
  return {prepared:seal({id,userId,command:structuredClone(command),summary,expiresAt:Date.now()+5*60000,phase,payload})};
}

/** Only reads and prepares a preview; AI planning creates an unapproved proposal, never a plan. */
export async function prepareChatCommand(command:ChatCommand,ctx:ChatContext,notes:MyNote[],today:string,check:()=>void,requestText:string,recentNoteIds:string[]=[]):Promise<Preparation> {
  check();if(!ctx.userId||!ctx.signedIn)throw new Error("로그인 후 요청해 주세요.");
  const originalCheck=check,owner=captureStorageScope(ctx.userId);
  check=()=>{originalCheck();owner();};
  const uid=ctx.userId,id=crypto.randomUUID(),c=structuredClone(command);
  const course=ctx.courses.find(x=>x.id===c.course_id);
  if(c.course_id&&!course)return question(c,"어느 과목인지 다시 알려주시겠어요?");
  const needTitle=["add_event","add_task","add_goal","add_course","add_plan","add_grade"].includes(c.kind);
  if(needTitle&&!c.title)return question(c,"추가할 제목이나 과목 이름을 알려주세요.");
  if(["add_event","add_task","add_plan"].includes(c.kind)&&!c.date)return question(c,"몇 월 며칠에 추가할까요?");
  if(c.kind==="add_event"||c.kind==="add_task") {
    if(c.kind==="add_task"&&!course)return question(c,"어느 과목의 과제·시험인가요?");
    if(c.kind==="add_task"&&["assignment","project"].includes(c.event_type??"assignment")&&!c.start_time) { c.start_time="23:59"; c.all_day=false; }
    if(!c.all_day&&!c.start_time)return question(c,c.kind==="add_task"?"마감 또는 시험 시작 시각이 언제인가요?":"몇 시에 시작하나요?");
    const timed=c.kind==="add_event"||!["assignment","project"].includes(c.event_type??"assignment");
    if(timed&&!c.all_day&&(!c.end_time||c.end_time<=c.start_time!))return question(c,"종료 시각을 알려주세요. 시작 시각보다 뒤여야 해요.");
    const goal=course?ctx.goals.get(course.id):null;
    if(course&&!goal)throw new Error("과목 동기화 후 다시 요청해 주세요.");
    return ready(c,uid,[`${course?.name??"개인 일정"} · ${c.title}`,`${c.date} ${c.all_day?"종일":`${c.start_time}${timed?` ~ ${c.end_time}`:" 마감"}`}`,c.details??"",c.exam_scope?`시험 범위: ${c.exam_scope}`:""].filter(Boolean),{goalId:goal??null},"write",id);
  }
  if(c.kind==="add_goal")return ready(c,uid,[`개인 학습 목표: ${c.title}`,c.date?`목표일: ${c.date}`:"목표일 미지정",c.details??""].filter(Boolean),{},"write",id);
  if(c.kind==="add_plan")return ready(c,uid,[`${course?.name??"개인 학습"} · ${c.title}`,`수동 계획 · ${c.date}`,c.details??""].filter(Boolean),{},"write",id);
  if(c.kind==="add_course") {
    if(c.credits===null)return question(c,"몇 학점 수업인가요?");
    if(!c.weekdays.length||!c.start_time||!c.end_time||c.end_time<=c.start_time)return question(c,"매주 무슨 요일, 몇 시부터 몇 시까지 수업인가요?");
    c.term=c.term??getCurrentAcademicTermLabel();if(!parseAcademicTerm(c.term))return question(c,"학기를 알려주세요. 예: 2026년 2학기");
    const existing=getAllStoredCourses().filter(x=>x.term===c.term);
    if(existing.some(x=>x.name.replace(/\s/g,"")===c.title!.replace(/\s/g,"")))throw new Error("같은 학기에 이미 등록된 수업이에요.");
    if(existing.reduce((sum,x)=>sum+x.credits,0)+c.credits>getMaxCredits())throw new Error("설정한 최대 수강 학점을 넘어요. 학점 설정이나 수업을 확인해 주세요.");
    return ready(c,uid,[`${c.title} · ${c.credits}학점 · ${c.term}`,`${c.weekdays.map(d=>dayName[d]).join(", ")} ${c.start_time} ~ ${c.end_time}`,c.location??""].filter(Boolean),{},"write",id);
  }
  if(c.kind==="add_grade") {
    if(c.credits===null||!c.term||!GRADE_OPTIONS.includes(c.grade as GradeValue))return question(c,"학기·학점·성적을 알려주세요. 예: 2학년 2학기, 3학점, A+");
    return ready(c,uid,[`${c.title} · ${c.term}`,`${c.credits}학점 · ${c.grade}`,"현재 서비스의 성적 기록은 이 브라우저에 저장돼요."],{},"write",id);
  }
  const db=await session(uid,check);
  if(c.kind==="analyze_pdf"||c.kind==="classify_note") {
    const pdfs=notes.filter(n=>n.fileName?.toLowerCase().endsWith(".pdf"));
    const recent=pdfs.filter(n=>recentNoteIds.includes(n.id));
    const note=notes.find(n=>n.id===c.note_id)??(recent.length===1?recent[0]:pdfs.length===1?pdfs[0]:null);
    if(!note)return question(c,"어느 노트를 처리할까요? 파일명이나 제목을 알려주세요.");
    c.note_id=note.id;
    if(c.kind==="analyze_pdf"&&(!note.fileName?.toLowerCase().endsWith(".pdf")||(!note.filePath&&!note.driveFileId)))return question(c,"원본을 읽을 수 있는 PDF를 첨부해 주세요.");
    let linkedId:string|null=course?.id??null,linkedTitle=course?.name??"개인 학습";
    if(c.kind==="classify_note"&&c.goal_id&&!course) {
      const target=resultData(await db.from("learning_goals").select("id,title").eq("user_id",uid).eq("id",c.goal_id).eq("goal_type","personal").eq("status","active").single());check();
      if(!target)throw new Error("개인 학습 목표를 찾지 못했어요.");linkedId=target.id;linkedTitle=target.title;
    }
    if(c.kind==="classify_note"&&!course&&!c.goal_id&&!/개인|personal/i.test(requestText))return question(c,"어느 수업으로 분류할까요? 개인 학습으로 분류할 수도 있어요.");
    return ready(c,uid,[note.title,c.kind==="analyze_pdf"?"이 PDF 원문을 OpenAI에 전송해 강의 내용·과제·시험 후보를 분석해요. 일정은 자동 등록하지 않아요.":`${linkedTitle}으로 분류`],{noteVersion:note.version,noteUpdatedAt:note.updatedAt,linkedId,linkedTitle},"write",id);
  }
  if(c.kind==="set_problem_level") {
    if(!course||!c.labels.length||c.level===null)return question(c,"과목, 문항 번호와 수행 단계(0~5)를 알려주세요.");
    const subject=(await listSubjects()).find(s=>s.courseId===course.id);check();
    if(!subject)return question(c,"이 과목에 문제은행 자료가 없어요. 문제 PDF를 먼저 첨부해 주세요.");
    const rows=(await listProblems(subject.id)).filter(p=>c.labels.includes(p.label)&&(!c.source_file||p.sourceFile===c.source_file));check();
    if(c.labels.some(label=>rows.filter(p=>p.label===label).length!==1))return question(c,"문항 번호가 없거나 여러 파일에 있어요. 원본 파일명도 알려주세요.");
    return ready(c,uid,[`${course.name} · ${rows.map(r=>r.label).join(", ")}번`,`문항 수행 단계 ${c.level}/5로 변경`],{changes:rows.map(r=>({id:r.id,expected:r.updatedAt,level:c.level}))},"write",id);
  }
  if(c.kind==="sync_drive") {
    const status=await getDriveConnectionStatus();check();
    if(!status.connected||!status.folderId)return question(c,"Drive 연결과 동기화 폴더를 먼저 지정해 주세요. 인증은 Google 승인 화면이 필요해요.");
    return ready(c,uid,[`선택한 Drive 폴더: ${status.folderNames.join(", ")||"현재 연결 폴더"}`,"변경사항을 반영하고 원본 파일은 수정하거나 삭제하지 않아요."],{folderId:status.folderId,folderIds:JSON.stringify(status.folderIds)},"write",id);
  }
  if(c.kind==="complete_plan"||c.kind==="postpone_plan") {
    if(!c.target_id)return question(c,"어느 계획인가요? 계획 제목을 알려주세요.");
    const local=getWeeklyStudyPlans().find(p=>p.id===c.target_id);
    if(local) {
      if(c.kind==="postpone_plan")return question(c,"직접 추가한 계획은 AI가 이동하지 않아요. AI 계획인지 확인해 주세요.");
      return ready(c,uid,[`${local.title} · 완료로 표시`,"완료 표시를 이해도 점수로 바꾸지 않아요."],{localPlan:JSON.stringify(local)},"write",id);
    }
    const item=resultData(await db.from("study_plan_items").select("id,title,status,scheduled_start,updated_at,study_plans!inner(source_type,status)").eq("user_id",uid).eq("id",c.target_id).single());check();
    if(!item)throw new Error("해당 계획을 찾지 못했어요.");
    const parent=Array.isArray(item.study_plans)?item.study_plans[0]:item.study_plans;
    if(c.kind==="postpone_plan"&&parent?.source_type!=="ai")throw new Error("직접 추가한 계획은 이동하지 않아요.");
    return ready(c,uid,[item.title,c.kind==="complete_plan"?"완료로 표시": "다음날 같은 시각으로 미루기 · 충돌·마감이 있으면 거절돼요."],{expected:item.updated_at,start:item.scheduled_start},"write",id);
  }
  if(c.kind==="generate_plan") {
    let goalIds=[...new Set([c.course_id,...c.course_ids].filter((s):s is string=>!!s).map(s=>ctx.goals.get(s)).filter((s):s is string=>!!s))];
    if(c.goal_id)goalIds=[c.goal_id];
    if(!goalIds.length)return question(c,"어느 과목이나 학습 목표의 계획을 만들까요?");
    const goals=resultData(await db.from("learning_goals").select("id,title").eq("user_id",uid).eq("status","active").in("id",goalIds))??[];check();
    if(goals.length!==goalIds.length)throw new Error("활성 학습 목표를 다시 확인해 주세요.");
    // Missing availability is a proposal assumption, never a claimed user preference.
    const suggestedTimes=!c.start_time||!c.end_time||c.minutes===null;
    c.start_time=c.start_time??"09:00";
    c.end_time=c.end_time??"22:00";
    const duration=(value:string)=>Number(value.slice(0,2))*60+Number(value.slice(3));
    const windowMinutes=duration(c.end_time)-duration(c.start_time);
    if(windowMinutes<15)return question(c,"공부 시간대가 너무 짧거나 시작·종료 순서가 맞지 않아요. 사용할 시간대를 알려주세요.");
    c.minutes=c.minutes??Math.min(60,windowMinutes);
    c.intent=c.intent??"weekly_plan";c.date=c.date??today;c.period_end=c.period_end??shift(c.date,c.intent==="daily_plan"?0:c.intent==="exam_prep"?13:6);
    const length=Math.round((Date.parse(c.period_end)-Date.parse(c.date))/86400000)+1;
    if(length<1||length>14)return question(c,"실행 계획은 최대 14일까지 만들어요. 시작일과 종료일을 다시 알려주세요.");
    if(c.date<today)return question(c,"학습 계획은 오늘 이후로 만들어요. 시작일을 다시 알려주세요.");
    if(c.minutes>duration(c.end_time)-duration(c.start_time))return question(c,"순공시간이 가능한 시간대보다 길어요. 시간대나 분량을 조정해 주시겠어요?");
    const dailySources:{kind:string;id:string}[]=[];
    if(c.intent==="daily_plan") {
      const [events,plans]=await Promise.all([
        db.from("calendar_events").select("id,due_at,starts_at").eq("user_id",uid).in("goal_id",goalIds).eq("status","scheduled").in("event_type",["assignment","project","exam","quiz"]).limit(100),
        db.from("study_plan_items").select("id,scheduled_end").eq("user_id",uid).in("goal_id",goalIds).eq("status","planned").limit(100),
      ]);check();resultData(events);resultData(plans);
      const sources=[...(events.data??[]).map(e=>({kind:"event",id:e.id,at:e.due_at??e.starts_at??"9999"})),...(plans.data??[]).map(p=>({kind:"plan",id:p.id,at:p.scheduled_end??"9999"}))].sort((a,b)=>a.at.localeCompare(b.at));
      dailySources.push(...sources.slice(0,10).map(({kind,id})=>({kind,id})));
      if(!dailySources.length)return question(c,"이 과목에 진행 중인 과제나 기존 계획이 없어요. 오늘 새 학습을 할까요, 먼저 과제를 등록할까요?");
    }
    if(c.intent==="exam_prep"&&(!c.exam_scope||!c.exam_at||!c.priority||!c.difficulty))return question(c,"시험 범위·일시와 우선도/난이도(각 1~5)를 알려주세요.");
    if(c.intent==="exam_prep"&&goalIds.length>1)return question(c,"시험 범위와 일시가 과목마다 달라요. 먼저 어느 한 과목부터 준비할까요?");
    const request={request_key:id,goal_ids:goalIds,intent:c.intent,period_start:c.date,period_end:c.period_end,desired_outcome:"",constraints:[suggestedTimes?"미입력 시간 조건은 임시 추천값이며 사용자가 확인한 가용시간이 아니다. 기존 일정과 충돌하지 않는 범위에서 필요한 분량만 제안하고, 추천 시간은 저장 전 사용자가 확인한다.":"",c.details??"",requestText].join("\n").slice(0,1000),
      ...(c.intent==="daily_plan"?{daily_sources:dailySources}:{}),
      ...(c.intent==="exam_prep"?{exam_inputs:goalIds.map(goal_id=>({goal_id,scope:c.exam_scope!,exam_at:c.exam_at!,priority:c.priority!,difficulty:c.difficulty!}))}:{}),
      day_budgets:Array.from({length},(_,i)=>({date:shift(c.date!,i),minutes:c.minutes!,windows:[{start:c.start_time!,end:c.end_time!}]})),
      rules:{transition_minutes:10,break_minutes:10,break_after_minutes:90,method_minimums:{},max_focus_goals:Math.min(3,goalIds.length),carryover:true}};
    const summary=[`${goals.map(g=>g.title).join(", ")} · ${c.date} ~ ${c.period_end}`,`${suggestedTimes?"임시 추천 조건: ":""}${c.start_time} ~ ${c.end_time} 중 하루 최대 ${c.minutes}분`,"직접 추가한 계획은 유지해요."];
    const prepared=ready(c,uid,summary,{request,goalIds},"plan_analysis",id);
    if(!("prepared" in prepared))throw new Error("계획 요청을 확인하지 못했어요.");
    if(courseKnowledgeEnabled) {
      for(const goalId of goalIds) {
        const state=await requestCourseKnowledge(goalId,c.date,{action:"status"});check();
        if(state.pdf_count>0&&(state.pdf_count>state.pdf_ready||!state.overview_complete||!state.detail_complete))return {prepared:seal({...prepared.prepared,goals,summary:[...summary,"계획 전 이 과목 PDF 원문을 OpenAI에 전송해 분석할까요? 분석 후 실제 계획은 다시 보여드리고 저장 여부를 확인해요."]})};
      }
    }
    return {prepared:await generateProposal({...prepared.prepared,goals},false,check)};
  }
  throw new Error("이 요청의 직접 실행 방법을 확인하지 못했어요.");
}

async function generateProposal(p:PreparedCommand,consent:boolean,check:()=>void):Promise<PreparedCommand> {
  const db=await session(p.userId,check),request=p.payload.request as Record<string,unknown>;
  await flushP0Changes();check();
  await prepareCourseKnowledge(p.payload.goalIds as string[],String(request.period_start),p.userId,consent,false,()=>{check();},false,check);check();
  const response=await db.functions.invoke<ChatCoachingResult>("coaching-propose",{body:request});check();
  if(response.error)throw new Error(await describeFunctionError(response.error,"계획을 만들지 못했어요."));
  const result=response.data;
  if(!result||result.schema_version!==2||!result.proposal_run_id||!result.proposal?.items?.length||result.persisted!==false)throw new Error(result?.proposal?.summary??"확정 가능한 학습 시간이 없어요. 시간대나 분량을 조정해 주세요.");
  return seal({...p,id:crypto.randomUUID(),phase:"approve_plan",expiresAt:Date.now()+5*60000,payload:{runId:result.proposal_run_id},proposal:result,summary:[result.proposal.summary,...p.summary.filter(line=>line.startsWith("임시 추천 조건:")),"아래 실제 시간표를 학습 계획에 추가할까요?"]});
}

async function insertEvent(db:Db,p:PreparedCommand,check:()=>void) {
  const c=p.command;
  const assignment=c.kind==="add_task"&&["assignment","project"].includes(c.event_type??"assignment");
  const at=iso(c.date!,c.all_day?assignment?"23:59":"00:00":c.start_time!);
  if(c.kind==="add_event") {
    const events=getMonthlyEvents(),existing=events.find(e=>e.id===p.id);
    if(existing&&(existing.title!==c.title||existing.date!==c.date||existing.startTime!==(c.all_day?"00:00":c.start_time)||existing.endTime!==(c.all_day?"23:59":c.end_time)||existing.memo!==(c.details??"")||existing.location!==(c.location??"")||Boolean(existing.allDay)!==c.all_day))throw new Error("일정이 변경됐어요. 새로 확인해 주세요.");
    if(!existing)saveMonthlyEvents([...events,{id:p.id,title:c.title!,date:c.date!,startTime:c.all_day?"00:00":c.start_time!,endTime:c.all_day?"23:59":c.end_time!,location:c.location??"",memo:c.details??"",color:"#2563eb",createdAt:new Date().toISOString(),allDay:c.all_day}]);
    await flushP0Changes();check();return;
  }
  const end=c.all_day?iso(c.date!,"23:59"):c.end_time?iso(c.date!,c.end_time):null;
  // Projects use the existing course assignment category; appointments use "other".
  const eventType=assignment?"assignment":c.event_type==="appointment"?"other":c.event_type??"assignment";
  const value={id:p.id,user_id:p.userId,goal_id:p.payload.goalId??null,title:c.title!,event_type:eventType,description:c.details??"",exam_scope:c.exam_scope??"",
    due_at:assignment?at:null,starts_at:assignment?null:at,ends_at:assignment?null:end,is_blocking:!assignment&&!c.all_day,status:"scheduled",metadata:{schema_version:1,source:"chat-confirmed"}};
  const existing=resultData(await db.from("calendar_events").select("id,title,starts_at,due_at,ends_at,status,description,exam_scope,goal_id").eq("user_id",p.userId).eq("id",p.id).maybeSingle());check();
  const sameTime=(a:string|null,b:string|null)=>a===b||(a!==null&&b!==null&&Date.parse(a)===Date.parse(b));
  if(existing) {if(existing.title!==value.title||!sameTime(existing.starts_at,value.starts_at)||!sameTime(existing.due_at,value.due_at)||!sameTime(existing.ends_at,value.ends_at)||existing.status!==value.status||existing.description!==value.description||existing.exam_scope!==value.exam_scope||existing.goal_id!==value.goal_id)throw new Error("일정이 변경됐어요. 새로 확인해 주세요.");return;}
  resultData(await db.from("calendar_events").insert(value));check();
}

/** An unforgeable UI confirmation calls this once; retries keep the same IDs/request keys. */
export async function executePreparedCommand(p:PreparedCommand,check:()=>void):Promise<CommandResult> {
  const registered=drafts.get(p.id);
  if(registered?.value!==p)throw new Error("취소되었거나 유효하지 않은 확인 요청이에요.");
  const current=()=>{registered.owner();check();if(drafts.get(p.id)?.value!==p)throw new Error("취소된 확인 요청이에요.");};current();
  const key=`${p.userId}:${p.id}`;
  if(jobs.has(key)){const result=await jobs.get(key)!;current();return result;}
  if(Date.now()>p.expiresAt)throw new Error("확인 시간이 지났어요. 요청을 다시 알려주세요.");
  const job=(async():Promise<CommandResult>=>{
    const db=await session(p.userId,current),c=p.command;current();
    if(p.phase==="approve_plan") {
      await flushP0Changes();current();
      const saved=resultData(await db.rpc("approve_coaching_proposal",{p_run_id:p.payload.runId}));current();if(typeof saved!=="string")throw new Error("계획 저장 결과를 확인하지 못했어요.");return {message:"확인한 시간표를 학습 계획에 저장했어요."};
    }
    if(p.phase==="plan_analysis")return {message:"PDF 분석과 계획 제안을 준비했어요. 실제 계획을 확인해 주세요.",next:await generateProposal(p,true,current)};
    if(c.kind==="add_event"||c.kind==="add_task") {await insertEvent(db,p,current);return {message:`${c.title}을(를) ${c.kind==="add_task"?"수업 일정":"시간표"}에 등록했어요.`};}
    if(c.kind==="add_goal") {
      const goals=getPersonalStudies();
      const existing=goals.find(g=>g.id===p.id);if(existing&&(existing.title!==c.title||existing.goal!==(c.details??c.title)||existing.targetDate!==(c.date??undefined)))throw new Error("목표가 변경됐어요. 새로 확인해 주세요.");
      if(!goals.some(g=>g.id===p.id))savePersonalStudies([...goals,{id:p.id,title:c.title!,category:"개인 학습",goal:c.details??c.title!,targetDate:c.date??undefined,status:"active",color:"#2563eb",createdAt:new Date().toISOString()}]);
      await flushP0Changes();current();return {message:`개인 학습 목표 ‘${c.title}’을 추가했어요.`};
    }
    if(c.kind==="add_plan") {
      const course=getAllStoredCourses().find(x=>x.id===c.course_id);
      addWeeklyStudyPlan({id:p.id,title:c.title!,dueDate:c.date!,courseId:course?.id,courseName:course?.name,description:c.details??""});
      await flushP0Changes();current();return {message:`‘${c.title}’을 수동 학습 계획에 추가했어요.`};
    }
    if(c.kind==="add_course") {
      const courses=getAllStoredCourses();
      if(!courses.some(x=>x.id===p.id)) {
        const sameTerm=courses.filter(x=>x.term===c.term);
        if(sameTerm.some(x=>x.name===c.title)||sameTerm.reduce((sum,x)=>sum+x.credits,0)+c.credits!>getMaxCredits())throw new Error("수업이나 최대 학점이 변경됐어요. 다시 확인해 주세요.");
        const schedules=c.weekdays.map(d=>({day:dayName[d],startTime:c.start_time!,endTime:c.end_time!,location:c.location??""}));
        if(sameTerm.some(x=>(x.schedules??x.days.map(day=>({day,startTime:x.startTime,endTime:x.endTime}))).some(a=>schedules.some(b=>a.day===b.day&&a.startTime<b.endTime&&a.endTime>b.startTime))))throw new Error("수업 시간이 기존 수업과 겹쳐요.");
        saveStoredCourses([...courses,{id:p.id,name:c.title!,professor:"",location:c.location??"",color:"#2563eb",term:c.term!,credits:c.credits!,days:schedules.map(s=>s.day),startTime:c.start_time!,endTime:c.end_time!,schedules}]);
      }
      await flushP0Changes();current();return {message:`‘${c.title}’ 수업을 시간표에 추가했어요.`};
    }
    if(c.kind==="add_grade") {
      const rows=getGradeRecords();if(!rows.some(r=>r.id===p.id))saveGradeRecords([...rows,{id:p.id,term:c.term!,courseId:c.course_id??undefined,courseName:c.title!,credits:c.credits!,grade:c.grade as GradeValue,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}]);
      return {message:`${c.title} ${c.grade} 성적을 이 브라우저에 추가했어요.`};
    }
    if(c.kind==="analyze_pdf"||c.kind==="classify_note") {
      const note=(await getMyNotes()).find(n=>n.id===c.note_id);current();
      if(c.kind==="classify_note"&&note&&note.linkedType===(c.course_id?"course":"personal")&&(note.linkedId??null)===p.payload.linkedId)return {message:`‘${note.title}’은(는) 이미 ${p.payload.linkedTitle}으로 분류되어 있어요.`};
      if(!note||note.version!==p.payload.noteVersion||note.updatedAt!==p.payload.noteUpdatedAt)throw new Error("노트가 변경됐어요. 최신 노트로 다시 확인해 주세요.");
      if(c.kind==="analyze_pdf") {
        const r=await db.functions.invoke<{analysis_id:string}>("note-analyze",{body:{noteId:note.id,consent:true}});current();
        if(r.error)throw new Error(await describeFunctionError(r.error,"PDF 분석 요청에 실패했어요."));
        if(!r.data?.analysis_id)throw new Error("분석 요청 번호를 확인하지 못했어요.");
        for(let n=0;n<45;n++) {
          current();
          const a=resultData(await db.from("note_analyses").select("id,status,error_message,note_version,note_updated_at").eq("user_id",p.userId).eq("id",r.data.analysis_id).single());current();
          if(!a)throw new Error("분석 상태를 찾지 못했어요.");
          if(a.note_version!==note.version||a.note_updated_at!==note.updatedAt)throw new Error("분석 중 원본이 변경됐어요. 최신 자료를 다시 확인해 주세요.");
          if(a.status==="failed")throw new Error(a.error_message??"PDF를 분석하지 못했어요.");
          if(a.status==="completed") {
            const rows=resultData(await db.from("note_analysis_candidates").select("kind,title,date_text").eq("user_id",p.userId).eq("analysis_id",a.id).order("page"))??[];current();
            const sections=Object.entries({topic:"강의 내용",assignment:"과제",exam:"시험"}).flatMap(([kind,label])=>{
              const items=rows.filter(x=>x.kind===kind);return items.length?[label,...items.map(x=>`• ${x.title}${x.date_text?` · ${x.date_text}`:""}`)]:[];
            });
            return {message:`‘${note.title}’ 분석 완료\n${sections.join("\n")||"명확한 강의 내용·과제·시험 후보가 없어요."}\n아직 일정으로 등록하지 않았어요. 추가할 항목을 말씀해 주세요.`};
          }
          await new Promise(resolve=>setTimeout(resolve,3000));
        }
        return {message:`‘${note.title}’의 분석이 아직 진행 중이에요. 결과는 보존되며 나중에 다시 확인할 수 있어요. 완료된 것으로 표시하지 않았어요.`};
      }
      const course=getAllStoredCourses().find(x=>x.id===c.course_id);
      if(c.course_id&&!course)throw new Error("수업이 변경됐어요. 다시 확인해 주세요.");
      if(c.goal_id&&!course) {const goal=resultData(await db.from("learning_goals").select("id").eq("user_id",p.userId).eq("id",c.goal_id).eq("goal_type","personal").eq("status","active").single());current();if(!goal)throw new Error("개인 목표가 변경됐어요.");}
      const changed=await db.from("notes").update({linked_type:course?"course":"personal",linked_id:p.payload.linkedId,linked_title:p.payload.linkedTitle,course_name:p.payload.linkedTitle}).eq("user_id",p.userId).eq("id",note.id).eq("version",p.payload.noteVersion).eq("updated_at",p.payload.noteUpdatedAt).select("id");current();resultData(changed);
      if(!changed.data?.length)throw new Error("노트가 변경됐어요. 다시 확인해 주세요.");
      window.dispatchEvent(new Event("unilink:myNotesChanged"));return {message:`‘${note.title}’을 ${p.payload.linkedTitle}으로 분류했어요. 기존 문항 학습 기록은 유지했어요.`};
    }
    if(c.kind==="set_problem_level") {
      const changes=p.payload.changes as {id:string;level:number;expected:string}[];
      const currentRows=resultData(await db.from("problem_bank_problems").select("id,level").eq("user_id",p.userId).in("id",changes.map(x=>x.id)))??[];current();
      if(currentRows.length===changes.length&&currentRows.every(x=>x.level===c.level))return {message:`확인한 문항은 이미 요청한 수행 단계 ${c.level}/5로 기록되어 있어요.`};
      resultData(await db.rpc("set_chat_problem_levels",{p_changes:changes}));current();return {message:`확인한 문항 수행 단계를 ${c.level}/5로 저장했어요.`};
    }
    if(c.kind==="complete_plan") {
      if(p.payload.localPlan) {
        const plans=getWeeklyStudyPlans(),target=plans.find(x=>x.id===c.target_id);
        if(target?.isCompleted)return {message:"이 계획은 이미 완료로 표시되어 있어요."};
        if(!target||JSON.stringify(target)!==p.payload.localPlan)throw new Error("계획이 변경됐어요. 다시 확인해 주세요.");
        saveWeeklyStudyPlans(plans.map(x=>x.id===c.target_id?{...x,isCompleted:true}:x));await flushP0Changes();current();
      } else {
        const changed=await db.from("study_plan_items").update({status:"completed"}).eq("user_id",p.userId).eq("id",c.target_id!).eq("updated_at",p.payload.expected).select("id");current();resultData(changed);if(!changed.data?.length)throw new Error("계획이 변경됐어요. 다시 확인해 주세요.");
      }
      return {message:"계획을 완료로 표시했어요. 이해도 점수는 변경하지 않았어요."};
    }
    if(c.kind==="postpone_plan") {const moved=resultData(await db.rpc("postpone_coaching_plan_item",{p_item:c.target_id,p_expected_start:p.payload.start,p_request:p.id}));current();if(moved!==c.target_id)throw new Error("계획 이동 결과를 확인하지 못했어요.");return {message:"확인한 AI 계획을 다음날 같은 시각으로 한 번 미뤘어요."};}
    if(c.kind==="sync_drive") {
      const status=await getDriveConnectionStatus();current();if(!status.connected||status.folderId!==p.payload.folderId||JSON.stringify(status.folderIds)!==p.payload.folderIds)throw new Error("Drive 연결이나 선택 폴더가 변경됐어요. 다시 확인해 주세요.");
      await syncDriveFolder();current();return {message:"선택한 Drive 폴더의 변경사항을 반영했어요. 원본 파일은 변경하지 않았어요."};
    }
    throw new Error("지원하지 않는 실행 요청이에요.");
  })();
  jobs.set(key,job);
  running.add(key);
  try {const result=await job;current();return result;}catch(error){jobs.delete(key);throw error;}finally{running.delete(key);}
}

export function parseConfirmation(text:string):"yes"|"no"|null {
  const value=text.trim().replace(/[,.!?。\s]/g,"").toLowerCase();
  if(["예","네","응","좋아","좋아요","확인","진행해","진행해줘","진행해주세요","추가해줘","저장해줘","네해줘","네해주세요","yes","y"].includes(value))return "yes";
  if(["아니오","아니요","아니","취소","취소해줘","안할래","no","n"].includes(value))return "no";
  return null;
}

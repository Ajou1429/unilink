import type { ChatCommand } from "../../supabase/functions/_shared/chatCommands";
import { conciseChatTitle } from "./chat-title";

export interface RequestDisplay { title: string; content: string[]; dates: string[] }
const labels: Record<ChatCommand["kind"], string> = {
  add_event:"일정", add_task:"과제 마감", add_goal:"학습 목표", add_course:"수업 등록", add_plan:"학습 계획",
  generate_plan:"계획 추천", analyze_pdf:"자료 분석", classify_note:"노트 분류", set_problem_level:"문제 학습 기록",
  complete_plan:"계획 완료", complete_task:"과제 완료", postpone_plan:"계획 일정 변경", sync_drive:"Drive 동기화", add_grade:"성적 등록",
};
const unique = (lines: string[]) => [...new Set(lines.map(s=>s.normalize("NFC").trim()).filter(Boolean))];
const noun = (value?: string | null) => conciseChatTitle(value);
function bullets(value?: string | null) {
  return (value??"").split(/\n+|;\s*|\.\s+(?=[가-힣A-Z])/).map(s=>s.replace(/^\s*[-•*]\s*/,"").trim()).filter(Boolean);
}
/** Build the preview from validated fields, never from the user's instruction sentence. */
export function commandDisplay(command: ChatCommand, options: {courseName?:string;subjectTitle?:string;summary?:string[];phase?:string}={}): RequestDisplay {
  const c=command, subject=noun(options.courseName)??(c.course_id?noun(options.summary?.[0]?.split(" · ")[0]):undefined)??(options.subjectTitle!=="학습 요청"?noun(options.subjectTitle):undefined), name=noun(c.title);
  const kind=c.kind==="add_task"&&["exam","quiz"].includes(c.event_type??"")?"시험 일자":(labels[c.kind]??"학습 요청");
  const headingSubject=["add_goal","add_course","add_plan","add_event","add_grade"].includes(c.kind)?name??subject:subject??name;
  const title=headingSubject?`${headingSubject.replace(new RegExp(`\\s*${kind}$`),"")} ${kind}`:kind;
  const content:string[]=[],dates:string[]=[];
  if(name&&name!==subject&&name!==kind)content.push(`${c.kind==="add_task"?"항목":"주제"}: ${name}`);
  content.push(...bullets(c.details));
  if(c.exam_scope)content.push(`시험 범위: ${c.exam_scope}`);
  if(c.location)content.push(`장소: ${c.location}`);
  if(c.credits!==null&&c.credits!==undefined)content.push(`학점: ${c.credits}`);
  if(c.grade)content.push(`성적: ${c.grade}`);
  if(c.labels?.length)content.push(`문항: ${c.labels.join(", ")}`);
  if(c.level!==null&&c.level!==undefined)content.push(`학습 단계: ${c.level}`);
  if(c.kind==="generate_plan") {
    content.push("직접 추가한 계획 유지");
    if(c.minutes)dates.push(`하루 순공시간: ${c.minutes}분`);
    if(options.phase==="plan_analysis")content.push("PDF 원문을 OpenAI에 전송해 분석", "분석 후 추천 계획을 확인하고 별도로 저장 승인");
  }
  if(c.kind==="analyze_pdf")content.push("선택한 PDF 원문을 OpenAI에 전송해 분석");
  if(c.kind==="classify_note")content.push(`분류: ${options.courseName??"개인 학습"}`);
  if(c.kind==="sync_drive")content.push("이미 선택한 Drive 폴더의 변경사항 반영");
  if(c.date) {
    const deadline=c.kind==="add_task"&&!["exam","quiz"].includes(c.event_type??"");
    const classWindow=options.summary?.some(line=>line.startsWith("시간표상 수업 시간대입니다."));
    dates.push(`${classWindow?"수업 시간대":deadline?"마감":"일시"}: ${c.date}${c.period_end&&c.period_end!==c.date?` ~ ${c.period_end}`:""}${c.all_day?" · 종일":c.start_time?` · ${c.start_time}${c.end_time?`–${c.end_time}`:""}`:""}`);
    if(c.start_time&&c.end_time&&!classWindow) {
      const minutes=(s:string)=>Number(s.slice(0,2))*60+Number(s.slice(3));
      const duration=minutes(c.end_time)-minutes(c.start_time);
      if(duration>0&&c.kind!=="generate_plan")dates.push(`소요 시간: ${duration>=60?`${Math.floor(duration/60)}시간 `:""}${duration%60?`${duration%60}분`:""}`.trim());
    }
  }
  if(c.term)dates.push(`학기: ${c.term}`);
  if(c.weekdays?.length)dates.push(`반복: ${c.weekdays.map(d=>["일","월","화","수","목","금","토"][d]).join("·")}요일${c.start_time?` ${c.start_time}–${c.end_time??""}`:""}`);
  // Preserve preparation-specific disclosures not represented by fields (e.g. temporary availability).
  content.push(...(options.summary??[]).filter(s=>/브라우저에 저장|^시간표상 수업 시간대입니다\./.test(s)));
  dates.push(...(options.summary??[]).filter(s=>s.startsWith("임시 추천 조건:")));
  if(!content.length)content.push(`${kind} ${c.kind==="generate_plan"?"생성":"반영"}`);
  return {title,content:unique(content),dates:unique(dates)};
}
export function readRequestDisplay(value: unknown): RequestDisplay | undefined {
  if(!value||typeof value!=="object")return;
  const r=value as Record<string,unknown>, title=noun(typeof r.title==="string"?r.title:undefined);
  if(!title||!Array.isArray(r.content)||!Array.isArray(r.dates))return;
  const strings=(v:unknown[])=>v.length<=60&&v.every(s=>typeof s==="string"&&s.length<=4000);
  if(!strings(r.content)||!strings(r.dates))return;
  return {title,content:unique(r.content as string[]),dates:unique(r.dates as string[])};
}
/** Compatibility for saved pre-layout text. It is rendered as chat, never executable. */
export function requestDisplay(title: string | undefined, lines: string[]): RequestDisplay {
  const content:string[]=[],dates:string[]=[];
  for(const line of unique(lines.flatMap(s=>s.split("\n")))) {
    if(line===title)continue;
    if(/^(?:(?:마감|일시|목표일|기간|수동 계획)[:·]?\s*)?\d{4}-\d{2}-\d{2}/.test(line))dates.push(line);
    else content.push(line);
  }
  return {title:noun(title)??"학습 요청",content,dates};
}
export function archivedRequestDisplay(text:string,subjectTitle?:string) {
  const lines=text.split("\n");if(!lines[0]?.startsWith("요청 내역 · "))return null;
  const status=lines.shift()!.slice("요청 내역 · ".length),title=lines.shift();
  return requestDisplay(noun(title)??subjectTitle,[...(!noun(title)&&title?[title]:[]),...(status==="실행 완료"?[]:[status]),...lines]);
}

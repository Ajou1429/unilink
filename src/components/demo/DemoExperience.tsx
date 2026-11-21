"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { demoChat, type DemoQuota } from "@/lib/demo-chat";
import type { DemoResult } from "../../../supabase/functions/_shared/demoChat";
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  Check,
  FileText,
  GraduationCap,
  MessageSquare,
  RotateCcw,
  Sparkles,
  Target,
} from "lucide-react";
import { Header } from "@/components/layout/Header";
import {
  privateStorage,
  PRIVATE_STORAGE_CHANGED_EVENT,
} from "@/lib/private-storage";
import { resetDemoData } from "@/lib/demo-data";
import { getWeeklyStudyPlans, saveWeeklyStudyPlans } from "@/lib/study-storage";
import { getMonthlyEvents, saveMonthlyEvents } from "@/lib/timetable-storage";
import {
  getPersonalStudies,
  savePersonalStudies,
} from "@/lib/personal-study-storage";
import { getCurrentAcademicTermLabel } from "@/lib/academic-term";

const features = [
  {
    id: "chat",
    title: "AI 대화",
    icon: MessageSquare,
    href: "/dashboard",
    subtitle: "말로 요청하고, 확인 후 반영해요",
    details: [
      "일상 대화와 친절한 학습 질문 답변",
      "파일 첨부·붙여넣기·드래그로 분석 요청",
      "과제·시험·목표·계획을 확인 카드로 승인",
      "대화 기록과 진행하던 작업 이어가기",
    ],
  },
  {
    id: "course",
    title: "내 수업",
    icon: GraduationCap,
    href: "/course?courseId=1",
    subtitle: "수업 자료와 해야 할 일을 한곳에",
    details: [
      "시간표 수업 추가와 수업 페이지 연결",
      "강의노트·주제·진도와 이해도 관리",
      "과제·시험의 범위·마감·상세 내용 수정",
      "완료 과제와 지난 시험 별도 확인",
    ],
  },
  {
    id: "notes",
    title: "강의노트",
    icon: FileText,
    href: "/notes",
    subtitle: "흩어진 자료를 연결하고 분류해요",
    details: [
      "샘플 PDF 미리보기와 강의노트 관리",
      "서비스에서 파일 업로드와 수업 자동 분류",
      "파일 검색과 개인 학습으로 분류 변경",
      "자료 분석으로 주제·일정·문제 후보 확인",
    ],
  },
  {
    id: "coaching",
    title: "AI 학습코칭",
    icon: Sparkles,
    href: "/ai-coaching",
    subtitle: "목표에서 실행 가능한 계획까지",
    details: [
      "이번 주·오늘·시험 대비·단원 복습 요청",
      "선호 시간과 하루 순공시간 설정",
      "수업·기존 수동 계획·휴식·이동 고려",
      "시간표로 추천 확인 후 학습 계획에 반영",
    ],
  },
  {
    id: "timetable",
    title: "시간표 · 일정",
    icon: CalendarDays,
    href: "/timetable",
    subtitle: "수업과 마감을 놓치지 않도록",
    details: [
      "아주대 수업 검색과 직접 수업 추가",
      "시간 칸 클릭으로 기타 일정 추가",
      "수업 클릭으로 해당 수업 페이지 이동",
      "일반 일정의 주간·월간 표시와 겹침 분할",
    ],
  },
  {
    id: "problems",
    title: "문제은행",
    icon: BookOpen,
    href: "/problem-bank",
    subtitle: "자료 속 문제를 나만의 문제은행으로",
    details: [
      "PDF·강의노트에서 문제 추출과 분석",
      "과목·파일별 문항과 원문 확인",
      "문항 이해도와 학습 수준 기록",
      "취약한 문제를 복습·계획에 활용",
    ],
  },
  {
    id: "study",
    title: "학습 계획 · 목표",
    icon: Target,
    href: "/study",
    subtitle: "추천을 실제 공부로 이어가요",
    details: [
      "주간 계획과 월간 목표 관리",
      "수동 계획 추가·완료·이월",
      "개인 학습 목표·노트·자료·마감 관리",
      "계획별 할 일과 완료 기준 확인",
    ],
  },
  {
    id: "records",
    title: "성적 · 설정",
    icon: FileText,
    href: "/records",
    subtitle: "학기 기록과 학습 환경까지",
    details: [
      "과목별 성적·학점과 전공 평점 관리",
      "재수강 예상 성적과 졸업 학점 계산",
      "자격증·어학·활동 스펙 기록",
      "설정에서 계정·알림 환경 관리",
    ],
  },
] as const;
type FeatureId = (typeof features)[number]["id"];
type Message = { role: "user" | "assistant"; text: string };
type DemoState = {
  visited: FeatureId[];
  messages: Message[];
  analyzed: boolean;
  approved: boolean;
  eventAdded: boolean;
  classified: boolean;
  understanding: number;
};
const initial: DemoState = {
  visited: ["chat"],
  messages: [
    {
      role: "assistant",
      text: "안녕하세요! 실제 AI와 학습 질문, 일정 등록, 계획 추천을 체험해 보세요. 변경은 확인 후 데모에만 반영하며 계획 생성은 하루 3회예요.",
    },
  ],
  analyzed: false,
  approved: false,
  eventAdded: false,
  classified: false,
  understanding: 0,
};
const STATE_KEY = "unilink:public-demo";
const button =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium transition hover:border-indigo-400 hover:bg-indigo-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50";
const primary = `${button} !border-indigo-600 !bg-indigo-600 !text-white hover:!bg-indigo-700`;
const pdf = `${process.env.NODE_ENV === "production" ? "/unilink" : ""}/demo/operating-systems.pdf`;
function readState(): DemoState {
  try {
    return {
      ...initial,
      ...JSON.parse(privateStorage.getItem(STATE_KEY) || "{}"),
    };
  } catch {
    return initial;
  }
}
function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <h3 className="mb-5 text-lg font-bold text-slate-900">{title}</h3>
      {children}
    </section>
  );
}

export function DemoExperience() {
  const [active, setActive] = useState<FeatureId>("chat");
  const [state, setState] = useState(readState);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState<DemoResult | null>(null);
  const [quota, setQuota] = useState<DemoQuota | null>(null);
  const [busy, setBusy] = useState(false);
  const requestLock = useRef(false);
  const generation = useRef(0);
  const messageList = useRef<HTMLDivElement>(null);
  useEffect(() => { const list = messageList.current; if (list) list.scrollTop = list.scrollHeight; }, [state.messages]);
  useEffect(() => { let active = true; demoChat({ status: true }).then(data => { if (active) setQuota(data.quota); }).catch(() => {}); return () => { active = false; }; }, []);
  const [notice, setNotice] = useState("");
  const [preview, setPreview] = useState(false);
  const [mode, setMode] = useState("이번 주 계획");
  const [minutes, setMinutes] = useState("90");
  const [preferred, setPreferred] = useState("오후 15:00–18:00");
  const [proposal, setProposal] = useState(false);
  const [goal, setGoal] = useState("영어 자격시험 준비");
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState(false);
  const [, refresh] = useState(0);
  useEffect(() => {
    privateStorage.setItem(STATE_KEY, JSON.stringify(state));
  }, [state]);
  useEffect(() => {
    const changed = (event: Event) => {
      if ((event as CustomEvent<{ key: string }>).detail?.key !== STATE_KEY)
        refresh((value) => value + 1);
    };
    window.addEventListener(PRIVATE_STORAGE_CHANGED_EVENT, changed);
    return () =>
      window.removeEventListener(PRIVATE_STORAGE_CHANGED_EVENT, changed);
  }, []);
  const feature = features.find((item) => item.id === active)!;
  function update(patch: Partial<DemoState>) {
    setState((previous) => ({ ...previous, ...patch }));
  }
  function visit(id: FeatureId) {
    setActive(id);
    setNotice("");
    if (!state.visited.includes(id))
      update({ visited: [...state.visited, id] });
  }
  async function request(text: string) {
    if (!text.trim() || requestLock.current) return;
    if (/^(예|네|응|승인|저장|반영)[.!\s]*$/.test(text.trim()) && pending) { approvePending(); setInput(""); return; }
    if (/^(아니오|아니|취소)[.!\s]*$/.test(text.trim()) && pending) { setPending(null); setInput(""); setNotice("반영하지 않았어요."); return; }
    requestLock.current = true;
    setBusy(true);
    setPending(null);
    setNotice("");
    setInput("");
    const turn = generation.current;
    const messages: Message[] = [...state.messages, { role: "user", text }];
    update({ messages });
    try {
      const data = await demoChat({ message: text, history: state.messages.slice(-8).map(message => ({ ...message, text: message.text.slice(0, 1000) })), context: {
        courses: ["운영체제", "데이터베이스"],
        plans: getWeeklyStudyPlans().slice(0, 10).map(p => ({ id: p.id, title: p.title, courseName: p.courseName, dueDate: p.dueDate, description: p.description.slice(0, 400), isCompleted: p.isCompleted })),
        events: getMonthlyEvents().slice(0, 10).map(e => ({ id: e.id, title: e.title, date: e.date, startTime: e.startTime, endTime: e.endTime, memo: e.memo?.slice(0, 400) })),
        sampleNote: "교착상태.pdf: 상호 배제, 점유와 대기, 비선점, 순환 대기. 예방은 조건을 제거하고 회피는 안전 상태를 유지한다.",
        mode, netMinutes: Number(minutes), preferred,
      }});
      if (generation.current !== turn) return;
      setQuota(data.quota);
      const result = data.result;
      if (!result) throw new Error("AI 응답을 확인하지 못했습니다.");
      update({ messages: [...messages, { role: "assistant", text: result.reply }] });
      if (result.action === "navigate") visit(result.target as FeatureId);
      else if (result.action !== "reply") { setPending(result); if (result.action === "plan") { setProposal(true); visit("chat"); } }
    } catch (error) {
      if (generation.current !== turn) return;
      update({ messages: [...messages, { role: "assistant", text: error instanceof Error ? error.message : "대화를 처리하지 못했습니다." }] });
      demoChat({ status: true }).then(data => setQuota(data.quota)).catch(() => {});
    } finally { requestLock.current = false; setBusy(false); }
  }
  function approvePending() {
    if (!pending) return;
    if (pending.action === "plan") { approvePlan(); return; }
    if (pending.action === "event") { approveEvent(); return; }
    if (pending.action === "classify") classify();
    else if (pending.action === "complete_plan") {
      const plans = getWeeklyStudyPlans();
      if (!plans.some(p => p.id === pending.target)) { setNotice("완료할 계획을 찾지 못했어요. 계획 이름을 다시 알려주세요."); return; }
      saveWeeklyStudyPlans(plans.map(p => p.id === pending.target ? { ...p, isCompleted: true } : p));
    } else if (pending.action === "goal") {
      savePersonalStudies([...getPersonalStudies(), { id: `demo-chat-goal-${Date.now()}`, title: pending.title, category: "기타", goal: pending.details.join("\n"), color: "#4F46E5", createdAt: new Date().toISOString() }]);
    }
    setPending(null);
    setNotice("확인한 내용을 데모에 반영했어요.");
  }
  function approvePlan() {
    const existing = getWeeklyStudyPlans();
    if (!pending || pending.action !== "plan") return;
    const next = pending.plans.map((item, index) => ({
      id: `demo-recommendation-${Date.now()}-${index}`, userId: "demo",
      courseId: item.course.includes("데이터베이스") ? "2" : "1", courseName: item.course,
      week: 1, title: item.title, description: `${item.time} · ${item.minutes}분 · ${item.description}`,
      dueDate: item.date, isCompleted: false, createdAt: new Date().toISOString(),
      completionCriteria: { schema_version: 1 as const, task_scope: item.title, observable_check: item.description, evidence_ids: [] },
    }));
    saveWeeklyStudyPlans([
      ...existing,
      ...next.filter((item) => !existing.some((plan) => plan.id === item.id)),
    ]);
    update({ approved: true });
    setPending(null);
    setNotice(
      "추천 계획을 저장했어요. 기존 계획은 유지됩니다. ‘학습 계획 화면’에서 확인하거나 완료해 보세요.",
    );
  }
  function approveEvent() {
    if (!pending || pending.action !== "event") return;
    const events = getMonthlyEvents();
    saveMonthlyEvents([...events, { id: `demo-chat-event-${Date.now()}`, title: pending.title,
      date: pending.date, startTime: pending.time || "23:59", endTime: "", location: "",
      memo: pending.details.join("\n"), color: "#4F46E5", createdAt: new Date().toISOString() }]);
    update({ eventAdded: true });
    setPending(null);
    setNotice(
      "일정을 저장했어요. 시간표의 주간·월간 화면에서 확인할 수 있어요.",
    );
  }
  function classify() {
    const notes = JSON.parse(
      privateStorage.getItem("unilink:my-notes") || "[]",
    );
    const current = notes.find((note: { id: string }) => note.id === "1");
    if (current)
      privateStorage.setItem(
        "unilink:my-notes",
        JSON.stringify(
          notes.map((note: { id: string }) =>
            note.id === "1"
              ? {
                  ...current,
                  linkedType: "personal",
                  linkedId: "demo-os-review",
                  linkedTitle: "운영체제 자율 복습",
                  courseName: "",
                  tags: ["분류 체험", "교착상태"],
                }
              : note,
          ),
        ),
      );
    update({ classified: true });
    setNotice(
      "분류 변경을 저장했어요. 나의 노트에서 개인 학습으로 옮겨진 샘플을 확인할 수 있어요.",
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-12">
      <Header title="UniLink 공개 데모" bare />
      <div className="mx-auto max-w-6xl space-y-7 p-4 sm:p-7 lg:p-9">
        <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-950 via-indigo-800 to-violet-700 p-6 text-white sm:p-9">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="rounded-full border border-white/25 px-3 py-1 text-xs font-medium">
              PUBLIC DEMO · 로그인 없이 체험
            </span>
            <button
              className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm hover:bg-white/10"
              onClick={() => {
                generation.current++;
                  resetDemoData();
                window.location.reload();
              }}
            >
              <RotateCcw size={15} />
              처음부터 체험
            </button>
          </div>
          <h1 className="mt-5 text-3xl font-bold tracking-tight sm:text-4xl">
            수업 자료가
            <br className="sm:hidden" /> 오늘의 공부가 되기까지
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-indigo-100 sm:text-base">
            노트 정리부터 AI 대화, 계획 추천, 문제 복습과 성적 관리까지. 기능을
            눌러 체험하고 실제 서비스 화면도 둘러보세요.
          </p>
          <div className="mt-6 flex flex-wrap gap-3 text-xs text-indigo-100">
            <span>{getCurrentAcademicTermLabel()} 샘플</span>
            <span>개인정보 없는 예시 자료</span>
            <span>
              {state.visited.length} / {features.length}개 기능 둘러봄
            </span>
          </div>
        </section>
        <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm leading-6 text-indigo-950">
          채팅과 계획 추천은 실제 AI가 처리합니다. 대화와 데모 학습 정보가 OpenAI로 전송되며 개인정보는 입력하지 마세요.
          승인한 변경은 이 탭의 데모에만 저장합니다. 파일 분석은 샘플 자료 체험입니다.
          계획 생성은 한국시간 자정 기준 같은 네트워크에서 하루 3회입니다. 남은 횟수: {quota ? `${quota.remaining}/3회` : "확인 중"}.
        </div>
        <nav
          aria-label="데모 기능"
          className="grid grid-cols-2 gap-2 sm:grid-cols-4"
        >
          {features.map((item) => (
            <button
              key={item.id}
              aria-pressed={active === item.id}
              className={`flex min-h-14 items-center gap-2 rounded-xl border px-3 py-3 text-left text-sm font-semibold transition ${active === item.id ? "border-indigo-600 bg-indigo-600 text-white shadow-sm" : "border-slate-200 bg-white text-slate-700 hover:border-indigo-300"}`}
              onClick={() => visit(item.id)}
            >
              <item.icon size={18} className="shrink-0" />
              <span className="flex-1">{item.title}</span>
              {state.visited.includes(item.id) && <Check size={13} />}
            </button>
          ))}
        </nav>
        <div className="grid gap-5 lg:grid-cols-[1fr_290px]">
          <div className="min-w-0 space-y-5">
            {active === "chat" && (
              <Panel title="대화로 시작하는 학습 관리">
                <div
                  ref={messageList}
                  aria-busy={busy}
                  className="mb-5 max-h-96 space-y-3 overflow-y-auto"
                  aria-live="polite"
                >
                  {state.messages.map((message, index) => (
                    <div
                      key={index}
                      className={`w-fit max-w-[95%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-7 ${message.role === "user" ? "ml-auto bg-indigo-600 text-white" : "bg-slate-100 text-slate-800"}`}
                    >
                      <span className="mb-1 block text-xs opacity-70">
                        {message.role === "user" ? "나" : "UniLink · AI"}
                      </span>
                      {message.text}
                    </div>
                  ))}
                </div>
                {pending && (
                  <div className="mb-4 rounded-2xl border-2 border-indigo-200 p-5">
                    <h4 className="text-xl font-bold">{pending.title}</h4>
                    <ul className="my-4 list-disc space-y-2 pl-5 text-sm">
                      {pending.details.map((detail, i) => <li key={i}>{detail}</li>)}
                      {pending.plans.map((item, i) => <li key={`plan-${i}`}><strong>{item.title}</strong> · {item.description}<p className="mt-2 border-t pt-2 text-slate-500">{item.date} {item.time} · {item.minutes}분</p></li>)}
                    </ul>
                    {pending.date && <p className="border-t pt-3 text-sm text-slate-600">{pending.date} · {pending.time}</p>}
                    <div className="mt-4 flex gap-2">
                      <button
                        className={primary}
                        onClick={approvePending}
                      >
                        예, 반영하기
                      </button>
                      <button
                        className={button}
                        onClick={() => setPending(null)}
                      >
                        아니오
                      </button>
                    </div>
                  </div>
                )}
                <div className="mb-4 flex flex-wrap gap-2">
                  {[
                    "교착상태를 설명해줘",
                    "노트를 분석해줘",
                    "공부 계획을 추천해줘",
                    "과제 일정을 등록해줘",
                    "문제은행을 보여줘",
                    "저장된 계획을 보여줘",
                    "시간표를 보여줘",
                  ].map((text) => (
                    <button
                      key={text}
                      className={button}
                      disabled={busy}
                      onClick={() => request(text)}
                    >
                      {text}
                    </button>
                  ))}
                </div>
                <form
                  className="flex gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    request(input);
                  }}
                >
                  <input
                    aria-label="데모 채팅 입력"
                    className="min-w-0 flex-1 rounded-xl border px-3 py-3 text-sm"
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    placeholder="질문하거나 예시를 눌러 보세요"
                  />
                  <button className={primary} disabled={busy || !input.trim()}>
                    {busy ? "응답 중…" : "보내기"}
                  </button>
                </form>
                <button
                  className={`${button} mt-3`}
                  onClick={() => request("샘플 강의노트 PDF를 분석해줘")}
                >
                  <FileText size={16} />
                  샘플 PDF 첨부·분석 체험
                </button>
              </Panel>
            )}
            {active === "course" && (
              <Panel title="운영체제 · 수업 미리보기">
                <div className="mb-5 grid gap-3 sm:grid-cols-3">
                  {["강의노트 1개", "연습문제 4개", "학습 계획 1개"].map(
                    (text) => (
                      <div
                        key={text}
                        className="rounded-xl bg-indigo-50 p-4 text-sm font-semibold text-indigo-950"
                      >
                        {text}
                      </div>
                    ),
                  )}
                </div>
                <h4 className="mb-2 font-semibold">강의 주제</h4>
                <div className="mb-5 flex flex-wrap gap-2">
                  {["교착상태", "발생 조건", "예방과 회피"].map((text) => (
                    <span
                      key={text}
                      className="rounded-lg bg-slate-100 px-3 py-2 text-sm"
                    >
                      {text}
                    </span>
                  ))}
                </div>
                <h4 className="mb-2 font-semibold">과제·시험 관리</h4>
                <p className="mb-4 text-sm leading-7 text-slate-600">
                  과제는 제출 기한과 내용을, 시험은 범위·일시를 관리합니다. 실제
                  수업 화면에서 자료 열기와 계획 완료를 체험할 수 있어요.
                </p>
                <button className={button} onClick={approveEvent}>
                  {state.eventAdded
                    ? "샘플 과제 등록됨"
                    : "샘플 과제 일정 추가"}
                </button>
                <p className="mt-3 text-xs text-slate-500">
                  데모 일정은 시간표에 저장됩니다. 서버가 필요한 수업별 일정
                  상세 편집은 설명으로 안내합니다.
                </p>
              </Panel>
            )}
            {active === "notes" && (
              <Panel title="강의노트 · 샘플 자료">
                <p className="mb-4 text-sm text-slate-600">개인정보 없는 샘플 PDF로 미리보기·분석·분류를 체험하세요.</p>
                <label className="block text-sm">노트 검색
                  <input className="mt-2 w-full rounded-xl border p-3" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="교착상태" />
                </label>
                {"교착상태 운영체제".includes(query.trim()) ? (
                  <div className="mt-4 rounded-xl bg-slate-50 p-4">
                    <p className="font-bold">교착상태 강의노트</p>
                    <p className="my-2 text-sm">{state.classified ? "개인 학습" : "운영체제 수업"} · 샘플 PDF</p>
                    <div className="flex flex-wrap gap-2">
                      <button className={button} onClick={() => setPreview(!preview)}>{preview ? "미리보기 닫기" : "PDF 미리보기"}</button>
                      <button className={button} onClick={() => update({ analyzed: true })}>주제 분석 체험</button>
                      <button className={button} disabled={state.classified} onClick={classify}>개인 학습으로 분류</button>
                    </div>
                  </div>
                ) : <p className="mt-4 text-sm">검색 결과가 없어요.</p>}
                {preview && (
                  <div className="mt-5">
                    <iframe
                      title="샘플 강의노트 PDF"
                      src={pdf}
                      className="h-[450px] w-full rounded-xl border"
                    />
                    <a
                      href={pdf}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-block text-sm text-indigo-700 underline"
                    >
                      샘플 PDF를 새 탭에서 열기
                    </a>
                  </div>
                )}
                {state.analyzed && (
                  <div className="mt-5 rounded-xl bg-indigo-50 p-4">
                    <h4 className="font-bold">분석 결과 · 준비된 예시</h4>
                    <ul className="mt-3 list-disc space-y-2 pl-5 text-sm">
                      <li>교착상태의 4가지 조건</li>
                      <li>예방과 회피의 차이</li>
                      <li>자원 순서 지정과 순환 대기</li>
                    </ul>
                    <button
                      className={`${button} mt-4`}
                      onClick={() => {
                        visit("chat");
                        void request("교착상태 강의노트 내용으로 학습 계획을 추천해줘");
                      }}
                    >
                      이 주제로 계획 추천
                    </button>
                  </div>
                )}
                <div
                  className="mt-6 rounded-xl border-2 border-dashed p-5 text-sm text-slate-600"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    setNotice(
                      "파일 놓기를 확인했어요. 데모에서는 실제 파일을 읽거나 전송하지 않고 샘플 결과를 보여줍니다.",
                    );
                    update({ analyzed: true });
                  }}
                >
                  파일 업로드·자동 분류 체험
                  <input
                    aria-label="데모 파일 선택"
                    type="file"
                    accept="application/pdf"
                    className="mt-3 block w-full text-xs"
                    onChange={(event) => {
                      if (event.target.files?.length) {
                        update({ analyzed: true });
                        setNotice(
                          "파일 선택을 확인했어요. 실제 내용 대신 준비된 교착상태 분석 결과를 표시합니다. 파일은 전송되지 않습니다.",
                        );
                      }
                    }}
                  />
                </div>
              </Panel>
            )}
            {active === "coaching" && (
              <Panel title="맞춤 계획 추천 설정">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="space-y-2 text-sm">
                    <span>요청 종류</span>
                    <select
                      className="w-full rounded-xl border p-3"
                      value={mode}
                      onChange={(event) => {
                        setMode(event.target.value);
                        setProposal(false);
                      }}
                    >
                      {[
                        "이번 주 계획",
                        "오늘 계획",
                        "시험 대비",
                        "단원 복습",
                      ].map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-2 text-sm">
                    <span>하루 순공시간</span>
                    <select
                      className="w-full rounded-xl border p-3"
                      value={minutes}
                      onChange={(event) => {
                        setMinutes(event.target.value);
                        setProposal(false);
                      }}
                    >
                      {[30, 60, 90, 120].map((value) => (
                        <option key={value} value={value}>
                          {value}분
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <fieldset className="mt-5">
                  <legend className="mb-3 text-sm font-semibold">
                    선호 학습시간 · 공통 설정
                  </legend>
                  <div className="flex flex-wrap gap-2">
                    {["오후 15:00–18:00", "저녁 19:00–22:00"].map((value) => (
                      <button
                        key={value}
                        aria-pressed={preferred === value}
                        className={`${button} ${preferred === value ? "!border-indigo-600 !bg-indigo-50" : ""}`}
                        onClick={() => {
                          setPreferred(value);
                          setProposal(false);
                        }}
                      >
                        {value}
                      </button>
                    ))}
                  </div>
                </fieldset>
                <p className="my-5 text-sm leading-7 text-slate-600">
                  {mode === "오늘 계획"
                    ? "마감 임박 과제를 우선 배치하는 요청입니다."
                    : mode === "시험 대비"
                      ? "과목의 시험 범위·일시·우선도·난이도를 바탕으로 준비합니다."
                      : mode === "단원 복습"
                        ? "기준 계획의 남는 시간에 당일 수업 복습을 배치합니다."
                        : "선택한 목표와 이번 주 일정을 바탕으로 계획합니다."}{" "}
                  이 체험에서는 두 과목의 고정된 예시를 설정 시간에 표시합니다.
                </p>
                <button className={primary} disabled={busy || quota?.remaining === 0} onClick={() => { visit("chat"); void request(`${mode}을 추천해줘. 순공 ${minutes}분, ${preferred} 안에 배치해줘.`); }}>
                  <Sparkles size={16} />
                  추천 시간표 만들기
                </button>
                {proposal && <p className="mt-4 text-sm text-slate-600">AI 대화에서 실제 추천 결과와 일시를 확인한 뒤 승인해 주세요.</p>}
              </Panel>
            )}
            {active === "timetable" && (
              <Panel title="한 주와 한 달을 함께 관리">
                <div className="mb-5 grid grid-cols-5 gap-2">
                  {["월", "화", "수", "목", "금"].map((day, index) => (
                    <div
                      key={day}
                      className="min-w-0 space-y-2 text-center text-xs"
                    >
                      <p className="py-2 font-bold">{day}</p>
                      <Link
                        className="block rounded-lg bg-indigo-100 px-1 py-5 leading-6 text-indigo-950"
                        href={`/course?courseId=${(index % 2) + 1}`}
                      >
                        {index % 2 ? "데이터베이스" : "운영체제"}
                        <br />
                        수업 열기
                      </Link>
                      <div className="rounded-lg bg-amber-50 px-1 py-5 leading-6">
                        {index === 1
                          ? "과제 마감"
                          : index === 4
                            ? "시험 일정"
                            : "자율 학습"}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mb-5 text-sm leading-7 text-slate-600">
                  위는 기능 안내용 주간 예시입니다. 실제 시간표 화면에는 이번
                  날짜 기준 수업과 샘플 일정이 준비되어 있어요. 월간 보기로
                  바꾸면 과제·시험·개인 일정을 확인할 수 있습니다.
                </p>
                <button className={button} onClick={approveEvent}>
                  대화 예시 과제 마감 추가
                </button>
              </Panel>
            )}
            {active === "problems" && (
              <Panel title="문제 풀이와 이해도 기록">
                <span className="text-xs font-semibold text-indigo-600">
                  운영체제 · 교착상태 연습문제
                </span>
                <h4 className="my-4 text-xl font-bold leading-8">
                  교착상태를 일으키는 네 가지 조건은 무엇인가요?
                </h4>
                <button className={button} onClick={() => setAnswer(!answer)}>
                  {answer ? "해설 접기" : "예시 해설 확인"}
                </button>
                {answer && (
                  <p className="mt-4 rounded-xl bg-slate-100 p-4 text-sm leading-7">
                    상호 배제, 점유와 대기, 비선점, 순환 대기입니다. 자원 획득
                    순서를 통일하면 순환 대기를 방지할 수 있습니다.
                  </p>
                )}
                <fieldset className="mt-6">
                  <legend className="mb-3 text-sm font-semibold">
                    이 문제의 이해도는?
                  </legend>
                  <div className="flex flex-wrap gap-2">
                    {[
                      "아직 어려워요",
                      "복습이 필요해요",
                      "설명할 수 있어요",
                    ].map((label, index) => (
                      <button
                        key={label}
                        aria-pressed={state.understanding === index}
                        className={`${button} ${state.understanding === index ? "!border-indigo-600 !bg-indigo-50" : ""}`}
                        onClick={() => {
                          const problems = JSON.parse(
                            privateStorage.getItem(
                              "unilink:problem-bank-problems",
                            ) || "[]",
                          );
                          privateStorage.setItem(
                            "unilink:problem-bank-problems",
                            JSON.stringify(
                              problems.map((problem: { id: string }) =>
                                problem.id === "demo-problem-0"
                                  ? {
                                      ...problem,
                                      level: index,
                                      updatedAt: new Date().toISOString(),
                                    }
                                  : problem,
                              ),
                            ),
                          );
                          update({ understanding: index });
                          setNotice(
                            "샘플 문항의 이해도를 문제은행에 저장했어요.",
                          );
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </fieldset>
              </Panel>
            )}
            {active === "study" && (
              <Panel title="추천 계획에서 실행으로">
                <div className="space-y-3">
                  {getWeeklyStudyPlans().map((plan) => (
                    <label
                      key={plan.id}
                      className="flex cursor-pointer gap-3 rounded-xl border p-4"
                    >
                      <input
                        type="checkbox"
                        className="mt-1 h-5 w-5 shrink-0 accent-indigo-600"
                        checked={plan.isCompleted}
                        onChange={(event) => {
                          saveWeeklyStudyPlans(
                            getWeeklyStudyPlans().map((item) =>
                              item.id === plan.id
                                ? { ...item, isCompleted: event.target.checked }
                                : item,
                            ),
                          );
                          setNotice(
                            event.target.checked
                              ? "완료를 저장했어요. 다시 접속해도 이 탭에서는 유지돼요."
                              : "미완료로 변경했어요.",
                          );
                        }}
                      />
                      <span className="min-w-0">
                        <strong
                          className={`block text-sm ${plan.isCompleted ? "text-slate-400 line-through" : ""}`}
                        >
                          {plan.title}
                        </strong>
                        <span className="mt-1 block text-xs leading-6 text-slate-500">
                          {plan.courseName} · {plan.description}
                        </span>
                        <span className="mt-2 block text-xs text-indigo-700">
                          {plan.dueDate}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
                <div className="mt-6 border-t pt-5">
                  <h4 className="mb-3 font-semibold">개인 목표 추가 체험</h4>
                  <form
                    className="flex flex-wrap gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (!goal.trim()) return;
                      if (
                        !getPersonalStudies().some(
                          (study) => study.title === goal.trim(),
                        )
                      )
                        savePersonalStudies([
                          ...getPersonalStudies(),
                          {
                            id: `demo-goal-${Date.now()}`,
                            title: goal.trim(),
                            category: "개인 학습",
                            goal: "매일 30분씩 꾸준히 학습하기",
                            color: "#0891B2",
                            createdAt: new Date().toISOString(),
                          },
                        ]);
                      setNotice(
                        "개인 목표를 저장했어요. 왼쪽 목록의 개인 학습에서 확인할 수 있어요.",
                      );
                    }}
                  >
                    <input
                      aria-label="개인 학습 목표"
                      className="min-w-0 flex-1 rounded-xl border p-3 text-sm"
                      value={goal}
                      onChange={(event) => setGoal(event.target.value)}
                      maxLength={100}
                    />
                    <button className={button}>목표 추가</button>
                  </form>
                  <Link
                    className="mt-4 inline-block text-sm text-indigo-700 underline"
                    href="/personal-study?studyId=demo-personal"
                  >
                    개인 학습 샘플 열기
                  </Link>
                </div>
              </Panel>
            )}
            {active === "records" && (
              <Panel title="성적부터 학습 환경까지">
                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    ["평균 평점", "3.75 / 4.5"],
                    ["예시 취득 학점", "12학점"],
                    ["관리 과목", "4과목"],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl bg-indigo-50 p-4">
                      <p className="text-xs text-slate-600">{label}</p>
                      <strong className="mt-2 block text-xl text-indigo-950">
                        {value}
                      </strong>
                    </div>
                  ))}
                </div>
                <p className="my-5 text-sm leading-7 text-slate-600">
                  A0·B+·A+·B0인 3학점 과목 네 개를 준비했어요. 성적 화면에서
                  수정하면 평점이 달라지고, 학점계산기에서 재수강 가정과 졸업
                  학점을 계산할 수 있습니다.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Link className={button} href="/records/calculator">
                    학점계산기 열기
                  </Link>
                  <Link className={button} href="/settings">
                    설정 화면 열기
                  </Link>
                </div>
              </Panel>
            )}
            {notice && (
              <div
                role="status"
                className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-7 text-emerald-950"
              >
                {notice}
              </div>
            )}
          </div>
          <aside className="space-y-4">
            <Panel title={feature.title}>
              <p className="mb-4 text-sm font-medium leading-7 text-indigo-700">
                {feature.subtitle}
              </p>
              <ul className="space-y-4">
                {feature.details.map((text) => (
                  <li
                    key={text}
                    className="flex gap-2 text-sm leading-6 text-slate-600"
                  >
                    <Check
                      size={16}
                      className="mt-1 shrink-0 text-indigo-600"
                    />
                    {text}
                  </li>
                ))}
              </ul>
              {active !== "chat" && (
                <Link className={`${primary} mt-6 w-full`} href={feature.href}>
                  실제 {feature.title} 화면
                  <ArrowRight size={15} />
                </Link>
              )}
              <p className="mt-4 text-xs leading-6 text-slate-500">
                기존 화면에서도 샘플 데이터로 체험합니다. 로그인·서버가 필요한
                동작은 이 안내 화면의 시뮬레이션을 이용하세요.
              </p>
            </Panel>
            <div className="rounded-2xl bg-slate-900 p-5 text-white">
              <h3 className="font-semibold">추천 시연 순서</h3>
              <p className="mt-3 text-sm leading-7 text-slate-300">
                채팅 → 강의노트 → 주제 분석 → AI 학습코칭 → 계획 승인 → 학습 계획
                완료 → 문제은행
              </p>
              <button
                className="mt-4 text-sm font-semibold text-indigo-200 underline underline-offset-4"
                onClick={() => visit("notes")}
              >
                자료부터 시작하기 →
              </button>
            </div>
          </aside>
        </div>
        <div className="flex justify-end">
          <button
            className={button}
            onClick={() =>
              visit(
                features[
                  (features.findIndex((item) => item.id === active) + 1) %
                    features.length
                ].id,
              )
            }
          >
            다음 기능 둘러보기
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

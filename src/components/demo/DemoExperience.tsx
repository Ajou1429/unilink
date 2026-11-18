"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  Check,
  Cloud,
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
    title: "노트 · Drive",
    icon: Cloud,
    href: "/notes",
    subtitle: "흩어진 자료를 연결하고 분류해요",
    details: [
      "Drive 폴더 선택·PDF 동기화·원본 미리보기",
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
      "설정에서 계정·연동·알림 환경 관리",
    ],
  },
] as const;
type FeatureId = (typeof features)[number]["id"];
type Message = { role: "user" | "assistant"; text: string };
type DemoState = {
  visited: FeatureId[];
  messages: Message[];
  drive: number;
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
      text: "안녕하세요! UniLink 공개 데모예요. 아래 예시를 눌러 학습 질문, 파일 분석, 일정 등록과 계획 추천을 체험해 보세요.",
    },
  ],
  drive: 0,
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
function dateAfter(offset: number) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function DemoExperience() {
  const [active, setActive] = useState<FeatureId>("chat");
  const [state, setState] = useState(readState);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState<"plan" | "event" | null>(null);
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
  function request(text: string) {
    if (!text.trim()) return;
    let reply: string;
    if (/계획|추천|복습/.test(text)) {
      setPending("plan");
      reply =
        "교착상태 복습과 SQL 연습으로 구성한 계획 예시를 준비했어요. 아래 내용을 확인하고 승인하면 이 탭의 학습 계획에 추가됩니다.";
    } else if (/일정|시험|과제|마감/.test(text)) {
      setPending("event");
      reply =
        "일정 등록 흐름을 체험해 볼게요. 데모 예시는 운영체제 보고서 제출이며, 시간을 따로 지정하지 않은 마감은 23:59로 표시해요.";
    } else if (/분석|파일|노트|pdf/i.test(text)) {
      update({ analyzed: true });
      reply =
        "준비된 샘플 노트의 분석 결과예요. 주제: 교착상태의 4가지 조건 / 예방과 회피 / 자원 할당. ‘노트 · Drive’에서 샘플 PDF와 분류 과정을 볼 수 있어요. 실제 업로드 파일의 AI 분석은 실행하지 않습니다.";
    } else if (/교착|공부|학습|이해/.test(text)) {
      reply =
        "교착상태는 서로 가진 자원을 기다리느라 아무도 진행하지 못하는 상태예요. 예를 들어 A는 프린터를, B는 스캐너를 가진 채 서로의 장치를 기다리는 상황입니다. 상호 배제·점유와 대기·비선점·순환 대기가 모두 성립할 때 발생할 수 있어요. ‘문제은행’에서 확인 문제를 풀어 보세요.";
    } else {
      reply =
        "반가워요! 잠깐 쉬면서 오늘 할 공부를 가볍게 정리해 볼까요? 이 데모는 준비된 응답으로 동작해요. ‘교착상태를 설명해줘’, ‘노트를 분석해줘’, ‘공부 계획을 추천해줘’를 입력해 보세요.";
    }
    update({
      messages: [
        ...state.messages,
        { role: "user", text },
        { role: "assistant", text: reply },
      ],
    });
    setInput("");
  }
  function approvePlan() {
    const existing = getWeeklyStudyPlans();
    const duration = Number(minutes);
    const start = preferred.startsWith("오후") ? 15 * 60 : 19 * 60;
    const time = (value: number) =>
      `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
    const next = ["교착상태 핵심 개념 복습", "SQL JOIN 문제 풀이"].map(
      (title, index) => ({
        id: `demo-recommendation-${index}`,
        userId: "demo",
        courseId: String(index + 1),
        courseName: index ? "데이터베이스" : "운영체제",
        week: 1,
        title,
        description: `${mode} · ${time(start)}–${time(start + duration)} · 개념 설명 후 연습문제 2개 확인`,
        dueDate: dateAfter(index),
        isCompleted: false,
        createdAt: new Date().toISOString(),
        completionCriteria: {
          schema_version: 1 as const,
          task_scope: title,
          observable_check: "핵심 개념을 설명하고 연습문제 2개 풀기",
          evidence_ids: [],
        },
      }),
    );
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
    const events = getMonthlyEvents();
    if (!events.some((event) => event.id === "demo-chat-assignment"))
      saveMonthlyEvents([
        ...events,
        {
          id: "demo-chat-assignment",
          title: "운영체제 보고서 제출",
          date: dateAfter(2),
          startTime: "23:59",
          endTime: "",
          location: "온라인 제출",
          memo: "교착상태 예방과 회피 비교 · 데모 대화에서 등록",
          color: "#4F46E5",
          createdAt: new Date().toISOString(),
        },
      ]);
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
  const total = Number(minutes);
  const planStart = preferred.startsWith("오후") ? "15:00" : "19:00";
  const planEnd = `${String(Number(planStart.slice(0, 2)) + Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;

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
          AI 응답·분석·Drive 연결은 준비된 시뮬레이션입니다. 실제 API 호출·Drive
          변경·계정 저장 없이 이 탭의 샘플만 변경합니다. 자유 입력도 아래 예시
          시나리오로 응답합니다.
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
                  className="mb-5 max-h-96 space-y-3 overflow-y-auto"
                  aria-live="polite"
                >
                  {state.messages.map((message, index) => (
                    <div
                      key={index}
                      className={`w-fit max-w-[95%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-7 ${message.role === "user" ? "ml-auto bg-indigo-600 text-white" : "bg-slate-100 text-slate-800"}`}
                    >
                      <span className="mb-1 block text-xs opacity-70">
                        {message.role === "user" ? "나" : "UniLink · 데모 응답"}
                      </span>
                      {message.text}
                    </div>
                  ))}
                </div>
                {pending && (
                  <div className="mb-4 rounded-2xl border-2 border-indigo-200 p-5">
                    <h4 className="text-xl font-bold">
                      {pending === "plan"
                        ? "운영체제 · SQL 학습 계획"
                        : "운영체제 과제 마감"}
                    </h4>
                    <ul className="my-4 list-disc space-y-2 pl-5 text-sm">
                      <li>
                        {pending === "plan"
                          ? "핵심 개념 복습과 연습문제 풀이"
                          : "교착상태 예방과 회피 비교 보고서"}
                      </li>
                      <li>승인 후 샘플 데이터에 한 번만 반영</li>
                    </ul>
                    <p className="border-t pt-3 text-sm text-slate-600">
                      {dateAfter(pending === "plan" ? 0 : 2)} ·{" "}
                      {pending === "plan"
                        ? `${planStart}–${planEnd}`
                        : "23:59 마감"}
                    </p>
                    <div className="mt-4 flex gap-2">
                      <button
                        className={primary}
                        onClick={
                          pending === "plan" ? approvePlan : approveEvent
                        }
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
                  ].map((text) => (
                    <button
                      key={text}
                      className={button}
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
                  <button className={primary} disabled={!input.trim()}>
                    보내기
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
              <Panel title="Drive에서 노트로 · 단계별 체험">
                <ol className="mb-5 flex flex-wrap gap-2 text-xs">
                  {["연결", "폴더 선택", "동기화", "분석"].map(
                    (label, index) => (
                      <li
                        key={label}
                        className={`rounded-full px-3 py-2 ${state.drive > index ? "bg-indigo-600 text-white" : "bg-slate-100"}`}
                      >
                        {index + 1}. {label}
                      </li>
                    ),
                  )}
                </ol>
                <p className="mb-4 text-sm leading-7 text-slate-600">
                  사용자가 동기화 대상을 고릅니다. 폴더 선택은 서비스 내부
                  설정이며 Drive 권한 자체를 해당 폴더로 제한하지 않습니다.
                </p>
                {state.drive === 0 && (
                  <button
                    className={primary}
                    onClick={() => update({ drive: 1 })}
                  >
                    Google Drive 연결 체험
                  </button>
                )}
                {state.drive === 1 && (
                  <div className="space-y-3">
                    <p className="text-sm">연결됨 · 가상의 데모 계정</p>
                    <button
                      className={button}
                      onClick={() => update({ drive: 2 })}
                    >
                      운영체제 폴더 선택 · PDF 1개
                    </button>
                  </div>
                )}
                {state.drive >= 2 && (
                  <div className="space-y-4">
                    <div className="rounded-xl border p-4 text-sm">
                      <Cloud className="mb-2 text-indigo-600" size={22} />
                      <strong>운영체제 / 교착상태.pdf</strong>
                      <p className="mt-1 text-slate-500">
                        선택한 데모 폴더 · 개인정보 없는 자체 샘플
                      </p>
                    </div>
                    {state.drive === 2 ? (
                      <button
                        className={primary}
                        onClick={() => {
                          update({ drive: 3 });
                          setNotice(
                            "샘플 PDF가 노트 목록에 표시되었습니다. 실제 Drive 통신은 하지 않았어요.",
                          );
                        }}
                      >
                        선택 폴더 동기화 체험
                      </button>
                    ) : (
                      <>
                        <label className="block text-sm">
                          노트 검색
                          <input
                            className="mt-2 w-full rounded-xl border p-3"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="교착상태"
                          />
                        </label>
                        {"교착상태 운영체제".includes(query.trim()) ? (
                          <div className="rounded-xl bg-slate-50 p-4">
                            <p className="font-bold">교착상태 강의노트</p>
                            <p className="mb-3 mt-1 text-xs text-slate-500">
                              {state.classified
                                ? "개인 학습으로 분류됨"
                                : "운영체제 수업으로 분류됨"}{" "}
                              · 샘플 PDF
                            </p>
                            <div className="flex flex-wrap gap-2">
                              <button
                                className={button}
                                onClick={() => setPreview(!preview)}
                              >
                                {preview ? "미리보기 닫기" : "PDF 미리보기"}
                              </button>
                              <button
                                className={button}
                                onClick={() =>
                                  update({ analyzed: true, drive: 4 })
                                }
                              >
                                주제 분석 체험
                              </button>
                              <button
                                className={button}
                                disabled={state.classified}
                                onClick={classify}
                              >
                                개인 학습으로 분류
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm text-slate-500">
                            검색 결과가 없어요.
                          </p>
                        )}
                      </>
                    )}
                  </div>
                )}
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
                        visit("coaching");
                        setProposal(true);
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
                <button className={primary} onClick={() => setProposal(true)}>
                  <Sparkles size={16} />
                  추천 시간표 만들기
                </button>
                {proposal && (
                  <div className="mt-6">
                    <h4 className="mb-3 font-bold">추천 시간표 · 시뮬레이션</h4>
                    <div className="overflow-hidden rounded-xl border">
                      <div className="grid grid-cols-[80px_1fr_1fr] bg-slate-100 p-3 text-center text-sm">
                        <span>시간</span>
                        <span>오늘</span>
                        <span>내일</span>
                      </div>
                      <div className="grid grid-cols-[80px_1fr_1fr] gap-2 p-3 text-sm">
                        <span className="leading-7">
                          {planStart}
                          <br />
                          {planEnd}
                        </span>
                        <div className="rounded-lg bg-indigo-100 p-3 text-indigo-950">
                          운영체제
                          <br />
                          <strong>교착상태 복습</strong>
                          <p className="mt-2 text-xs">
                            {minutes}분 · 개념 설명 + 2문제
                          </p>
                        </div>
                        <div className="rounded-lg bg-emerald-100 p-3 text-emerald-950">
                          데이터베이스
                          <br />
                          <strong>SQL JOIN 연습</strong>
                          <p className="mt-2 text-xs">
                            {minutes}분 · 예제와 오답 정리
                          </p>
                        </div>
                      </div>
                    </div>
                    <p className="my-3 text-xs leading-6 text-slate-500">
                      휴식은 공부 시간에 포함하지 않습니다. 실제 서비스는 고정
                      일정 충돌과 최소 연속 시간을 검사합니다. 이 예시는 실제
                      AI의 최적화 결과가 아닙니다.
                    </p>
                    <button
                      className={primary}
                      disabled={state.approved}
                      onClick={approvePlan}
                    >
                      {state.approved
                        ? "학습 계획에 반영됨"
                        : "이 계획 승인·저장"}
                    </button>
                  </div>
                )}
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
                노트 · Drive → 주제 분석 → AI 학습코칭 → 계획 승인 → 학습 계획
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

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Cloud,
  FileText,
  ListChecks,
  RefreshCw,
  Target,
} from "lucide-react";
import { Header } from "@/components/layout/Header";
import { getStoredCourses } from "@/lib/course-storage";
import { getWeeklyStudyPlans } from "@/lib/study-storage";
import {
  getCourseSessions,
  getMonthlyEvents,
  getWorkSchedules,
} from "@/lib/timetable-storage";
import {
  getPersonalStudies,
  getAllPersonalStudyPlans,
} from "@/lib/personal-study-storage";
import { getMyNotes, type MyNote } from "@/lib/my-notes-storage";
import {
  listSubjects,
  type ProblemBankSubject,
} from "@/lib/problem-bank-storage";
import {
  getDriveConnectionStatus,
  type DriveConnectionStatus,
} from "@/lib/drive-connection";
import {
  PRIVATE_STORAGE_CHANGED_EVENT,
} from "@/lib/private-storage";
import { useCurrentTime } from "@/lib/use-current-time";
import { CoachingRequestPanel } from "@/components/coaching/CoachingRequestPanel";
import {
  coachingWeek,
  orderCoachingTasks,
  type CoachingTask,
} from "@/lib/coaching-view";
import styles from "./workspace.module.css";

function readLearning() {
  return {
    courses: getStoredCourses(),
    plans: getWeeklyStudyPlans(),
    sessions: getCourseSessions(),
    goals: getPersonalStudies(),
    personalPlans: getAllPersonalStudyPlans(),
    events: getMonthlyEvents(),
    commitments: getWorkSchedules(),
  };
}
type Learning = ReturnType<typeof readLearning>;
const emptyLearning: Learning = {
  courses: [],
  plans: [],
  sessions: [],
  goals: [],
  personalPlans: [],
  events: [],
  commitments: [],
};
function Jump({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link className={styles.jump} href={href}>
      {children}
      <ArrowUpRight size={15} aria-hidden="true" />
    </Link>
  );
}

export default function AiCoachingPage() {
  const now = useCurrentTime();
  const [data, setData] = useState<Learning>(emptyLearning);
  const [selected, setSelected] = useState("all");
  const [tab, setTab] = useState("현황");
  const [offset, setOffset] = useState(0);
  const [filter, setFilter] = useState("전체");
  const [notes, setNotes] = useState<MyNote[]>([]);
  const [subjects, setSubjects] = useState<ProblemBankSubject[]>([]);
  const [drive, setDrive] = useState<DriveConnectionStatus | null>(null);
  const [resourceErrors, setResourceErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [search, setSearch] = useState("");
  const [noteLimit, setNoteLimit] = useState(20);
  useEffect(() => {
    const sync = () => setData(readLearning());
    sync();
    window.addEventListener(PRIVATE_STORAGE_CHANGED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(PRIVATE_STORAGE_CHANGED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  useEffect(() => {
    let active = true;
    void Promise.allSettled([
      getMyNotes(),
      listSubjects(),
      getDriveConnectionStatus(),
    ]).then(([n, s, d]) => {
      if (!active) return;
      setNotes(n.status === "fulfilled" ? n.value : []);
      setSubjects(s.status === "fulfilled" ? s.value : []);
      setDrive(d.status === "fulfilled" ? d.value : null);
      setResourceErrors(
        [
          n.status === "rejected" ? "노트" : "",
          s.status === "rejected" ? "문제은행" : "",
          d.status === "rejected" ? "Drive" : "",
        ].filter(Boolean),
      );
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [revision]);
  const week = coachingWeek(new Date(now), offset);
  const goals = data.goals.filter((g) => !g.status || g.status === "active");
  const targets = [
    ...data.courses.map((c) => ({
      id: `course:${c.id}`,
      name: c.name,
      color: c.color,
      href: "/course",
      type: "수업",
    })),
    ...goals.map((g) => ({
      id: `personal:${g.id}`,
      name: g.title,
      color: g.color,
      href: "/personal-study",
      type: "개인 목표",
    })),
  ];
  const allTasks: CoachingTask[] = [
    ...data.plans
      .filter((p) => data.courses.some((c) => c.id === p.courseId))
      .map((p) => ({
        id: `course:${p.id}`,
        target: `course:${p.courseId}`,
        name: p.courseName,
        title: p.title,
        dueDate: p.dueDate,
        weekStart: p.weekStart,
        completed: p.isCompleted,
        href: "/study",
      })),
    ...data.personalPlans
      .filter((p) => goals.some((g) => g.id === p.studyId))
      .map((p) => ({
        id: `personal:${p.id}`,
        target: `personal:${p.studyId}`,
        name: goals.find((g) => g.id === p.studyId)!.title,
        title: p.title,
        dueDate: p.dueDate,
        completed: p.isCompleted,
        href: "/personal-study",
      })),
  ];
  const tasks = orderCoachingTasks(
    allTasks.filter((p) => selected === "all" || p.target === selected),
  );
  const weekTasks = tasks.filter(
    (p) =>
      p.weekStart === week.start ||
      (!p.weekStart &&
        !!p.dueDate &&
        p.dueDate >= week.start &&
        p.dueDate <= week.end),
  );
  const overdue = tasks.filter(
    (p) => !p.completed && !!p.dueDate && p.dueDate < week.today,
  );
  const pending = weekTasks.filter((p) => !p.completed);
  const finished = weekTasks.filter((p) => p.completed).length;
  const visibleTasks =
    filter === "지연"
      ? overdue
      : filter === "완료"
        ? weekTasks.filter((p) => p.completed)
        : filter === "미완료"
          ? pending
          : weekTasks;
  const latest = useMemo(() => {
    const result = new Map<string, Learning["sessions"][number]>();
    [...data.sessions]
      .sort((a, b) =>
        `${b.date} ${b.startTime}`.localeCompare(`${a.date} ${a.startTime}`),
      )
      .forEach((s) => {
        if (!result.has(s.courseId)) result.set(s.courseId, s);
      });
    return result;
  }, [data.sessions]);
  const scopedNotes = notes.filter(
    (n) =>
      (selected === "all" || `${n.linkedType}:${n.linkedId}` === selected) &&
      `${n.title} ${n.courseName}`
        .toLocaleLowerCase()
        .includes(search.toLocaleLowerCase()),
  );
  const selectedTargets = targets.filter(
    (t) => selected === "all" || t.id === selected,
  );
  const agenda = data.events
    .filter((e) => e.date >= week.start && e.date <= week.end)
    .sort((a, b) =>
      `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`),
    );
  return (
    <div className={styles.page}>
      <Header title="AI 학습코칭" />
      <main className={styles.workspace}>
        <div className={styles.heading}>
          <div>
            <p className={styles.eyebrow}>LEARNING WORKSPACE</p>
            <h1>학습의 다음 단계</h1>
            <p className={styles.subtle}>
              수업부터 개인 목표까지, 이번 주의 진행 상황
            </p>
          </div>
          <Jump href="/study">학습 계획 열기</Jump>
        </div>
        <div className={styles.toolbar}>
          <div className={styles.week}>
            <button
              aria-label="이전 주"
              onClick={() => setOffset((o) => o - 1)}
            >
              <ChevronLeft size={18} />
            </button>
            <span>
              {week.start.slice(5).replace("-", ".")} –{" "}
              {week.end.slice(5).replace("-", ".")}{" "}
              <small>{week.start.slice(0, 4)}</small>
            </span>
            <button
              aria-label="다음 주"
              onClick={() => setOffset((o) => o + 1)}
            >
              <ChevronRight size={18} />
            </button>
            <button className={styles.today} onClick={() => setOffset(0)}>
              이번 주
            </button>
          </div>
          <label className={styles.scope}>
            학습 대상
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="all">전체 목표</option>
              {targets.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} · {t.type}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className={styles.metrics}>
          <div>
            <span>계획 완료</span>
            <strong>
              {finished}
              <small> / {weekTasks.length}건</small>
            </strong>
            <progress
              aria-label="선택 주 계획 완료율"
              value={finished}
              max={weekTasks.length || 1}
            />
          </div>
          <div>
            <span>남은 계획</span>
            <strong>
              {pending.length}
              <small>건</small>
            </strong>
            <span>
              {weekTasks.length ? "선택한 주 기준" : "등록된 계획 없음"}
            </span>
          </div>
          <div>
            <span>기한 지난 계획</span>
            <strong className={overdue.length ? styles.warning : ""}>
              {overdue.length}
              <small>건</small>
            </strong>
            <span>오늘 기준 · 이전 주 포함</span>
          </div>
          <div>
            <span>학습 대상</span>
            <strong>
              {selectedTargets.length}
              <small>개</small>
            </strong>
            <span>현재 학기 수업 · 진행 중 목표</span>
          </div>
        </div>
        <div className={styles.columns}>
          <section className={styles.content}>
            <nav className={styles.tabs} aria-label="코칭 보기">
              {["현황", "실행 계획", "자료·문제"].map((name) => (
                <button
                  key={name}
                  aria-current={tab === name ? "page" : undefined}
                  onClick={() => setTab(name)}
                >
                  {name}
                </button>
              ))}
            </nav>
            {tab === "현황" && (
              <>
                <div className={styles.sectionTitle}>
                  <h2>
                    <Target size={18} /> 목표별 진행 상황
                  </h2>
                  <Jump href="/personal-study">목표 관리</Jump>
                </div>
                {selectedTargets.length === 0 && (
                  <div className={styles.empty}>
                    <BookOpen size={28} />
                    <h3>첫 학습 목표를 등록하세요</h3>
                    <div className={styles.links}>
                      <Jump href="/timetable">수업 추가</Jump>
                      <Jump href="/personal-study">개인 목표 추가</Jump>
                    </div>
                  </div>
                )}
                {selectedTargets.map((t) => {
                  const course = data.courses.find(
                    (c) => `course:${c.id}` === t.id,
                  );
                  const session = course ? latest.get(course.id) : undefined;
                  const goal = goals.find((g) => `personal:${g.id}` === t.id);
                  const targetTasks = tasks.filter(
                    (p) => p.target === t.id && !p.completed,
                  );
                  const late = targetTasks.filter(
                    (p) => p.dueDate && p.dueDate < week.today,
                  ).length;
                  return (
                    <article key={t.id} className={styles.targetRow}>
                      <div className={styles.targetTitle}>
                        <span
                          className={styles.swatch}
                          style={{ background: t.color }}
                        />
                        <h3>{t.name}</h3>
                        <span className={styles.pill}>{t.type}</span>
                      </div>
                      <p>
                        {session
                          ? session.progressTitle ||
                            session.noteTitle ||
                            "진도 내용 미입력"
                          : goal?.goal || "아직 진도 기록이 없습니다"}
                      </p>
                      <div className={styles.facts}>
                        {session && (
                          <>
                            <span>{session.date} 수업</span>
                            <span>
                              체감 난이도 {session.difficulty || "미입력"}
                            </span>
                            <span>수업 속도 {session.pace || "미입력"}</span>
                            {session.pageStart && (
                              <span>
                                {session.pageStart}
                                {session.pageEnd ? `–${session.pageEnd}` : ""}p
                              </span>
                            )}
                          </>
                        )}
                        {goal?.targetDate && (
                          <span>목표 기한 {goal.targetDate}</span>
                        )}
                        <span>미완료 {targetTasks.length}건</span>
                        {late > 0 && (
                          <span className={styles.warning}>
                            기한 경과 {late}건
                          </span>
                        )}
                      </div>
                      <div className={styles.rowActions}>
                        <Jump href={course ? "/timetable" : t.href}>
                          {course ? "진도 기록" : "목표 확인"}
                        </Jump>
                        <a href="#coaching-request">코칭 요청으로 이동 <ArrowUpRight size={14} /></a>
                      </div>
                    </article>
                  );
                })}
                <div className={styles.sectionTitle}>
                  <h2>
                    <CalendarDays size={18} /> 선택한 주 일정
                  </h2>
                  <Jump href="/timetable">시간표</Jump>
                </div>
                <div className={styles.scheduleSummary}>
                  <span>
                    수업{" "}
                    {data.courses.reduce(
                      (sum, c) => sum + (c.schedules?.length || c.days.length),
                      0,
                    )}
                    회 / 주
                  </span>
                  <span>고정 일정 {data.commitments.length}개</span>
                  <span>개인 일정 {agenda.length}건</span>
                </div>
                {agenda.slice(0, 5).map((e) => (
                  <div className={styles.agenda} key={e.id}>
                    <span>{e.date.slice(5)}</span>
                    <strong>{e.title}</strong>
                    <span>
                      {e.startTime || "시간 미지정"}
                      {e.endTime ? `–${e.endTime}` : ""}
                    </span>
                  </div>
                ))}
                {!agenda.length && (
                  <p className={styles.emptyLine}>
                    선택한 주에 등록된 개인 일정이 없습니다.
                  </p>
                )}
                {agenda.length > 5 && (
                  <Jump href="/timetable">
                    일정 {agenda.length}건 전체 보기
                  </Jump>
                )}
              </>
            )}
            {tab === "실행 계획" && (
              <>
                <div className={styles.sectionTitle}>
                  <h2>
                    <ListChecks size={18} /> 실행할 계획
                  </h2>
                  <Jump href="/study">계획 관리</Jump>
                </div>
                <div className={styles.filters}>
                  {["전체", "미완료", "지연", "완료"].map((f) => (
                    <button
                      key={f}
                      aria-pressed={filter === f}
                      onClick={() => setFilter(f)}
                    >
                      {f}
                    </button>
                  ))}
                </div>
                {visibleTasks.map((p) => (
                  <div className={styles.task} key={p.id}>
                    <span
                      className={p.completed ? styles.done : styles.taskDot}
                    >
                      {p.completed ? (
                        <Check size={16} />
                      ) : (
                        <ListChecks size={16} />
                      )}
                    </span>
                    <div>
                      <h3>{p.title}</h3>
                      <p>
                        {p.name} · {p.dueDate || "기한 미지정"}
                      </p>
                    </div>
                    <Jump href={p.href}>
                      {p.completed ? "기록 보기" : "실행·수정"}
                    </Jump>
                  </div>
                ))}
                {!visibleTasks.length && (
                  <div className={styles.empty}>
                    <ListChecks size={28} />
                    <h3>해당하는 계획이 없습니다</h3>
                    <Jump href="/study">학습 계획 추가</Jump>
                  </div>
                )}
                {tasks.some((p) => !p.weekStart && !p.dueDate) && (
                  <p className={styles.emptyLine}>
                    기간 미지정 계획{" "}
                    {tasks.filter((p) => !p.weekStart && !p.dueDate).length}건은{" "}
                    <Link href="/study">계획 관리</Link>에서 확인하세요.
                  </p>
                )}
              </>
            )}
            {tab === "자료·문제" && (
              <>
                <div className={styles.sectionTitle}>
                  <h2>
                    <Cloud size={18} /> Google Drive
                  </h2>
                  <button
                    className={styles.iconButton}
                    title="연동 상태 새로고침"
                    aria-label="연동 상태 새로고침"
                    disabled={loading}
                    onClick={() => {
                      setLoading(true);
                      setRevision((r) => r + 1);
                    }}
                  >
                    <RefreshCw size={17} />
                  </button>
                </div>
                <div className={styles.connection}>
                  <span>
                    {loading
                      ? "연동 확인 중"
                      : resourceErrors.includes("Drive")
                        ? "상태 확인 실패"
                        : drive?.requiresReconnect
                          ? "재연결 필요"
                          : drive?.connected
                            ? "연결됨"
                            : "연결 안 됨"}
                  </span>
                  <Jump href="/notes">연동 관리</Jump>
                </div>
                {resourceErrors.length > 0 && (
                  <p role="alert" className={styles.error}>
                    {resourceErrors.join(", ")} 정보를 불러오지 못했습니다.
                    새로고침으로 다시 시도하세요.
                  </p>
                )}
                <div className={styles.sectionTitle}>
                  <h2>
                    <FileText size={18} /> 연결된 학습 자료
                  </h2>
                  <Jump href="/notes">노트 열기</Jump>
                </div>
                <input
                  className={styles.search}
                  type="search"
                  aria-label="학습 자료 검색"
                  placeholder="자료명·과목 검색"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setNoteLimit(20);
                  }}
                />
                {loading ? (
                  <p role="status">자료 불러오는 중…</p>
                ) : scopedNotes.length ? (
                  scopedNotes.slice(0, noteLimit).map((n) => (
                    <div className={styles.resource} key={n.id}>
                      <FileText size={18} />
                      <div>
                        <h3>{n.title}</h3>
                        <p>
                          {n.linkedTitle || n.courseName || "미분류"} ·{" "}
                          {n.source}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className={styles.empty}>
                    <h3>
                      {search
                        ? "검색 결과가 없습니다"
                        : "연결된 자료가 없습니다"}
                    </h3>
                    <Jump href="/notes">자료 연결</Jump>
                  </div>
                )}
                {scopedNotes.length > noteLimit && (
                  <button
                    className={styles.loadMore}
                    onClick={() => setNoteLimit((n) => n + 20)}
                  >
                    자료 더 보기 ({noteLimit}/{scopedNotes.length})
                  </button>
                )}
                <div className={styles.sectionTitle}>
                  <h2>
                    <BookOpen size={18} /> 문제은행
                  </h2>
                  <Jump href="/problem-bank">문제 풀기</Jump>
                </div>
                <p className={styles.subtle}>
                  전체 문제은행 · 목표별 연결 미설정
                </p>
                {subjects.map((s) => (
                  <div className={styles.agenda} key={s.id}>
                    <strong>{s.name}</strong>
                    <span>{s.count}문제</span>
                  </div>
                ))}
                {!loading && !subjects.length && (
                  <p className={styles.emptyLine}>
                    등록된 문제은행 자료가 없습니다.
                  </p>
                )}
              </>
            )}
          </section>
          <CoachingRequestPanel />
        </div>
      </main>
    </div>
  );
}

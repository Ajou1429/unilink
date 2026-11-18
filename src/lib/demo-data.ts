import { isDemoMode, DEMO_MODE_KEY } from "./demo-mode";
import { getStorageUser, privateStorage } from "./private-storage";
import { mockCourses, mockNotes, mockStudyPlans } from "./mock-data";
import { getCurrentAcademicTermLabel } from "./academic-term";

/** Only seed the isolated demo namespace; never migrate these rows to an account. */
export function initializeDemoData() {
  if (!isDemoMode() || getStorageUser()) return;
  window.sessionStorage.setItem(DEMO_MODE_KEY, "1");
  const now = new Date().toISOString();
  const date = (offset = 0) => {
    const day = new Date();
    day.setDate(day.getDate() + offset);
    return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
  };
  const plans = mockStudyPlans.map((plan, index) => ({
    ...plan,
    title: ["교착상태 개념 복습", "SQL JOIN 연습", "그래프 알고리즘 구현"][
      index
    ],
    dueDate: date(index),
    createdAt: now,
  }));
  const samples: Record<string, unknown> = {
    "unilink:courses": mockCourses.map((course) => ({
      ...course,
      term: getCurrentAcademicTermLabel(),
    })),
    "unilink:course-notes": mockNotes,
    "unilink:course-plans": plans,
    "unilink:weekly-study-plans": plans,
    "unilink:monthly-events": [
      {
        id: "demo-assignment",
        title: "운영체제 과제 제출",
        date: date(1),
        startTime: "23:59",
        endTime: "",
        location: "온라인 제출",
        memo: "교착상태 예방과 회피 비교 보고서 · 공개 데모 샘플",
        color: "#4F46E5",
        createdAt: now,
      },
      {
        id: "demo-exam",
        title: "데이터베이스 시험",
        date: date(5),
        startTime: "13:00",
        endTime: "14:30",
        location: "정보관 201",
        memo: "시험 범위: SQL, 정규화, 트랜잭션",
        color: "#7C3AED",
        createdAt: now,
      },
      {
        id: "demo-team",
        title: "팀 프로젝트 회의",
        date: date(),
        startTime: "16:00",
        endTime: "17:00",
        location: "도서관",
        memo: "역할 분담 및 진행 상황 공유",
        color: "#059669",
        createdAt: now,
      },
    ],
    "unilink:work-schedules": [
      {
        id: "demo-commitment",
        title: "동아리 활동",
        days: ["화"],
        startTime: "18:00",
        endTime: "19:00",
        location: "학생회관",
        color: "#D97706",
        createdAt: now,
      },
    ],
    "unilink:personal-studies": [
      {
        id: "demo-os-review",
        title: "운영체제 자율 복습",
        category: "개인 학습",
        goal: "교착상태의 원인과 해결 방법 설명하기",
        targetDate: date(14),
        status: "active",
        color: "#4F46E5",
        createdAt: now,
      },
      {
        id: "demo-personal",
        title: "영어 자격시험 준비",
        category: "자격증",
        goal: "매일 독해 2지문, 어휘 20개",
        targetDate: date(30),
        status: "active",
        color: "#0891B2",
        createdAt: now,
      },
    ],
    "unilink:personal-study-plans": [
      {
        id: "demo-personal-plan",
        studyId: "demo-personal",
        title: "독해 2지문 풀이",
        description: "오답 원인 정리와 어휘 복습",
        dueDate: date(),
        isCompleted: false,
        createdAt: now,
      },
    ],
    "unilink:problem-bank-subjects": mockCourses.map((course) => ({
      id: `demo-subject-${course.id}`,
      name: course.name,
      courseId: course.id,
      createdAt: now,
    })),
    "unilink:problem-bank-problems": [
      "상호 배제",
      "점유와 대기",
      "비선점",
      "순환 대기",
    ].map((condition, index) => ({
      id: `demo-problem-${index}`,
      subjectId: "demo-subject-1",
      label: `${index + 1}`,
      level: index % 3,
      sourceFile: "교착상태 연습문제.pdf",
      createdAt: now,
      updatedAt: now,
      content: {
        v: 1,
        kind: "lecture",
        page: 1,
        text: `교착상태의 발생 조건 중 '${condition}'의 의미를 설명하고, 이 조건을 제거하는 예를 쓰세요.`,
        images: [],
        check: false,
        origin: "rule",
      },
    })),
    "unilink:grade-records": mockCourses
      .slice(0, 4)
      .map((course, index) => ({
        id: `demo-grade-${index}`,
        term: "2학년 1학기",
        courseName: course.name,
        credits: 3,
        grade: ["A0", "B+", "A+", "B0"][index],
        courseType: "major",
        createdAt: now,
        updatedAt: now,
      })),
    "unilink:spec-records": [
      {
        id: "demo-spec",
        category: "competition",
        title: "교내 학습 서비스 아이디어 공모전",
        award: "우수상 · 가상 예시",
        issuer: "공개 데모",
        content: "실제 수상 이력이 아닌 기능 시연용 샘플입니다.",
        acquiredAt: date().slice(0, 7),
        createdAt: now,
        updatedAt: now,
      },
    ],
    "unilink:monthly-study-goals": [
      {
        id: "demo-monthly-goal",
        month: date().slice(0, 7),
        title: "교착상태와 정규화 설명하기",
        description: "핵심 개념을 정리하고 연습문제 풀기",
        createdAt: now,
      },
    ],
    "unilink:personal-study-notes": [
      {
        id: "demo-personal-note",
        studyId: "demo-personal",
        title: "독해 오답 정리",
        content: "문장 구조와 접속사를 먼저 확인하기. 문맥으로 어휘 추론하기.",
        createdAt: now,
        updatedAt: now,
      },
    ],
    "unilink:my-notes": mockNotes.map((note) => ({
      ...note,
      title: `[샘플] ${note.title}`,
      linkedType: "course",
      linkedId: note.courseId,
      linkedTitle: note.courseName,
      source: "직접 작성",
      syncStatus: "manual",
      version: 1,
      ...(note.id === "1" ? {
        fileName: "교착상태.pdf",
        fileDataUrl: `${process.env.NODE_ENV === "production" ? "/unilink" : ""}/demo/operating-systems.pdf`,
      } : {}),
      createdAt: now,
      updatedAt: now,
    })),
  };
  for (const [key, value] of Object.entries(samples)) {
    if (privateStorage.getItem(key) === null)
      privateStorage.setItem(key, JSON.stringify(value));
  }
}

/** Reset only this tab's demo records, leaving guest/account and auth storage intact. */
export function resetDemoData() {
  if (!isDemoMode() || getStorageUser()) return;
  const prefix = "unilink:private:demo:";
  for (const key of Object.keys(window.sessionStorage)) {
    if (key.startsWith(prefix)) window.sessionStorage.removeItem(key);
  }
  initializeDemoData();
}

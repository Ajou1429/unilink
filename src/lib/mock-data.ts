import { Course, LectureNote, Post, StudyPlan } from "./types";

export const COURSE_COLORS = [
  "#4F46E5",
  "#7C3AED",
  "#DB2777",
  "#DC2626",
  "#D97706",
  "#059669",
  "#0891B2",
  "#2563EB",
];

export const mockCourses: Course[] = [
  {
    id: "1",
    name: "운영체제",
    professor: "김철수",
    location: "공학관 301",
    color: "#4F46E5",
    days: ["월", "수"],
    startTime: "09:00",
    endTime: "10:30",
    credits: 3,
  },
  {
    id: "2",
    name: "데이터베이스",
    professor: "이영희",
    location: "정보관 201",
    color: "#7C3AED",
    days: ["화", "목"],
    startTime: "13:00",
    endTime: "14:30",
    credits: 3,
  },
  {
    id: "3",
    name: "알고리즘",
    professor: "박민준",
    location: "공학관 101",
    color: "#059669",
    days: ["월", "수", "금"],
    startTime: "11:00",
    endTime: "12:00",
    credits: 3,
  },
  {
    id: "4",
    name: "소프트웨어공학",
    professor: "최지우",
    location: "공학관 202",
    color: "#DB2777",
    days: ["목"],
    startTime: "15:00",
    endTime: "18:00",
    credits: 3,
  },
  {
    id: "5",
    name: "영어회화",
    professor: "John Smith",
    location: "인문관 105",
    color: "#D97706",
    days: ["금"],
    startTime: "10:00",
    endTime: "12:00",
    credits: 2,
  },
];

export const mockPosts: Post[] = [
  {
    id: "1",
    authorId: "u1",
    authorName: "익명",
    isAnonymous: true,
    category: "질문",
    title: "운영체제 중간고사 범위 어디까지인가요?",
    content:
      "교수님이 말씀하신 범위가 기억이 안 나는데 혹시 3장까지라고 하신 게 맞나요?",
    likes: 12,
    commentCount: 8,
    courseId: "1",
    createdAt: "2024-03-20T10:30:00Z",
  },
  {
    id: "2",
    authorId: "u2",
    authorName: "익명",
    isAnonymous: true,
    category: "정보",
    title: "도서관 스터디룸 예약 팁 공유",
    content:
      "오전 7시에 예약이 열리는데 바로 들어가면 원하는 시간대를 잡기 쉽습니다.",
    likes: 45,
    commentCount: 15,
    createdAt: "2024-03-19T14:00:00Z",
  },
  {
    id: "3",
    authorId: "u3",
    authorName: "익명",
    isAnonymous: true,
    category: "자유",
    title: "학생식당 오늘 메뉴 괜찮나요?",
    content:
      "오늘 학식 먹어본 분 있나요? 점심 메뉴 추천받습니다.",
    likes: 28,
    commentCount: 32,
    createdAt: "2024-03-19T12:30:00Z",
  },
  {
    id: "4",
    authorId: "u4",
    authorName: "익명",
    isAnonymous: true,
    category: "시험",
    title: "알고리즘 기말 후기",
    content:
      "생각보다 어렵지는 않았고 동적 계획법과 그래프 기본 문제가 주로 나왔습니다.",
    likes: 67,
    commentCount: 21,
    createdAt: "2024-03-18T18:00:00Z",
  },
  {
    id: "5",
    authorId: "u5",
    authorName: "익명",
    isAnonymous: true,
    category: "정보",
    title: "인턴 지원 후기 공유합니다",
    content:
      "카카오 인턴 1차 합격했습니다. 코딩 테스트는 백준 골드 수준이면 충분했고 자기소개서가 중요했습니다.",
    likes: 89,
    commentCount: 43,
    createdAt: "2024-03-17T09:00:00Z",
  },
];

export const mockStudyPlans: StudyPlan[] = [
  {
    id: "1",
    userId: "u1",
    courseId: "1",
    courseName: "운영체제",
    week: 8,
    title: "중간고사 대비 복습",
    description: "1~7주차 강의 내용 복습, 예상 문제 풀기",
    dueDate: "2024-03-25",
    isCompleted: false,
    createdAt: "2024-03-20T00:00:00Z",
  },
  {
    id: "2",
    userId: "u1",
    courseId: "2",
    courseName: "데이터베이스",
    week: 8,
    title: "SQL 연습 문제 풀기",
    description: "JOIN, 서브쿼리 관련 문제 20개",
    dueDate: "2024-03-22",
    isCompleted: true,
    createdAt: "2024-03-18T00:00:00Z",
  },
  {
    id: "3",
    userId: "u1",
    courseId: "3",
    courseName: "알고리즘",
    week: 8,
    title: "그래프 알고리즘 구현",
    description: "교재 7장 예제 코드를 직접 구현해보기",
    dueDate: "2024-03-27",
    isCompleted: false,
    createdAt: "2024-03-20T00:00:00Z",
  },
];

export const mockNotes: LectureNote[] = [
  {
    id: "1",
    userId: "u1",
    courseId: "1",
    courseName: "운영체제",
    week: 7,
    title: "7주차 - 교착상태(Deadlock)",
    content: `## 교착상태란?
두 개 이상의 프로세스가 서로 상대방의 작업이 끝나기만 기다리며 멈춘 상태입니다.

## 발생 조건
1. 상호 배제
2. 점유와 대기
3. 비선점
4. 순환 대기

## 해결 방법
- 예방: 발생 조건 중 하나를 제거
- 회피: 안전 상태를 유지하도록 자원 할당
- 탐지와 복구: 교착상태 발생 후 해결`,
    tags: ["교착상태", "Deadlock", "운영체제"],
    createdAt: "2024-03-18T10:00:00Z",
    updatedAt: "2024-03-18T11:30:00Z",
  },
  {
    id: "2",
    userId: "u1",
    courseId: "2",
    courseName: "데이터베이스",
    week: 7,
    title: "7주차 - 정규화",
    content: `## 정규화 목적
데이터 중복을 줄이고 이상 현상을 방지합니다.

## 정규화 단계
- 1NF: 원자값만 포함
- 2NF: 부분 함수 종속 제거
- 3NF: 이행 함수 종속 제거
- BCNF: 모든 결정자가 후보키`,
    tags: ["정규화", "함수종속", "DB"],
    createdAt: "2024-03-19T14:00:00Z",
    updatedAt: "2024-03-19T15:00:00Z",
  },
];

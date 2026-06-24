import { Course, Post, StudyPlan, LectureNote, LectureSession, SessionAnalysis } from './types'

export const COURSE_COLORS = [
  '#4F46E5', '#7C3AED', '#DB2777', '#DC2626',
  '#D97706', '#059669', '#0891B2', '#2563EB',
]

export const mockCourses: Course[] = [
  {
    id: '1',
    name: '운영체제',
    professor: '김철수',
    location: '공학관 301',
    color: '#4F46E5',
    days: ['월', '수'],
    startTime: '09:00',
    endTime: '10:30',
    credits: 3,
  },
  {
    id: '2',
    name: '데이터베이스',
    professor: '이영희',
    location: '정보관 201',
    color: '#7C3AED',
    days: ['화', '목'],
    startTime: '13:00',
    endTime: '14:30',
    credits: 3,
  },
  {
    id: '3',
    name: '알고리즘',
    professor: '박민수',
    location: '공학관 101',
    color: '#059669',
    days: ['월', '수', '금'],
    startTime: '11:00',
    endTime: '12:00',
    credits: 3,
  },
  {
    id: '4',
    name: '소프트웨어공학',
    professor: '최지원',
    location: '공학관 202',
    color: '#DB2777',
    days: ['화'],
    startTime: '15:00',
    endTime: '18:00',
    credits: 3,
  },
  {
    id: '5',
    name: '영어회화',
    professor: 'John Smith',
    location: '인문관 105',
    color: '#D97706',
    days: ['금'],
    startTime: '10:00',
    endTime: '12:00',
    credits: 2,
  },
]

export const mockPosts: Post[] = [
  {
    id: '1',
    authorId: 'u1',
    authorName: '익명',
    isAnonymous: true,
    category: '질문',
    title: '운영체제 중간고사 범위 어디까지인가요?',
    content: '교수님이 말씀하신 범위가 기억이 잘 안나는데 혹시 아시는 분 계신가요? 3장까지라고 하신 것 같은데...',
    likes: 12,
    commentCount: 8,
    courseId: '1',
    createdAt: '2024-03-20T10:30:00Z',
  },
  {
    id: '2',
    authorId: 'u2',
    authorName: '익명',
    isAnonymous: true,
    category: '정보',
    title: '도서관 스터디룸 예약 꿀팁 공유',
    content: '오전 7시에 예약 풀리는데 그 때 바로 들어가면 원하는 시간대 잡을 수 있어요. 앱으로도 되니까 알람 맞춰두세요!',
    likes: 45,
    commentCount: 15,
    createdAt: '2024-03-19T14:00:00Z',
  },
  {
    id: '3',
    authorId: 'u3',
    authorName: '익명',
    isAnonymous: true,
    category: '자유',
    title: '학식 오늘 뭐 맛있었나요?',
    content: '저는 오늘 돈까스 먹었는데 맛있더라고요. 다들 점심 뭐 드셨어요?',
    likes: 28,
    commentCount: 32,
    createdAt: '2024-03-19T12:30:00Z',
  },
  {
    id: '4',
    authorId: 'u4',
    authorName: '익명',
    isAnonymous: true,
    category: '시험',
    title: '알고리즘 기말 후기 (스포 없음)',
    content: '생각보다 어렵지 않았어요. 동적프로그래밍 위주로 나왔고 그래프는 기본 문제들만 나왔습니다.',
    likes: 67,
    commentCount: 21,
    createdAt: '2024-03-18T18:00:00Z',
  },
  {
    id: '5',
    authorId: 'u5',
    authorName: '익명',
    isAnonymous: true,
    category: '정보',
    title: '인턴십 지원 후기 공유합니다',
    content: '카카오 인턴 1차 합격했습니다. 코테는 백준 골드 수준이면 충분한 것 같아요. 자소서가 더 중요한 것 같더라고요.',
    likes: 89,
    commentCount: 43,
    createdAt: '2024-03-17T09:00:00Z',
  },
]

export const mockStudyPlans: StudyPlan[] = [
  {
    id: '1',
    userId: 'u1',
    courseId: '1',
    courseName: '운영체제',
    week: 8,
    title: '중간고사 대비 복습',
    description: '1~7주차 강의 내용 복습, 예상 문제 풀기',
    dueDate: '2024-03-25',
    isCompleted: false,
    createdAt: '2024-03-20T00:00:00Z',
  },
  {
    id: '2',
    userId: 'u1',
    courseId: '2',
    courseName: '데이터베이스',
    week: 8,
    title: 'SQL 연습 문제 풀기',
    description: 'JOIN, 서브쿼리 관련 문제 20개',
    dueDate: '2024-03-22',
    isCompleted: true,
    createdAt: '2024-03-18T00:00:00Z',
  },
  {
    id: '3',
    userId: 'u1',
    courseId: '3',
    courseName: '알고리즘',
    week: 8,
    title: '그리디 알고리즘 구현',
    description: '교재 7장 예제 코드 직접 구현해보기',
    dueDate: '2024-03-27',
    isCompleted: false,
    createdAt: '2024-03-20T00:00:00Z',
  },
]

export const mockNotes: LectureNote[] = [
  {
    id: '1',
    userId: 'u1',
    courseId: '1',
    courseName: '운영체제',
    week: 7,
    title: '7주차 - 교착상태(Deadlock)',
    content: `## 교착상태란?
두 개 이상의 프로세스가 서로 상대방의 작업이 끝나기를 기다리며 영원히 대기하는 상태

## 발생 조건 (4가지 모두 충족 시)
1. **상호 배제** - 자원은 한 번에 하나의 프로세스만 사용
2. **점유와 대기** - 최소한 하나의 자원을 점유하며 다른 자원 대기
3. **비선점** - 강제로 자원 빼앗기 불가
4. **순환 대기** - 프로세스 간 순환 형태의 대기

## 해결 방법
- **예방**: 조건 중 하나 제거
- **회피**: 은행원 알고리즘
- **탐지/복구**: 교착상태 감지 후 해결`,
    tags: ['교착상태', 'Deadlock', '운영체제'],
    createdAt: '2024-03-18T10:00:00Z',
    updatedAt: '2024-03-18T11:30:00Z',
  },
  {
    id: '2',
    userId: 'u1',
    courseId: '2',
    courseName: '데이터베이스',
    week: 7,
    title: '7주차 - 정규화',
    content: `## 정규화 목적
데이터 중복 제거, 이상 현상 방지

## 정규형 단계
- **1NF**: 원자값만 포함
- **2NF**: 1NF + 부분 함수 종속 제거
- **3NF**: 2NF + 이행 함수 종속 제거
- **BCNF**: 모든 결정자가 후보키`,
    tags: ['정규화', '함수종속', 'DB'],
    createdAt: '2024-03-19T14:00:00Z',
    updatedAt: '2024-03-19T15:00:00Z',
  },
]

export const mockSessions: LectureSession[] = [
  {
    id: 's1',
    userId: 'u1',
    courseId: '1',
    courseName: '운영체제',
    week: 8,
    date: '2026-06-23',
    slideText: `## 8주차: 가상 메모리\n\n### 페이징(Paging)\n- 물리 메모리를 고정 크기 프레임으로 분할\n- 논리 메모리를 동일 크기 페이지로 분할\n- 페이지 테이블로 논리→물리 주소 변환\n\n### TLB (Translation Lookaside Buffer)\n- 페이지 테이블 캐시\n- 히트율이 성능에 직결\n\n### 페이지 교체 알고리즘\n- FIFO: 가장 오래된 페이지 교체\n- LRU: 가장 오래 사용 안 한 페이지\n- LFU: 사용 빈도 가장 낮은 페이지`,
    highlightedText: `TLB 히트율 = 성능 핵심 (시험 출제 예정)\n페이지 폴트 처리 순서 암기 필요\nBélády의 이상현상: FIFO에서만 발생`,
    extraNotes: `교수님이 LRU 구현 방법 두 가지 물어볼 것 같다고 하심\n스택 방식 vs 카운터 방식 정리할 것`,
    status: 'done',
    driveSummaryUrl: 'https://drive.google.com/mock/summary/s1',
    createdAt: '2026-06-23T10:30:00Z',
    updatedAt: '2026-06-23T11:00:00Z',
  },
  {
    id: 's2',
    userId: 'u1',
    courseId: '2',
    courseName: '데이터베이스',
    week: 8,
    date: '2026-06-23',
    slideText: `## 8주차: 트랜잭션\n\n### ACID 속성\n- Atomicity: 원자성\n- Consistency: 일관성\n- Isolation: 격리성\n- Durability: 지속성\n\n### 동시성 제어\n- 잠금(Locking)\n- 타임스탬프\n- 낙관적 동시성 제어`,
    highlightedText: `ACID 네 가지 반드시 설명 가능해야 함`,
    extraNotes: `Dirty Read, Non-repeatable Read, Phantom Read 차이 정리`,
    status: 'processing',
    createdAt: '2026-06-23T13:00:00Z',
    updatedAt: '2026-06-23T13:05:00Z',
  },
  {
    id: 's3',
    userId: 'u1',
    courseId: '3',
    courseName: '알고리즘',
    week: 8,
    date: '2026-06-24',
    slideText: '',
    highlightedText: '',
    extraNotes: '',
    status: 'pending',
    createdAt: '2026-06-24T11:00:00Z',
    updatedAt: '2026-06-24T11:00:00Z',
  },
]

export const mockAnalyses: Record<string, SessionAnalysis> = {
  s1: {
    id: 'a1',
    sessionId: 's1',
    progressSummary: `## 8주차 진도 정리: 가상 메모리

### 핵심 개념
- **페이징**: 논리/물리 메모리를 동일 크기로 분할하여 불연속 할당 가능
- **페이지 테이블**: 논리→물리 주소 변환 구조체
- **TLB**: 페이지 테이블 캐시 → 히트 시 1 사이클, 미스 시 메모리 접근 추가

### 페이지 교체 알고리즘 비교
| 알고리즘 | 특징 | 단점 |
|------|------|------|
| FIFO | 구현 단순 | Bélády 이상현상 |
| LRU | 최적에 가까움 | 구현 비용 |
| LFU | 빈도 기반 | 초기 급증 문제 |`,
    conceptSummary: `### 보충 개념

**Working Set 이론**: 프로세스가 특정 시간 동안 실제로 사용하는 페이지 집합. 스레싱(Thrashing) 방지의 기반이 됩니다.

**Demand Paging**: 실제 필요 시점에만 페이지를 메모리에 올리는 전략. 초기 로딩 시간 단축, 메모리 효율 향상.

**Copy-on-Write(COW)**: fork() 시 페이지를 즉시 복사하지 않고 쓰기 발생 시점에 복사 → 효율적인 프로세스 생성.`,
    comprehensionScore: 82,
    comprehensionNotes: `**잘 정리된 부분**: 페이징 기본 개념, 페이지 교체 알고리즘 3종 비교

**보완 필요**: TLB 히트율 계산 공식 (EAT = hit_ratio × 1 + (1-hit_ratio) × 2), Bélády 이상현상 구체적 예시

**오개념 주의**: LRU와 LFU 혼동 가능성 있음 — LRU는 시간 기반, LFU는 빈도 기반임을 명확히 구분할 것`,
    teacherEmphasis: `- TLB 히트율이 성능에 직결 (시험 출제 예정)
- 페이지 폴트 처리 6단계 순서 암기
- Bélády 이상현상은 FIFO에서만 발생 (LRU는 해당 없음)
- LRU 구현 방법: 스택 방식 vs 카운터 방식 비교`,
    noteSummary: `**LRU 구현 두 가지 방법**
1. 스택 방식: 참조 시 스택 최상단으로 이동 → O(n)
2. 카운터 방식: 타임스탬프 저장 → 검색 시 O(n)
→ 실제 구현은 시계 알고리즘(Clock Algorithm) 사용으로 근사`,
    studyPlanSuggestion: `- **오늘 (30분)**: TLB EAT 계산 공식 암기 및 예제 2문제 풀기
- **내일 (1시간)**: 페이지 교체 알고리즘 trace 시뮬레이션 직접 해보기
- **주말 (2시간)**: 교수님 강조 Bélády 이상현상 예시 + LRU 구현 2가지 방법 코드로 작성`,
    driveUrl: 'https://drive.google.com/mock/summary/s1/analysis.md',
    createdAt: '2026-06-23T11:05:00Z',
  },
}

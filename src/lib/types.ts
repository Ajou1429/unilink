export interface User {
  id: string
  email: string
  name: string
  university: string
  studentId: string
  avatar?: string
  createdAt: string
}

export interface Course {
  id: string
  name: string
  professor: string
  location: string
  color: string
  days: DayOfWeek[]
  startTime: string // "09:00"
  endTime: string   // "10:30"
  credits: number
}

export type DayOfWeek = '월' | '화' | '수' | '목' | '금'

export interface Timetable {
  id: string
  userId: string
  semester: string // "2024-1"
  courses: Course[]
}

export interface Post {
  id: string
  authorId: string
  authorName: string // "익명" or name
  isAnonymous: boolean
  category: PostCategory
  title: string
  content: string
  likes: number
  commentCount: number
  courseId?: string
  createdAt: string
}

export type PostCategory = '자유' | '질문' | '정보' | '수업' | '시험'

export interface Comment {
  id: string
  postId: string
  authorName: string
  isAnonymous: boolean
  content: string
  likes: number
  createdAt: string
}

export interface StudyPlan {
  id: string
  userId: string
  courseId: string
  courseName: string
  week: number
  title: string
  description: string
  dueDate: string
  isCompleted: boolean
  createdAt: string
}

export interface LectureNote {
  id: string
  userId: string
  courseId: string
  courseName: string
  week: number
  title: string
  content: string
  tags: string[]
  createdAt: string
  updatedAt: string
}

// ─── 로드맵 Phase 3~5: 수업 세션 & AI 분석 ───────────────────────────

export type SessionStatus = 'pending' | 'processing' | 'done' | 'error'

export interface LectureSession {
  id: string
  userId: string
  courseId: string
  courseName: string
  week: number
  date: string                // "2026-06-24"
  slideText: string           // 슬라이드에서 추출한 텍스트
  highlightedText: string     // 형광펜 강조 영역 텍스트 (교수 강조 내용)
  extraNotes: string          // 추가 여백 필기 메모
  status: SessionStatus
  driveRawUrl?: string        // Drive raw 패키지 링크
  driveSummaryUrl?: string    // Drive 정리본 링크
  createdAt: string
  updatedAt: string
}

export interface SessionAnalysis {
  id: string
  sessionId: string
  progressSummary: string      // ① 진도 정리: 해당 주차 핵심 요약
  conceptSummary: string       // ② 추가 개념 정리: 보충 배경 설명
  comprehensionScore: number   // ③ 이해도 점수 (0–100)
  comprehensionNotes: string   // ③ 이해도 분석 및 취약 구간
  teacherEmphasis: string      // ④ 교수 강조 내용 (형광펜 기반)
  noteSummary: string          // ⑤ 추가 필기 정리
  studyPlanSuggestion: string  // 다음 복습 권장 계획
  driveUrl?: string            // Drive에 저장된 정리본 URL
  createdAt: string
}

export interface DriveFolder {
  semester: string
  courseName: string
  rootFolderId?: string
  rawFolderId?: string
  summaryFolderId?: string
  planFolderId?: string
}

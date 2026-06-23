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

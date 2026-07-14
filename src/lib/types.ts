export interface User {
  id: string;
  email: string;
  name: string;
  university: string;
  studentId: string;
  avatar?: string;
  createdAt: string;
}

export type DayOfWeek = "월" | "화" | "수" | "목" | "금";

export interface Course {
  id: string;
  term?: string;
  courseType?: "major" | "non-major";
  name: string;
  professor: string;
  location: string;
  color: string;
  days: DayOfWeek[];
  startTime: string;
  endTime: string;
  credits: number;
}

export interface Timetable {
  id: string;
  userId: string;
  semester: string;
  courses: Course[];
}

export type PostCategory = "자유" | "질문" | "정보" | "수업" | "시험";

export interface Post {
  id: string;
  authorId: string;
  authorName: string;
  isAnonymous: boolean;
  category: PostCategory;
  title: string;
  content: string;
  likes: number;
  commentCount: number;
  courseId?: string;
  createdAt: string;
}

export interface Comment {
  id: string;
  postId: string;
  authorName: string;
  isAnonymous: boolean;
  content: string;
  likes: number;
  createdAt: string;
}

export interface StudyPlan {
  id: string;
  userId: string;
  courseId: string;
  courseName: string;
  week: number;
  weekStart?: string;
  title: string;
  description: string;
  dueDate: string;
  isCompleted: boolean;
  createdAt: string;
}

export interface LectureNote {
  id: string;
  userId: string;
  courseId: string;
  courseName: string;
  week: number;
  title: string;
  content: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

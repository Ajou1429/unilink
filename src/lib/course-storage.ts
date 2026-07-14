import { Course, LectureNote, StudyPlan } from "./types";
import { getCurrentAcademicTermLabel } from "./academic-term";

export const COURSES_STORAGE_KEY = "unilink:courses";
export const COURSE_NOTES_STORAGE_KEY = "unilink:course-notes";
export const COURSE_PLANS_STORAGE_KEY = "unilink:course-plans";
export const COURSE_FILES_STORAGE_KEY = "unilink:course-files";
export const COURSES_CHANGED_EVENT = "unilink:coursesChanged";

export interface CourseFile {
  id: string;
  courseId: string;
  name: string;
  type: string;
  size: number;
  createdAt: string;
}

function normalizeCourse(course: Course, fallbackTerm = getCurrentAcademicTermLabel()): Course {
  return {
    ...course,
    term: course.term ?? fallbackTerm,
    courseType: course.courseType ?? "major",
  };
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;

  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function getAllStoredCourses(): Course[] {
  return readJson<Course[]>(COURSES_STORAGE_KEY, []).map((course) =>
    normalizeCourse(course),
  );
}

export function getStoredCourses(term = getCurrentAcademicTermLabel()): Course[] {
  return getAllStoredCourses().filter((course) => course.term === term);
}

export function saveStoredCourses(courses: Course[], term?: string) {
  if (term) {
    const otherTermCourses = getAllStoredCourses().filter(
      (course) => course.term !== term,
    );
    writeJson(COURSES_STORAGE_KEY, [
      ...otherTermCourses,
      ...courses.map((course) => normalizeCourse(course, term)),
    ]);
  } else {
    writeJson(
      COURSES_STORAGE_KEY,
      courses.map((course) => normalizeCourse(course)),
    );
  }
  window.dispatchEvent(new Event(COURSES_CHANGED_EVENT));
}

export function getCourseNotes(courseId: string): LectureNote[] {
  return readJson<LectureNote[]>(COURSE_NOTES_STORAGE_KEY, []).filter(
    (note) => note.courseId === courseId,
  );
}

export function saveCourseNote(note: LectureNote) {
  const notes = readJson<LectureNote[]>(COURSE_NOTES_STORAGE_KEY, []);
  writeJson(COURSE_NOTES_STORAGE_KEY, [note, ...notes]);
}

export function getCoursePlans(courseId: string): StudyPlan[] {
  return readJson<StudyPlan[]>(COURSE_PLANS_STORAGE_KEY, []).filter(
    (plan) => plan.courseId === courseId,
  );
}

export function saveCoursePlan(plan: StudyPlan) {
  const plans = readJson<StudyPlan[]>(COURSE_PLANS_STORAGE_KEY, []);
  writeJson(COURSE_PLANS_STORAGE_KEY, [plan, ...plans]);
}

export function getCourseFiles(courseId: string): CourseFile[] {
  return readJson<CourseFile[]>(COURSE_FILES_STORAGE_KEY, []).filter(
    (file) => file.courseId === courseId,
  );
}

export function saveCourseFile(file: CourseFile) {
  const files = readJson<CourseFile[]>(COURSE_FILES_STORAGE_KEY, []);
  writeJson(COURSE_FILES_STORAGE_KEY, [file, ...files]);
}

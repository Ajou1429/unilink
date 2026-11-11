import { privateStorage } from "./private-storage.ts";
import type { Course, LectureNote, StudyPlan } from "./types";
import { getCurrentAcademicTermLabel, parseAcademicTerm, sortAcademicTerms } from "./academic-term.ts";

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
    const raw = privateStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  privateStorage.setItem(key, JSON.stringify(value));
}

export function getAllStoredCourses(): Course[] {
  return readJson<Course[]>(COURSES_STORAGE_KEY, []).map((course) =>
    normalizeCourse(course),
  );
}

export function getStoredCourses(term = getCurrentAcademicTermLabel()): Course[] {
  return getAllStoredCourses().filter((course) => course.term === term);
}

/**
 * 지금 학기 수업. 현재 학기에 수업이 없으면(방학 중 계절학기 등) 지금보다 이전인 학기 중
 * 가장 최근에 수업이 있는 학기를 대신 쓴다. 학기가 바뀌면 자동으로 그 학기 수업으로 바뀐다.
 */
export function getActiveTermCourses(now = new Date()): { term: string; courses: Course[] } {
  const current = getCurrentAcademicTermLabel(now);
  const all = getAllStoredCourses();
  const currentCourses = all.filter((course) => course.term === current);
  if (currentCourses.length) return { term: current, courses: currentCourses };
  const ordered = sortAcademicTerms([current, ...all.map((course) => course.term ?? "")].filter((term) => parseAcademicTerm(term)));
  const earlier = ordered.slice(0, ordered.indexOf(current)).reverse();
  const term = earlier.find((item) => all.some((course) => course.term === item));
  return term ? { term, courses: all.filter((course) => course.term === term) } : { term: current, courses: [] };
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

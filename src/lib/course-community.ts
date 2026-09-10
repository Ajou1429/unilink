import type { CatalogSection } from "./ajou-catalog";
import type { Course, CourseBoardReference, Post } from "./types";

export interface BoardSection {
  registrationNumber: string;
  courseId: string;
  professor: string;
  schedule: string;
  department: string;
  mine: boolean;
}
export interface CourseBoard {
  key: string;
  name: string;
  term: string;
  university: string;
  courseCode: string;
  sections: BoardSection[];
  myCourseIds: string[];
  archived?: boolean;
}

export function catalogBoardKey(term: string, subjectId: string, courseCode: string, registrationNumber: string) {
  return `ajou:${encodeURIComponent(term)}:${subjectId || courseCode || registrationNumber}`;
}

export function courseBoardKey(course: Course) {
  const term = course.term || "학기 미지정";
  return course.catalogSource === "ajou"
    ? catalogBoardKey(term, course.catalogSubjectId || "", course.courseCode || "", course.registrationNumber || course.id)
    : `local:${encodeURIComponent(term)}:${encodeURIComponent(course.id)}`;
}

export function buildCourseBoards(courses: Course[], catalog: CatalogSection[], catalogTerm: string, posts: Post[] = []): CourseBoard[] {
  const boards = new Map<string, CourseBoard>();
  const catalogByRegistration = new Map(catalog.map((s) => [s.registrationNumber, s]));
  for (const section of catalog) {
    const key = catalogBoardKey(catalogTerm, section.subjectId, section.courseCode, section.registrationNumber);
    const board: CourseBoard = boards.get(key) || { key, name: section.name, term: catalogTerm, university: "아주대학교", courseCode: section.courseCode, sections: [], myCourseIds: [] };
    board.sections.push({ registrationNumber: section.registrationNumber, courseId: `ajou-2026-2-${section.registrationNumber}`, professor: section.professor, schedule: section.rawSchedule, department: section.department, mine: false });
    boards.set(key, board);
  }
  for (const course of courses) {
    const section = course.catalogSource === "ajou" && course.term === catalogTerm && course.registrationNumber ? catalogByRegistration.get(course.registrationNumber) : undefined;
    const key = section ? catalogBoardKey(catalogTerm, section.subjectId, section.courseCode, section.registrationNumber) : courseBoardKey(course);
    const board: CourseBoard = boards.get(key) || { key, name: course.name, term: course.term || "학기 미지정", university: course.catalogSource === "ajou" ? "아주대학교" : "직접 추가한 수업", courseCode: course.courseCode || "", sections: [], myCourseIds: [] };
    if (!board.myCourseIds.includes(course.id)) board.myCourseIds.push(course.id);
    const existing = board.sections.find((s) => s.registrationNumber === (course.registrationNumber || course.id));
    if (existing) existing.mine = true;
    else board.sections.push({ registrationNumber: course.registrationNumber || course.id, courseId: course.id, professor: course.professor, schedule: course.originalSchedule || `${course.days.join("·")} ${course.startTime}–${course.endTime}`, department: "", mine: true });
    boards.set(key, board);
  }
  for (const post of posts) {
    const reference = post.courseBoard;
    if (reference && !boards.has(reference.key)) boards.set(reference.key, { ...reference, sections: [], myCourseIds: [], archived: true });
  }
  return [...boards.values()].sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

export function resolvePostBoardKey(post: Post, boards: CourseBoard[]) {
  if (post.courseBoard) return post.courseBoard.key;
  if (!post.courseId) return null;
  return boards.find((b) => b.myCourseIds.includes(post.courseId!) || b.sections.some((s) => s.courseId === post.courseId))?.key || "legacy";
}

export function matchesBoardSearch(board: CourseBoard, query: string) {
  const normalized = [board.name, board.courseCode, ...board.sections.flatMap((s) => [s.registrationNumber, s.professor, s.department])].join(" ").toLowerCase().replace(/\s+/g, "");
  return query.trim().toLowerCase().split(/\s+/).every((part) => normalized.includes(part));
}

export function referenceForBoard(board: CourseBoard, sectionNumber = ""): CourseBoardReference {
  const section = sectionNumber ? board.sections.find((s) => s.registrationNumber === sectionNumber) : undefined;
  if (sectionNumber && !section) throw new Error("선택한 분반을 확인해주세요.");
  return { key: board.key, name: board.name, term: board.term, university: board.university, courseCode: board.courseCode,
    ...(section ? { registrationNumber: section.registrationNumber, professor: section.professor } : {}) };
}

export function filterCoursePosts(posts: Post[], boards: CourseBoard[], options: { view: string; term: string; section?: string; category?: string; search?: string; sort?: string }) {
  const myKeys = new Set(boards.filter((b) => b.term === options.term && b.myCourseIds.length).map((b) => b.key));
  return posts.filter((p) => {
    const key = resolvePostBoardKey(p, boards);
    const inView = options.view === "my" ? key !== null && myKeys.has(key)
      : options.view === "general" ? key === null : key === options.view;
    const legacySection = p.courseId && !p.courseBoard ? boards.flatMap((b) => b.sections).find((s) => s.courseId === p.courseId)?.registrationNumber : undefined;
    const section = p.courseBoard?.registrationNumber || legacySection;
    const query = (options.search || "").trim().toLowerCase();
    return inView && (!options.section || !section || section === options.section) &&
      (!options.category || p.category === options.category) &&
      (!query || [p.title, p.content, p.courseBoard?.name || ""].some((s) => s.toLowerCase().includes(query)));
  }).sort((a, b) => options.sort === "popular" ? b.likes - a.likes || b.createdAt.localeCompare(a.createdAt) : b.createdAt.localeCompare(a.createdAt));
}

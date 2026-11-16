import { extractLabels } from "../problem-bank-labels.ts";

// AI를 부르기 전에 브라우저에서 하는 1차 분류. 확실한 경우에는 AI 호출을 건너뛰어 토큰을 아낀다.

export const DOC_TYPES = ["syllabus", "lecture", "notes", "problem_set", "assignment", "other"] as const;
export type DocType = (typeof DOC_TYPES)[number];

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  syllabus: "강의계획서",
  lecture: "강의자료",
  notes: "필기",
  problem_set: "문제은행",
  assignment: "과제",
  other: "기타",
};

export function docTypeFromLabel(label: string): DocType | null {
  return DOC_TYPES.find((type) => DOC_TYPE_LABELS[type] === label) ?? null;
}

export interface MatchCourse {
  id: string;
  name: string;
  courseCode?: string;
}

export interface LocalGuess {
  type: DocType | null;
  typeConfident: boolean;
  courseId: string | null;
  courseConfident: boolean;
}

const compact = (value: string) => value.replace(/\s+/g, "").toLowerCase();

const SYLLABUS = /강의\s*계획서|수업\s*계획서|syllabus|course\s*outline/i;
const SYLLABUS_DETAIL = /성적\s*(평가|반영)|평가\s*(방법|비율|기준)|grading|evaluation|주차별|교재|수업\s*목표|담당\s*교수/i;
const PROBLEM = /연습\s*문제|문제\s*은행|exercises?\b|problems?\b|homework|\bhw\s*\d|과제\s*\d|퀴즈|quiz|기출|예제\s*문제/i;
const ASSIGNMENT = /과제|assignment|레포트|report|제출\s*(기한|마감)|due\s*date/i;
const LECTURE = /lecture|chapter|강의|\bch\.?\s*\d|week\s*\d|\d+\s*주차|slide/i;

/** 텍스트·파일명으로 자료 종류를 추정한다. confident면 AI 없이 확정한다. */
export function guessDocType(text: string, fileName: string): { type: DocType | null; confident: boolean } {
  const head = `${fileName}\n${text.slice(0, 3000)}`;
  if (SYLLABUS.test(head)) return { type: "syllabus", confident: SYLLABUS_DETAIL.test(text) || SYLLABUS.test(fileName) };
  const labels = text.trim() ? extractLabels(text.split(/\n/)) : [];
  if (PROBLEM.test(head) && labels.length >= 3) return { type: "problem_set", confident: true };
  if (ASSIGNMENT.test(fileName) && !labels.length) return { type: "assignment", confident: false };
  const chars = text.replace(/\s/g, "").length;
  // 글자가 거의 없으면 손글씨 필기(스캔·GoodNotes)일 가능성이 높다 → 이미지로 AI 확인
  if (chars < 40) return { type: "notes", confident: false };
  if (LECTURE.test(head) && chars >= 300) return { type: "lecture", confident: true };
  return { type: chars >= 300 ? "lecture" : null, confident: false };
}

const CODE = /\b([A-Z]{2,5})[\s-]?(\d{3,4}[A-Z]?)\b/g;

/** 과목코드(예: ECE325) 또는 과목명으로 시간표 과목을 찾는다. 후보가 하나일 때만 확실하다고 본다. */
export function matchCourse(text: string, fileName: string, courses: MatchCourse[]): { courseId: string | null; confident: boolean } {
  const haystack = `${fileName}\n${text.slice(0, 4000)}`;
  const codes = new Set([...haystack.toUpperCase().matchAll(CODE)].map((m) => `${m[1]}${m[2]}`));
  const byCode = courses.filter((course) => course.courseCode && codes.has(course.courseCode.toUpperCase().replace(/[\s-]/g, "")));
  if (byCode.length === 1) return { courseId: byCode[0].id, confident: true };

  const target = compact(haystack);
  const byName = courses.filter((course) => compact(course.name).length >= 2 && target.includes(compact(course.name)));
  // "회로이론"과 "회로이론및실험"처럼 서로 포함되면 더 긴 이름을 고른다
  const longest = byName.filter((course) => !byName.some((other) => other !== course && compact(other.name).includes(compact(course.name))));
  if (longest.length === 1) {
    // 파일명에 과목명이 있으면 확실, 본문에만 있으면(다른 과목 언급일 수 있음) 덜 확실
    return { courseId: longest[0].id, confident: compact(fileName).includes(compact(longest[0].name)) || byName.length === 1 };
  }
  return { courseId: null, confident: false };
}

export function guessLocally(text: string, fileName: string, courses: MatchCourse[]): LocalGuess {
  const type = guessDocType(text, fileName);
  const course = matchCourse(text, fileName, courses);
  return { type: type.type, typeConfident: type.confident, courseId: course.courseId, courseConfident: course.confident };
}

/** 강의계획서는 항목 추출에 AI가 필요하고, 그 외에는 종류·과목이 모두 확실하면 AI를 건너뛴다. */
export function needsAiClassification(guess: LocalGuess) {
  return !(guess.typeConfident && guess.courseConfident && guess.type !== "syllabus");
}

/** 문제은행 범위: 학기 전반부(3·4·9·10월, 여름 7·8월)는 중간고사, 나머지는 기말고사 */
export function examPeriodFor(date: Date): "midterm" | "final" {
  const month = date.getMonth() + 1;
  return [3, 4, 7, 8, 9, 10].includes(month) ? "midterm" : "final";
}

/** 노트 태그에서 자료 종류 라벨(강의자료·필기 등)을 찾는다 */
export function docTypeLabelFromTags(tags: string[]): string | undefined {
  return tags.find((tag) => docTypeFromLabel(tag) !== null);
}

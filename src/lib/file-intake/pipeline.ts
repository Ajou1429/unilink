import { getCurrentAcademicTermLabel } from "../academic-term";
import { getActiveTermCourses, getAllStoredCourses, saveStoredCourses } from "../course-storage";
import { fetchDrivePdf, uploadNoteToDrive } from "../drive-connection";
import { addNote, getMyNotes, updateNoteClassification, updateNoteTags, type MyNote } from "../my-notes-storage";
import { analyzeProblemPdf, getProblemConsent, problemAiAvailable, saveAnalyzedProblems } from "../problem-bank/analyze";
import {
  createSubject, deleteFile, joinSourceFile, listSubjects, syncSubjectsWithCourses,
} from "../problem-bank-storage";
import { SCHEDULE_COLORS } from "../schedule-colors";
import { getTimetableTerms, saveTimetableTerms } from "../timetable-storage";
import type { Course } from "../types";
import { classifyWithAi, extractSyllabusWithAi, type AiCourseHint } from "./ai";
import {
  DOC_TYPE_LABELS, DOC_TYPES, examPeriodFor, guessLocally, matchCourse, needsAiClassification, type DocType,
} from "./classify-local";
import { detectKind, extractContent, MAX_INTAKE_BYTES, normalizedFile, type IntakeFileKind } from "./extract";
import { saveIntakeRecord, type IntakeRecord } from "./settings";
import {
  buildSyllabusCourse, findSyllabusCourse, mergeSyllabusIntoCourse, syllabusTerm, type SyllabusInfo,
} from "./syllabus";

export interface IntakeContext {
  /** 서버 AI 분류를 써도 되는지 (로그인 + 동의) */
  useAi: boolean;
  /** 분류한 파일을 Drive에도 올릴지 (Drive 연결 + 사용자가 켰을 때) */
  uploadToDrive: boolean;
}

/** 이번 세션에서 올린 원본 파일. 결과에서 종류·과목을 바꿀 때 문제은행 번호를 다시 뽑는 데 쓴다. */
const sessionFiles = new Map<string, File>();

const makeId = () => `intake-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const titleOf = (fileName: string) => fileName.replace(/\.[^.]+$/, "").slice(0, 200) || fileName;
const typeTags = (tags: string[]) => tags.filter((tag) => !DOC_TYPES.some((type) => DOC_TYPE_LABELS[type] === tag));

/** 분류에 쓸 과목 목록: 이번 학기(방학 중엔 직전 학기) 과목을 앞에, 같은 이름은 하나만 */
function matchableCourses(): Course[] {
  const active = getActiveTermCourses().courses;
  const all = getAllStoredCourses();
  const seen = new Set<string>();
  const activeIds = new Set(active.map((course) => course.id));
  return [...active, ...all.filter((course) => !activeIds.has(course.id))].filter((course) => {
    const key = course.name.replace(/\s+/g, "").toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const hints = (courses: Course[]): AiCourseHint[] =>
  courses.slice(0, 40).map((course) => ({ id: course.id, name: course.name, code: course.courseCode ?? null }));

interface Decision {
  docType: DocType;
  course: Course | null;
  aiUsed: boolean;
  message?: string;
}

/** 1) 브라우저에서 읽고 2) 확실하면 바로, 아니면 AI로 종류·과목을 정한다 */
async function decide(file: File, kind: IntakeFileKind, ctx: IntakeContext, courses: Course[]): Promise<Decision> {
  const extracted = await extractContent(file, kind);
  const guess = guessLocally(extracted.text, file.name, courses);
  const byId = (id: string | null) => courses.find((course) => course.id === id) ?? null;
  const fallbackType: DocType = guess.type ?? (extracted.text.trim() ? "lecture" : "notes");

  if (!needsAiClassification(guess)) return { docType: guess.type!, course: byId(guess.courseId), aiUsed: false };
  // 강의계획서가 확실하면 분류 호출 없이 항목 추출로 바로 간다
  if (guess.type === "syllabus" && guess.typeConfident) return { docType: "syllabus", course: byId(guess.courseId), aiUsed: false };
  if (!ctx.useAi) {
    return {
      docType: fallbackType, course: byId(guess.courseId), aiUsed: false,
      message: guess.courseId ? undefined : "로그인 후 AI 분류에 동의하면 과목을 더 정확히 찾을 수 있어요.",
    };
  }
  try {
    const ai = await classifyWithAi({ fileName: file.name, text: extracted.text, image: extracted.image, courses: hints(courses) });
    let course = byId(ai.course_id);
    if (!course && (ai.course_name || ai.course_code)) {
      const named = matchCourse(`${ai.course_code ?? ""} ${ai.course_name ?? ""}`, "", courses);
      course = byId(named.courseId);
    }
    return { docType: ai.doc_type, course: course ?? byId(guess.courseConfident ? guess.courseId : null), aiUsed: true };
  } catch (error) {
    return { docType: fallbackType, course: byId(guess.courseId), aiUsed: false, message: error instanceof Error ? error.message : undefined };
  }
}

type Target = { kind: "new"; file: File } | { kind: "existing"; note: MyNote; file: File };

/** 노트로 저장(새 파일) 또는 기존 Drive 노트의 분류만 바꾼다 */
async function attachNote(target: Target, course: Course | null, docType: DocType): Promise<string> {
  const label = DOC_TYPE_LABELS[docType];
  if (target.kind === "existing") {
    await updateNoteClassification(target.note.id, course ? "course" : "unassigned", course?.id, course?.name);
    await updateNoteTags(target.note.id, [...typeTags(target.note.tags), label]);
    return target.note.id;
  }
  const note = await addNote({
    title: titleOf(target.file.name),
    courseName: course?.name ?? "미분류",
    linkedType: course ? "course" : "unassigned",
    linkedId: course?.id,
    linkedTitle: course?.name,
    source: "직접 작성",
    content: "",
    file: target.file,
    fileName: target.file.name,
    fileSize: target.file.size,
    tags: [label],
  });
  return note.id;
}

async function subjectFor(course: Course) {
  await syncSubjectsWithCourses([{ id: course.id, name: course.name }]).catch(() => undefined);
  const subjects = await listSubjects();
  return subjects.find((subject) => subject.courseId === course.id)
    ?? subjects.find((subject) => subject.name.trim() === course.name.trim())
    ?? createSubject(course.name);
}

/**
 * 문제은행: 문제 파일은 문항 번호·내용을, 강의노트는 그 안의 문제를(p.12, p.12-1…) 과목의 중간/기말 범위에 저장.
 * AI 분석은 문제은행 탭에서 동의한 로그인 계정만. 동의 전에는 문제 파일의 번호와 영역 그림만 넣는다.
 */
async function addToProblemBank(file: File, course: Course, record: IntakeRecord, docType: "problem_set" | "lecture") {
  const useAi = getProblemConsent() === "granted" && await problemAiAvailable();
  if (docType === "lecture" && !useAi) return;
  try {
    const mode = docType === "lecture" ? "lecture" : "problems";
    const result = await analyzeProblemPdf(file, { mode, useAi });
    const subject = await subjectFor(course);
    const sourceFile = joinSourceFile(examPeriodFor(new Date()), file.name.slice(0, 180));
    const saved = await saveAnalyzedProblems(subject.id, sourceFile, result.problems, mode === "lecture" ? "lecture" : "problem");
    record.problemSubjectId = subject.id;
    record.problemSourceFile = sourceFile;
    record.problemCount = saved.addedCount + saved.skippedCount;
    if (saved.check) record.message = `번호 확인이 필요한 문항 ${saved.check}개가 있어요. 문제은행에서 확인해 주세요.`;
    else if (docType === "problem_set" && !useAi && getProblemConsent() === null) record.message = "문제은행 탭에서 AI 분석에 동의하면 문제 내용과 수식도 정리돼요.";
  } catch (error) {
    // 강의노트에 문제가 없으면 조용히 넘어간다
    if (docType === "problem_set") record.message = `${error instanceof Error ? error.message : "문항 번호를 찾지 못했어요."} 문제은행에서 직접 입력해 주세요.`;
  }
}

/** 강의계획서: 항목을 읽어 시간표에 과목을 추가(없을 때)하고 성적 반영비율을 저장 */
async function applySyllabus(file: File, kind: IntakeFileKind, ctx: IntakeContext, record: IntakeRecord, fallback: Course | null): Promise<Course | null> {
  if (!ctx.useAi) {
    record.message = "로그인 후 AI 분류에 동의하면 강의계획서로 시간표와 성적 반영비율을 자동으로 채워요.";
    return fallback;
  }
  let info: SyllabusInfo;
  try {
    const full = await extractContent(file, kind, 3, 6000);
    info = await extractSyllabusWithAi({ fileName: file.name, text: full.text, image: full.image });
    record.aiUsed = true;
  } catch (error) {
    record.message = error instanceof Error ? error.message : "강의계획서를 읽지 못했어요.";
    return fallback;
  }
  if (!info.course_name) {
    record.message = "강의계획서에서 과목명을 찾지 못했어요. 과목을 직접 골라 주세요.";
    return fallback;
  }
  const term = syllabusTerm(info, getCurrentAcademicTermLabel());
  const all = getAllStoredCourses();
  const termCourses = all.filter((course) => course.term === term);
  const existing = findSyllabusCourse(all, info, term);
  let course: Course;
  if (existing) {
    course = mergeSyllabusIntoCourse(existing, info);
    saveStoredCourses(termCourses.map((item) => (item.id === course.id ? course : item)), term);
  } else {
    course = buildSyllabusCourse(info, term, `syllabus-${Date.now()}`, SCHEDULE_COLORS[termCourses.length % SCHEDULE_COLORS.length]);
    saveStoredCourses([...termCourses, course], term);
    saveTimetableTerms([...getTimetableTerms(), term]);
    record.timetableAdded = true;
  }
  record.term = term;
  record.gradingCount = course.gradingWeights?.length ?? 0;
  return course;
}

function linkSyllabusNote(course: Course, noteId: string) {
  const term = course.term!;
  const termCourses = getAllStoredCourses().filter((item) => item.term === term);
  saveStoredCourses(termCourses.map((item) => (item.id === course.id ? { ...item, syllabusNoteId: noteId } : item)), term);
}

async function run(target: Target, record: IntakeRecord, ctx: IntakeContext, onUpdate: (record: IntakeRecord) => void) {
  const file = target.file;
  const kind = detectKind(file);
  if (!kind) throw new Error("PDF, 이미지(JPG·PNG), PPTX, DOCX만 넣을 수 있어요.");
  if (file.size > MAX_INTAKE_BYTES) throw new Error("20MB 이하 파일만 넣을 수 있어요.");
  const normalized = normalizedFile(file, kind);
  const courses = matchableCourses();
  const decision = await decide(normalized, kind, ctx, courses);
  record.docType = decision.docType;
  record.aiUsed = decision.aiUsed;
  if (decision.message) record.message = decision.message;
  let course = decision.course;
  onUpdate({ ...record });

  if (decision.docType === "syllabus") course = await applySyllabus(normalized, kind, ctx, record, course);
  const fileTarget: Target = target.kind === "new" ? { kind: "new", file: normalized } : { ...target, file: normalized };
  record.noteId = await attachNote(fileTarget, course, decision.docType);
  record.courseId = course?.id ?? null;
  record.courseName = course?.name;
  record.term = record.term ?? course?.term;
  if (decision.docType === "syllabus" && course) linkSyllabusNote(course, record.noteId);
  if ((decision.docType === "problem_set" || decision.docType === "lecture") && course && kind === "pdf") {
    await addToProblemBank(normalized, course, record, decision.docType);
  }
  if (!course && !record.message) record.message = "과목을 찾지 못했어요. 과목을 골라 주세요.";

  if (target.kind === "new" && ctx.uploadToDrive && course) {
    try {
      await uploadNoteToDrive(record.noteId, { term: course.term, kind: DOC_TYPE_LABELS[decision.docType] });
      record.drive = "uploaded";
    } catch (error) {
      record.drive = "failed";
      record.message = error instanceof Error ? error.message : "Drive에 올리지 못했어요.";
    }
  }
}

async function track(record: IntakeRecord, work: () => Promise<void>, onUpdate: (record: IntakeRecord) => void) {
  onUpdate({ ...record });
  try {
    await work();
    record.status = "done";
  } catch (error) {
    record.status = "error";
    record.message = error instanceof Error ? error.message : "파일을 처리하지 못했어요.";
  }
  saveIntakeRecord(record);
  onUpdate({ ...record });
  return record;
}

/** 대시보드에 넣은 파일 하나를 분류·저장한다 */
export function processUpload(file: File, ctx: IntakeContext, onUpdate: (record: IntakeRecord) => void) {
  const record: IntakeRecord = { id: makeId(), fileName: file.name, source: "upload", status: "processing", createdAt: new Date().toISOString() };
  sessionFiles.set(record.id, file);
  return track(record, () => run({ kind: "new", file }, record, ctx, onUpdate), onUpdate);
}

/** Drive에서 동기화돼 미분류로 들어온 노트를 같은 과정으로 분류한다 */
export function processDriveNote(note: MyNote, ctx: IntakeContext, onUpdate: (record: IntakeRecord) => void) {
  const record: IntakeRecord = {
    id: makeId(), fileName: note.fileName ?? note.title, source: "drive", status: "processing", noteId: note.id, createdAt: new Date().toISOString(),
  };
  return track(record, async () => {
    if (!note.driveFileId) throw new Error("Drive 파일 정보가 없어요.");
    const blob = await fetchDrivePdf(note.driveFileId);
    const file = new File([blob], note.fileName || `${note.title}.pdf`, { type: "application/pdf" });
    sessionFiles.set(record.id, file);
    await run({ kind: "existing", note, file }, record, { ...ctx, uploadToDrive: false }, onUpdate);
  }, onUpdate);
}

/** 결과 목록에서 사용자가 과목·종류를 고친다 */
export async function reassignRecord(record: IntakeRecord, change: { courseId?: string | null; docType?: DocType }): Promise<IntakeRecord> {
  const next: IntakeRecord = { ...record, message: undefined };
  const courseId = change.courseId !== undefined ? change.courseId : record.courseId ?? null;
  const docType = change.docType ?? record.docType ?? "other";
  const course = getAllStoredCourses().find((item) => item.id === courseId) ?? null;
  if (!record.noteId) throw new Error("저장된 파일 정보가 없어요.");

  const note = (await getMyNotes()).find((item) => item.id === record.noteId);
  if (!note) throw new Error("노트를 찾지 못했어요. 나의 노트에서 확인해 주세요.");
  await updateNoteClassification(note.id, course ? "course" : "unassigned", course?.id, course?.name);
  await updateNoteTags(note.id, [...typeTags(note.tags), DOC_TYPE_LABELS[docType]]);

  // 문제은행: 이전에 넣은 번호는 지우고, 새 과목·종류가 문제은행이면 다시 넣는다
  const movedProblems = record.problemSubjectId && record.problemSourceFile && (docType !== record.docType || courseId !== record.courseId);
  if (movedProblems) {
    await deleteFile(record.problemSubjectId!, record.problemSourceFile!).catch(() => undefined);
    next.problemSubjectId = undefined;
    next.problemSourceFile = undefined;
    next.problemCount = undefined;
  }
  if ((docType === "problem_set" || docType === "lecture") && course && (movedProblems || !record.problemSourceFile)) {
    const file = sessionFiles.get(record.id);
    if (file && detectKind(file) === "pdf") await addToProblemBank(file, course, next, docType);
    else if (docType === "problem_set") next.message = "문제 번호는 문제은행에서 직접 넣어 주세요.";
  }
  if (record.drive === "uploaded" && courseId !== record.courseId) next.message = "Drive에 이미 올린 파일은 원래 폴더에 남아 있어요.";

  next.courseId = course?.id ?? null;
  next.courseName = course?.name;
  next.term = course?.term ?? record.term;
  next.docType = docType;
  saveIntakeRecord(next);
  return next;
}

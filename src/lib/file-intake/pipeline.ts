import { getCurrentAcademicTermLabel } from "../academic-term";
import { captureStorageScope } from "../private-storage";
import { getActiveTermCourses, getAllStoredCourses, saveStoredCourses } from "../course-storage";
import { fetchDrivePdf, uploadNoteToDrive } from "../drive-connection";
import { addNote, getMyNotes, updateNoteClassification, updateNoteTags, type MyNote } from "../my-notes-storage";
import { analyzeProblemPdf, getProblemConsent, problemAiAvailable, saveAnalyzedProblems } from "../problem-bank/analyze";
import {
  createSubject, joinSourceFile, listSubjects, syncSubjectsWithCourses,
} from "../problem-bank-storage";
import { SCHEDULE_COLORS } from "../schedule-colors";
import { getTimetableTerms, saveTimetableTerms } from "../timetable-storage";
import type { Course } from "../types";
import { classifyWithAi, extractSyllabusWithAi, type AiCourseHint } from "./ai";
import {
  DOC_TYPE_LABELS, DOC_TYPES, examPeriodFor, guessLocally, matchCourse, needsAiClassification, syllabusScore, type DocType,
} from "./classify-local";
import { detectKind, extractContent, MAX_INTAKE_BYTES, normalizedFile, type IntakeFileKind } from "./extract";
import { saveIntakeRecord, type IntakeRecord } from "./settings";
import {
  buildSyllabusCourse, findSyllabusCourse, mergeSyllabusIntoCourse, parseAjouSyllabus, syllabusTerm, type SyllabusInfo,
} from "./syllabus";

export interface IntakeContext {
  /** 서버 AI 분류를 써도 되는지 (로그인 + 동의) */
  useAi: boolean;
  /** 분류한 파일을 Drive에도 올릴지 (Drive 연결 + 사용자가 켰을 때) */
  uploadToDrive: boolean;
  assertActive?: () => void;
}

/** 이번 세션에서 올린 원본 파일. 결과에서 종류·과목을 바꿀 때 문제은행 번호를 다시 뽑는 데 쓴다. */
const sessionFiles = new Map<string, File>();

const makeId = () => `intake-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const titleOf = (fileName: string) => fileName.replace(/\.[^.]+$/, "").slice(0, 200) || fileName;
const typeTags = (tags: string[]) => tags.filter((tag) => !DOC_TYPES.some((type) => DOC_TYPE_LABELS[type] === tag));

/** 분류에 쓸 과목 목록: 지금 진행 중인 학기(방학 중엔 직전 학기) 과목만. 지난 학기 과목으로 잘못 넣지 않는다. */
function matchableCourses(): Course[] {
  return getActiveTermCourses().courses;
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
  ctx.assertActive?.();
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
    ctx.assertActive?.();
    let course = byId(ai.course_id);
    if (!course && (ai.course_name || ai.course_code)) {
      const named = matchCourse(`${ai.course_code ?? ""} ${ai.course_name ?? ""}`, "", courses);
      course = byId(named.courseId);
    }
    // 강의계획서 특징이 충분하면 AI가 강의자료·문제은행이라고 해도 강의계획서로 본다
    const docType = ai.doc_type !== "syllabus" && syllabusScore(extracted.text, file.name) >= 5 ? "syllabus" : ai.doc_type;
    return { docType, course: course ?? byId(guess.courseConfident ? guess.courseId : null), aiUsed: true };
  } catch (error) {
    ctx.assertActive?.();
    return { docType: fallbackType, course: byId(guess.courseId), aiUsed: false, message: error instanceof Error ? error.message : undefined };
  }
}

type Target = { kind: "new"; file: File } | { kind: "existing"; note: MyNote; file: File };

/** 노트로 저장(새 파일) 또는 기존 Drive 노트의 분류만 바꾼다 */
async function attachNote(target: Target, course: Course | null, docType: DocType, assertCurrent: () => void): Promise<string> {
  assertCurrent();
  const label = DOC_TYPE_LABELS[docType];
  if (target.kind === "existing") {
    await updateNoteClassification(target.note.id, course ? "course" : "unassigned", course?.id, course?.name);
    assertCurrent();
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

async function subjectFor(course: Course, assertCurrent: () => void) {
  await syncSubjectsWithCourses([{ id: course.id, name: course.name }]).catch(() => undefined);
  assertCurrent();
  const subjects = await listSubjects();
  assertCurrent();
  return subjects.find((subject) => subject.courseId === course.id)
    ?? subjects.find((subject) => subject.name.trim() === course.name.trim())
    ?? createSubject(course.name);
}

/**
 * 문제은행: 문제 파일은 문항 번호·내용을, 강의노트는 그 안의 문제를(p.12, p.12-1…) 과목의 중간/기말 범위에 저장.
 * AI 분석은 문제은행 탭에서 동의한 로그인 계정만. 동의 전에는 문제 파일의 번호와 영역 그림만 넣는다.
 */
async function addToProblemBank(file: File, course: Course, record: IntakeRecord, docType: "problem_set" | "lecture", assertCurrent: () => void) {
  const useAi = getProblemConsent() === "granted" && await problemAiAvailable();
  assertCurrent();
  if (docType === "lecture" && !useAi) return;
  try {
    const mode = docType === "lecture" ? "lecture" : "problems";
    const result = await analyzeProblemPdf(file, { mode, useAi });
    assertCurrent();
    const subject = await subjectFor(course, assertCurrent);
    assertCurrent();
    const sourceFile = joinSourceFile(examPeriodFor(new Date()), file.name.slice(0, 180));
    const saved = await saveAnalyzedProblems(subject.id, sourceFile, result.problems, mode === "lecture" ? "lecture" : "problem", assertCurrent);
    assertCurrent();
    record.problemSubjectId = subject.id;
    record.problemSourceFile = sourceFile;
    record.problemCount = saved.addedCount + saved.skippedCount;
    if (saved.check) record.message = `번호 확인이 필요한 문항 ${saved.check}개가 있어요. 문제은행에서 확인해 주세요.`;
    else if (docType === "problem_set" && !useAi && getProblemConsent() === null) record.message = "문제은행 탭에서 AI 분석에 동의하면 문제 내용과 수식도 정리돼요.";
  } catch (error) {
    assertCurrent();
    // 강의노트에 문제가 없으면 조용히 넘어간다
    if (docType === "problem_set") record.message = `${error instanceof Error ? error.message : "문항 번호를 찾지 못했어요."} 문제은행에서 직접 입력해 주세요.`;
  }
}

/** 강의계획서 항목 읽기 (AI). 저장은 하지 않는다. */
async function readSyllabus(file: File, kind: IntakeFileKind, ctx: IntakeContext, record: IntakeRecord): Promise<SyllabusInfo | null> {
  // 아주대 포털 양식은 항목 이름이 정해져 있어 AI 없이 읽는다(과목명을 찾았을 때만)
  const local = parseAjouSyllabus((await extractContent(file, kind, 5, 15000)).text);
  ctx.assertActive?.();
  if (local?.course_name) return local;
  if (!ctx.useAi) {
    record.message = "로그인 후 AI 분류에 동의하면 강의계획서로 시간표와 성적 반영비율을 자동으로 채워요.";
    return null;
  }
  try {
    const full = await extractContent(file, kind, 3, 6000);
    ctx.assertActive?.();
    const info = await extractSyllabusWithAi({ fileName: file.name, text: full.text, image: full.image });
    ctx.assertActive?.();
    record.aiUsed = true;
    if (!info.course_name) {
      record.message = "강의계획서에서 과목명을 찾지 못했어요. 과목을 직접 골라 주세요.";
      return null;
    }
    return info;
  } catch (error) {
    ctx.assertActive?.();
    record.message = error instanceof Error ? error.message : "강의계획서를 읽지 못했어요.";
    return null;
  }
}

/** 강의계획서가 가리키는 기존 과목(없으면 null → 새 과목) */
function syllabusCourse(info: SyllabusInfo): Course | null {
  const term = syllabusTerm(info, getCurrentAcademicTermLabel());
  return findSyllabusCourse(getAllStoredCourses(), info, term) ?? null;
}

/** 강의계획서 반영: 고른 과목에 성적 반영비율 등을 합치거나, 없으면 시간표에 새 과목으로 추가 */
function applySyllabusInfo(info: SyllabusInfo, chosen: Course | null, record: IntakeRecord): Course {
  const all = getAllStoredCourses();
  if (chosen) {
    const term = chosen.term ?? getCurrentAcademicTermLabel();
    const course = mergeSyllabusIntoCourse(chosen, info);
    saveStoredCourses(all.filter((item) => item.term === term).map((item) => (item.id === course.id ? course : item)), term);
    record.term = term;
    record.gradingCount = course.gradingWeights?.length ?? 0;
    return course;
  }
  const term = syllabusTerm(info, getCurrentAcademicTermLabel());
  const termCourses = all.filter((course) => course.term === term);
  const course = buildSyllabusCourse(info, term, `syllabus-${Date.now()}`, SCHEDULE_COLORS[termCourses.length % SCHEDULE_COLORS.length]);
  saveStoredCourses([...termCourses, course], term);
  saveTimetableTerms([...getTimetableTerms(), term]);
  record.timetableAdded = true;
  record.term = term;
  record.gradingCount = course.gradingWeights?.length ?? 0;
  return course;
}

function linkSyllabusNote(course: Course, noteId: string) {
  const term = course.term!;
  const termCourses = getAllStoredCourses().filter((item) => item.term === term);
  saveStoredCourses(termCourses.map((item) => (item.id === course.id ? { ...item, syllabusNoteId: noteId } : item)), term);
}

interface Classified { target: Target; kind: IntakeFileKind; docType: DocType; course: Course | null; syllabus: SyllabusInfo | null }

/** 1단계: 종류·과목만 정한다(저장하지 않음). 강의계획서는 항목까지 읽어 어느 과목인지(또는 새 과목) 보여 준다. */
async function classify(target: Target, record: IntakeRecord, ctx: IntakeContext, onUpdate: (record: IntakeRecord) => void): Promise<Classified> {
  const file = target.file;
  const kind = detectKind(file);
  if (!kind) throw new Error("PDF, 이미지(JPG·PNG), PPTX, DOCX만 넣을 수 있어요.");
  if (file.size > MAX_INTAKE_BYTES) throw new Error("20MB 이하 파일만 넣을 수 있어요.");
  const normalized = normalizedFile(file, kind);
  const decision = await decide(normalized, kind, ctx, matchableCourses());
  ctx.assertActive?.();
  record.docType = decision.docType;
  record.aiUsed = decision.aiUsed;
  if (decision.message) record.message = decision.message;
  onUpdate({ ...record });
  let course = decision.course;
  let syllabus: SyllabusInfo | null = null;
  if (decision.docType === "syllabus") {
    syllabus = await readSyllabus(normalized, kind, ctx, record);
    ctx.assertActive?.();
    if (syllabus) {
      course = syllabusCourse(syllabus);
      record.newCourseName = course ? undefined : syllabus.course_name ?? undefined;
    }
  }
  record.courseId = course?.id ?? null;
  record.courseName = course?.name;
  record.term = course?.term;
  const fileTarget: Target = target.kind === "new" ? { kind: "new", file: normalized } : { ...target, file: normalized };
  return { target: fileTarget, kind, docType: decision.docType, course, syllabus };
}

/** 2단계: 정해진(또는 사용자가 고친) 종류·과목으로 노트·시간표·문제은행·Drive에 저장한다 */
async function save(item: Classified, record: IntakeRecord, ctx: IntakeContext) {
  const { target, kind, docType, syllabus } = item;
  let course = item.course;
  record.docType = docType;
  record.message = undefined;
  if (docType === "syllabus" && syllabus && (course || record.newCourseName)) course = applySyllabusInfo(syllabus, course, record);
  ctx.assertActive?.();
  record.noteId = await attachNote(target, course, docType, () => ctx.assertActive?.());
  ctx.assertActive?.();
  record.courseId = course?.id ?? null;
  record.courseName = course?.name;
  record.newCourseName = undefined;
  record.term = record.term ?? course?.term;
  if (docType === "syllabus" && course) linkSyllabusNote(course, record.noteId);
  if ((docType === "problem_set" || docType === "lecture") && course && kind === "pdf") {
    await addToProblemBank(target.file, course, record, docType, () => ctx.assertActive?.());
  }
  if (!course && !record.message) record.message = "과목을 찾지 못했어요. 과목을 골라 주세요.";

  if (target.kind === "new" && ctx.uploadToDrive && course) {
    ctx.assertActive?.();
    try {
      await uploadNoteToDrive(record.noteId, { term: course.term, kind: DOC_TYPE_LABELS[docType] });
      ctx.assertActive?.();
      record.drive = "uploaded";
    } catch (error) {
      ctx.assertActive?.();
      record.drive = "failed";
      record.message = error instanceof Error ? error.message : "Drive에 올리지 못했어요.";
    }
  }
}

/** Drive 노트처럼 확인 없이 바로 처리할 때 */
async function run(target: Target, record: IntakeRecord, ctx: IntakeContext, onUpdate: (record: IntakeRecord) => void) {
  await save(await classify(target, record, ctx, onUpdate), record, ctx);
}

async function track(record: IntakeRecord, work: () => Promise<void>, onUpdate: (record: IntakeRecord) => void, assertCurrent: () => void) {
  assertCurrent();
  onUpdate({ ...record });
  try {
    await work();
    assertCurrent();
    record.status = "done";
  } catch (error) {
    assertCurrent();
    record.status = "error";
    record.message = error instanceof Error ? error.message : "파일을 처리하지 못했어요.";
  }
  assertCurrent(); saveIntakeRecord(record);
  onUpdate({ ...record });
  return record;
}

/** 저장을 기다리는 분류 결과 (채팅에서 올린 파일). 새로고침하면 사라진다. */
const drafts = new Map<string, Classified>();

/** 채팅에 올린 파일 하나를 분류만 한다. 사용자가 확인하면 commitUpload로 저장한다. */
export async function classifyUpload(file: File, ctx: IntakeContext, onUpdate: (record: IntakeRecord) => void) {
  const owner = captureStorageScope();
  const assertCurrent = () => { owner(); ctx.assertActive?.(); };
  const record: IntakeRecord = { id: makeId(), fileName: file.name, source: "upload", status: "processing", createdAt: new Date().toISOString() };
  sessionFiles.set(record.id, file);
  onUpdate({ ...record });
  try {
    drafts.set(record.id, await classify({ kind: "new", file }, record, { ...ctx, assertActive: assertCurrent }, onUpdate));
    assertCurrent();
    record.status = "review";
  } catch (error) {
    assertCurrent();
    record.status = "error";
    record.message = error instanceof Error ? error.message : "파일을 분류하지 못했어요.";
  }
  onUpdate({ ...record });
  return record;
}

/** 확인된 분류(사용자가 고친 종류·과목 포함)로 저장한다 */
export function commitUpload(record: IntakeRecord, ctx: IntakeContext, onUpdate: (record: IntakeRecord) => void) {
  const draft = drafts.get(record.id);
  if (!draft) throw new Error("분류 결과가 만료됐어요. 파일을 다시 올려 주세요.");
  const owner = captureStorageScope();
  const assertCurrent = () => { owner(); ctx.assertActive?.(); };
  const next: IntakeRecord = { ...record, status: "processing" };
  const docType = record.docType ?? draft.docType;
  const course = record.courseId ? getAllStoredCourses().find((item) => item.id === record.courseId) ?? null : null;
  const item: Classified = { ...draft, docType, course, syllabus: docType === "syllabus" ? draft.syllabus : null };
  if (!(docType === "syllabus" && !course && record.newCourseName)) next.newCourseName = undefined;
  return track(next, async () => {
    await save(item, next, { ...ctx, assertActive: assertCurrent });
    drafts.delete(record.id);
  }, onUpdate, assertCurrent);
}

export function discardUpload(id: string) {
  drafts.delete(id);
  sessionFiles.delete(id);
}

/** 대시보드에 넣은 파일 하나를 바로 분류·저장한다 (확인 단계 없음) */
export function processUpload(file: File, ctx: IntakeContext, onUpdate: (record: IntakeRecord) => void) {
  const owner = captureStorageScope();
  const assertCurrent = () => { owner(); ctx.assertActive?.(); };
  const guarded = { ...ctx, assertActive: assertCurrent };
  const record: IntakeRecord = { id: makeId(), fileName: file.name, source: "upload", status: "processing", createdAt: new Date().toISOString() };
  sessionFiles.set(record.id, file);
  return track(record, () => run({ kind: "new", file }, record, guarded, onUpdate), onUpdate, assertCurrent);
}

/** Drive에서 동기화돼 미분류로 들어온 노트를 같은 과정으로 분류한다 */
export function processDriveNote(note: MyNote, ctx: IntakeContext, onUpdate: (record: IntakeRecord) => void) {
  const owner = captureStorageScope();
  const assertCurrent = () => { owner(); ctx.assertActive?.(); };
  const record: IntakeRecord = {
    id: makeId(), fileName: note.fileName ?? note.title, source: "drive", status: "processing", noteId: note.id, createdAt: new Date().toISOString(),
  };
  return track(record, async () => {
    if (!note.driveFileId) throw new Error("Drive 파일 정보가 없어요.");
    const blob = await fetchDrivePdf(note.driveFileId);
    assertCurrent();
    const file = new File([blob], note.fileName || `${note.title}.pdf`, { type: "application/pdf" });
    sessionFiles.set(record.id, file);
    await run({ kind: "existing", note, file }, record, { ...ctx, uploadToDrive: false, assertActive: assertCurrent }, onUpdate);
  }, onUpdate, assertCurrent);
}

/** 결과 목록에서 사용자가 과목·종류를 고친다 */
export async function reassignRecord(record: IntakeRecord, change: { courseId?: string | null; docType?: DocType }): Promise<IntakeRecord> {
  const assertCurrent = captureStorageScope();
  const next: IntakeRecord = { ...record, message: undefined };
  const courseId = change.courseId !== undefined ? change.courseId : record.courseId ?? null;
  const docType = change.docType ?? record.docType ?? "other";
  const course = getAllStoredCourses().find((item) => item.id === courseId) ?? null;
  if (!record.noteId) throw new Error("저장된 파일 정보가 없어요.");

  const note = (await getMyNotes()).find((item) => item.id === record.noteId);
  assertCurrent();
  if (!note) throw new Error("노트를 찾지 못했어요. 나의 노트에서 확인해 주세요.");
  await updateNoteClassification(note.id, course ? "course" : "unassigned", course?.id, course?.name);
  assertCurrent();
  await updateNoteTags(note.id, [...typeTags(note.tags), DOC_TYPE_LABELS[docType]]);
  assertCurrent();

  // Classification must not delete independent learning observations or require an in-memory PDF.
  const movedProblems = record.problemSubjectId && record.problemSourceFile && (docType !== record.docType || courseId !== record.courseId);
  if (movedProblems) {
    next.message = "노트 분류를 변경했습니다. 기존 문항과 학습 단계는 원래 문제은행에 보존했습니다.";
  }
  if ((docType === "problem_set" || docType === "lecture") && course && !record.problemSourceFile) {
    const file = sessionFiles.get(record.id);
    if (file && detectKind(file) === "pdf") await addToProblemBank(file, course, next, docType, assertCurrent);
    else if (docType === "problem_set") next.message = "문제 번호는 문제은행에서 직접 넣어 주세요.";
  }
  if (record.drive === "uploaded" && courseId !== record.courseId) next.message = "Drive에 이미 올린 파일은 원래 폴더에 남아 있어요.";

  next.courseId = course?.id ?? null;
  next.courseName = course?.name;
  next.term = course?.term ?? record.term;
  next.docType = docType;
  assertCurrent(); saveIntakeRecord(next);
  return next;
}

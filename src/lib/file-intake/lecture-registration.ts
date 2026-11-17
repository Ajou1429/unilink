import { addNote, getMyNotes, saveNoteContentProfile, type MyNote, type NewNoteInput } from "../my-notes-storage";
import { getSupabaseBrowserClient } from "../supabase-client";
import { fetchDrivePdf } from "../drive-connection";
import { preferredLectureNotes, textContentSketch, type LectureContentProfile } from "../lecture-content";
import { detectKind, extractContent, MAX_INTAKE_BYTES } from "./extract";

const MAX_TEXT = 500000;
const digest = async (bytes: ArrayBuffer) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), byte => byte.toString(16).padStart(2, "0")).join("");

export async function lectureProfile(file: File): Promise<LectureContentProfile> {
  const fileHash = await digest(await file.arrayBuffer());
  const kind = detectKind(file);
  if (!kind) throw new Error("지원하는 자료 형식이 아닙니다.");
  const body = await extractContent(file, kind, 300, MAX_TEXT + 1);
  const sketch = textContentSketch(body.text);
  const complete = body.complete !== false && body.text.length <= MAX_TEXT && sketch.characters >= 600;
  return { version: 1, fileHash, textHash: complete ? await digest(new TextEncoder().encode(sketch.normalized).buffer) : null,
    characters: sketch.characters, unique: sketch.unique, samples: sketch.samples, complete };
}

export async function originalLectureFile(note: MyNote): Promise<File> {
  let blob: Blob;
  if (note.fileDataUrl) {
    const response = await fetch(note.fileDataUrl);
    if (!response.ok) throw new Error("원본을 읽지 못했습니다.");
    blob = await response.blob();
  } else if (note.driveFileId) {
    blob = await fetchDrivePdf(note.driveFileId);
  } else if (note.filePath) {
    const db = getSupabaseBrowserClient();
    if (!db) throw new Error("로그인이 필요합니다.");
    const result = await db.storage.from("note-files").download(note.filePath);
    if (result.error || !result.data) throw new Error("저장된 원본을 읽지 못했습니다.");
    blob = result.data;
  } else throw new Error("연결된 원본이 없습니다.");
  if (blob.size > MAX_INTAKE_BYTES) throw new Error("자료가 너무 큽니다.");
  return new File([blob], note.fileName ?? note.title, { type: blob.type });
}

/** Preserve originals/evidence, while registering or selecting the most informative lecture. */
export async function registerLecture(input: NewNoteInput & { file: File }, assertCurrent: () => void, existingNote?: MyNote) {
  const existingId = existingNote?.id;
  const profile = await lectureProfile(input.file);
  assertCurrent();
  const notes = (await getMyNotes()).filter(note => note.linkedType === "course" && note.linkedId === input.linkedId &&
    !note.tags.some(tag => ["문제은행", "과제", "강의계획서", "기타"].includes(tag)));
  assertCurrent();
  let unreadable = 0;
  for (const note of notes) {
    if (note.contentProfile || note.id === existingId || !note.fileName) continue;
    let extracted: LectureContentProfile;
    try { extracted = await lectureProfile(await originalLectureFile(note)); }
    catch { assertCurrent(); unreadable++; continue; }
    assertCurrent();
    await saveNoteContentProfile(note, extracted, assertCurrent);
    note.contentProfile = extracted;
  }
  const current = existingId ? notes.find(note => note.id === existingId) : undefined;
  if (existingNote) {
    if (!current || current.version !== existingNote.version || current.filePath !== existingNote.filePath || current.driveModifiedTime !== existingNote.driveModifiedTime) throw new Error("원본이 변경되었습니다. 다시 분석해 주세요.");
    await saveNoteContentProfile(current, profile, assertCurrent);
    current.contentProfile = profile;
  }
  const incoming = { id: existingId ?? "incoming", linkedType: "course", linkedId: input.linkedId, createdAt: current?.createdAt ?? new Date().toISOString(), contentProfile: profile };
  const preferred = preferredLectureNotes([...notes.filter(note => note.id !== existingId), incoming]);
  const keeper = preferred.find(note => note.id !== incoming.id && !preferredLectureNotes([note, incoming]).some(row => row.id === incoming.id));
  if (keeper) return { noteId: keeper.id, reused: true, message: "같은 원문을 포함한 자료가 있어 내용이 더 풍부한 기존 강의노트를 사용했어요." };
  const saved = existingId ? notes.find(note => note.id === existingId) : await addNote(input);
  if (!saved) throw new Error("노트를 찾지 못했습니다.");
  assertCurrent();
  try { await saveNoteContentProfile(saved, profile, assertCurrent); }
  catch (error) {
    assertCurrent();
    throw new Error(`원본 노트는 저장했지만 내용 비교를 완료하지 못했어요. ${error instanceof Error ? error.message : "다시 분석해 주세요."}`);
  }
  return { noteId: saved.id, reused: false, message: unreadable ? "일부 기존 원본은 읽지 못해 비교에서 제외했어요." : undefined };
}

export async function compareExistingLecture(note: MyNote, assertCurrent: () => void) {
  if (note.linkedType !== "course" || !note.linkedId || note.tags.some(tag => ["문제은행", "과제", "강의계획서", "기타"].includes(tag))) return;
  const file = await originalLectureFile(note);
  assertCurrent();
  return registerLecture({ title: note.title, courseName: note.courseName, linkedType: "course", linkedId: note.linkedId,
    linkedTitle: note.linkedTitle, source: note.source, content: note.content, tags: note.tags, file, fileName: note.fileName }, assertCurrent, note);
}

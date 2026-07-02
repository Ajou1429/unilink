import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client";

export const MY_NOTES_STORAGE_KEY = "unilink:my-notes";
export const MY_NOTES_CHANGED_EVENT = "unilink:myNotesChanged";

export type NoteSource =
  | "GoodNotes"
  | "Notability"
  | "Apple Notes"
  | "Google Drive"
  | "직접 작성";

export type NoteSyncStatus = "synced" | "pending" | "manual";
export type NoteLinkedType = "course" | "personal" | "unassigned";

export interface MyNote {
  id: string;
  title: string;
  courseName: string;
  linkedType: NoteLinkedType;
  linkedId?: string;
  linkedTitle?: string;
  source: NoteSource;
  syncStatus: NoteSyncStatus;
  content: string;
  fileName?: string;
  fileSize?: number;
  driveFileId?: string;
  driveModifiedTime?: string;
  version: number;
  tags: string[];
  updatedAt: string;
  createdAt: string;
}

export interface GoodNotesDriveFile {
  driveFileId: string;
  fileName: string;
  modifiedTime: string;
  size: number;
  contentSummary: string;
}

export interface NewNoteInput {
  title: string;
  courseName: string;
  linkedType: NoteLinkedType;
  linkedId?: string;
  linkedTitle?: string;
  source: NoteSource;
  content: string;
  fileName?: string;
  fileSize?: number;
  tags: string[];
}

// ---------------------------------------------------------------------------
// localStorage 목업 — Supabase 프로젝트가 설정되지 않은 개발 환경(NEXT_PUBLIC_SUPABASE_URL
// 미설정)에서만 쓰인다. docs/roadmap-drive-goodnotes-supabase.md Phase 2 참고.
// ---------------------------------------------------------------------------

const defaultLocalNotes: MyNote[] = [
  {
    id: "note-1",
    title: "운영체제 7주차 필기",
    courseName: "운영체제",
    linkedType: "course",
    linkedId: "1",
    linkedTitle: "운영체제",
    source: "GoodNotes",
    syncStatus: "synced",
    content: "교착상태 발생 조건과 해결 방법 정리",
    fileName: "OS_week7_goodnotes.pdf",
    fileSize: 2450000,
    driveFileId: "drive-goodnotes-os-week7",
    driveModifiedTime: "2024-03-18T11:30:00Z",
    version: 1,
    tags: ["운영체제", "시험범위"],
    createdAt: "2024-03-18T10:00:00Z",
    updatedAt: "2024-03-18T11:30:00Z",
  },
  {
    id: "note-2",
    title: "데이터베이스 정규화 정리",
    courseName: "데이터베이스",
    linkedType: "course",
    linkedId: "2",
    linkedTitle: "데이터베이스",
    source: "직접 작성",
    syncStatus: "manual",
    content: "1NF, 2NF, 3NF, BCNF 차이와 예시",
    version: 1,
    tags: ["DB", "정규화"],
    createdAt: "2024-03-19T14:00:00Z",
    updatedAt: "2024-03-19T15:00:00Z",
  },
];

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      window.localStorage.setItem(key, JSON.stringify(fallback));
      return fallback;
    }
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function getLocalNotes(): MyNote[] {
  const notes = readJson<MyNote[]>(MY_NOTES_STORAGE_KEY, defaultLocalNotes);
  return notes.map((note) => ({
    ...note,
    linkedType: note.linkedType ?? "unassigned",
    version: note.version ?? 1,
    tags: note.tags ?? [],
  }));
}

function saveLocalNotes(notes: MyNote[]) {
  writeJson(MY_NOTES_STORAGE_KEY, notes);
  window.dispatchEvent(new Event(MY_NOTES_CHANGED_EVENT));
  return notes;
}

function addLocalNote(input: NewNoteInput): MyNote {
  const now = new Date().toISOString();
  const note: MyNote = {
    id: Date.now().toString(),
    title: input.title,
    courseName: input.linkedTitle ?? input.courseName ?? "미분류",
    linkedType: input.linkedType,
    linkedId: input.linkedId || undefined,
    linkedTitle: input.linkedTitle,
    source: input.source,
    syncStatus: input.source === "직접 작성" ? "manual" : "synced",
    content: input.content,
    fileName: input.fileName,
    fileSize: input.fileSize,
    driveFileId:
      input.source === "GoodNotes" && input.fileName
        ? `manual-${input.fileName}`
        : undefined,
    driveModifiedTime: input.source === "GoodNotes" ? now : undefined,
    version: 1,
    tags: input.tags,
    createdAt: now,
    updatedAt: now,
  };

  saveLocalNotes([note, ...getLocalNotes()]);
  return note;
}

function updateLocalNoteClassification(
  noteId: string,
  linkedType: NoteLinkedType,
  linkedId: string | undefined,
  linkedTitle: string | undefined,
): MyNote[] {
  const notes = getLocalNotes().map((note) =>
    note.id === noteId
      ? {
          ...note,
          linkedType,
          linkedId: linkedId || undefined,
          linkedTitle,
          courseName: linkedTitle ?? "미분류",
          updatedAt: new Date().toISOString(),
        }
      : note,
  );
  return saveLocalNotes(notes);
}

function upsertLocalGoodNotesDriveFiles(files: GoodNotesDriveFile[]): MyNote[] {
  const notes = getLocalNotes();
  const now = new Date().toISOString();
  const nextNotes = [...notes];

  files.forEach((file) => {
    const existingIndex = nextNotes.findIndex(
      (note) => note.driveFileId === file.driveFileId || note.fileName === file.fileName,
    );

    if (existingIndex >= 0) {
      const existing = nextNotes[existingIndex];
      nextNotes[existingIndex] = {
        ...existing,
        title: file.fileName.replace(/\.[^.]+$/, ""),
        source: "GoodNotes",
        syncStatus: "synced",
        content: file.contentSummary,
        fileName: file.fileName,
        fileSize: file.size,
        driveFileId: file.driveFileId,
        driveModifiedTime: file.modifiedTime,
        version: (existing.version ?? 1) + 1,
        updatedAt: now,
      };
      return;
    }

    nextNotes.unshift({
      id: `drive-${file.driveFileId}`,
      title: file.fileName.replace(/\.[^.]+$/, ""),
      courseName: "미분류",
      linkedType: "unassigned",
      source: "GoodNotes",
      syncStatus: "synced",
      content: file.contentSummary,
      fileName: file.fileName,
      fileSize: file.size,
      driveFileId: file.driveFileId,
      driveModifiedTime: file.modifiedTime,
      version: 1,
      tags: ["GoodNotes"],
      createdAt: now,
      updatedAt: now,
    });
  });

  return saveLocalNotes(nextNotes);
}

// ---------------------------------------------------------------------------
// Supabase 연동 — notes 테이블 (supabase/migrations/0001_notes_and_drive.sql)
// ---------------------------------------------------------------------------

interface NoteRow {
  id: string;
  title: string;
  course_name: string;
  linked_type: NoteLinkedType;
  linked_id: string | null;
  linked_title: string | null;
  source: NoteSource;
  sync_status: NoteSyncStatus;
  content: string;
  file_name: string | null;
  file_size: number | null;
  drive_file_id: string | null;
  drive_modified_time: string | null;
  version: number;
  tags: string[];
  created_at: string;
  updated_at: string;
}

function rowToNote(row: NoteRow): MyNote {
  return {
    id: row.id,
    title: row.title,
    courseName: row.course_name,
    linkedType: row.linked_type,
    linkedId: row.linked_id ?? undefined,
    linkedTitle: row.linked_title ?? undefined,
    source: row.source,
    syncStatus: row.sync_status,
    content: row.content,
    fileName: row.file_name ?? undefined,
    fileSize: row.file_size ?? undefined,
    driveFileId: row.drive_file_id ?? undefined,
    driveModifiedTime: row.drive_modified_time ?? undefined,
    version: row.version,
    tags: row.tags ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getSupabaseNotes(): Promise<MyNote[]> {
  const supabase = getSupabaseClient()!;
  const { data, error } = await supabase
    .from("notes")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return (data as NoteRow[]).map(rowToNote);
}

async function addSupabaseNote(input: NewNoteInput): Promise<MyNote> {
  const supabase = getSupabaseClient()!;
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error("로그인이 필요합니다.");

  const { data, error } = await supabase
    .from("notes")
    .insert({
      user_id: userId,
      title: input.title,
      course_name: input.linkedTitle ?? input.courseName ?? "미분류",
      linked_type: input.linkedType,
      linked_id: input.linkedId || null,
      linked_title: input.linkedTitle ?? null,
      source: input.source,
      sync_status: input.source === "직접 작성" ? "manual" : "synced",
      content: input.content,
      file_name: input.fileName ?? null,
      file_size: input.fileSize ?? null,
      tags: input.tags,
    })
    .select("*")
    .single();

  if (error) throw error;
  return rowToNote(data as NoteRow);
}

async function updateSupabaseNoteClassification(
  noteId: string,
  linkedType: NoteLinkedType,
  linkedId: string | undefined,
  linkedTitle: string | undefined,
): Promise<MyNote[]> {
  const supabase = getSupabaseClient()!;
  const { error } = await supabase
    .from("notes")
    .update({
      linked_type: linkedType,
      linked_id: linkedId || null,
      linked_title: linkedTitle ?? null,
      course_name: linkedTitle ?? "미분류",
    })
    .eq("id", noteId);

  if (error) throw error;
  return getSupabaseNotes();
}

// ---------------------------------------------------------------------------
// Public API — 호출부는 Supabase 설정 여부를 신경 쓰지 않는다.
// ---------------------------------------------------------------------------

export async function getMyNotes(): Promise<MyNote[]> {
  if (isSupabaseConfigured) return getSupabaseNotes();
  return getLocalNotes();
}

export async function addNote(input: NewNoteInput): Promise<MyNote> {
  if (isSupabaseConfigured) return addSupabaseNote(input);
  return addLocalNote(input);
}

export async function updateNoteClassification(
  noteId: string,
  linkedType: NoteLinkedType,
  linkedId: string | undefined,
  linkedTitle: string | undefined,
): Promise<MyNote[]> {
  if (isSupabaseConfigured) {
    return updateSupabaseNoteClassification(noteId, linkedType, linkedId, linkedTitle);
  }
  return updateLocalNoteClassification(noteId, linkedType, linkedId, linkedTitle);
}

/**
 * Supabase 모드에서는 실제 동기화가 Edge Function(drive-sync/drive-webhook)에서
 * 일어나므로 이 함수는 로컬 목업 전용이다. Supabase가 설정된 경우 아무 것도 하지 않는다.
 */
export function upsertGoodNotesDriveFiles(files: GoodNotesDriveFile[]): MyNote[] | null {
  if (isSupabaseConfigured) return null;
  return upsertLocalGoodNotesDriveFiles(files);
}

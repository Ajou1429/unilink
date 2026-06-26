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

const defaultNotes: MyNote[] = [
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

export function getMyNotes(): MyNote[] {
  const notes = readJson<MyNote[]>(MY_NOTES_STORAGE_KEY, defaultNotes);
  return notes.map((note) => ({
    ...note,
    linkedType: note.linkedType ?? "unassigned",
    version: note.version ?? 1,
    tags: note.tags ?? [],
  }));
}

export function saveMyNotes(notes: MyNote[]) {
  writeJson(MY_NOTES_STORAGE_KEY, notes);
  window.dispatchEvent(new Event(MY_NOTES_CHANGED_EVENT));
}

export function upsertGoodNotesDriveFiles(files: GoodNotesDriveFile[]) {
  const notes = getMyNotes();
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

  saveMyNotes(nextNotes);
  return nextNotes;
}

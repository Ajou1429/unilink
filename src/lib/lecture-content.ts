export interface LectureContentProfile {
  version: 1;
  fileHash: string;
  textHash: string | null;
  characters: number;
  unique: number;
  samples: number[];
  complete: boolean;
}

/** Fixed-size bottom-k sketch. Whitespace differences do not change the body. */
export function textContentSketch(text: string) {
  const normalized = text.normalize("NFC").replace(/\s+/gu, "");
  const hashes = new Set<number>();
  for (let i = 0; i + 12 <= normalized.length; i++) {
    let hash = 2166136261;
    for (let j = 0; j < 12; j++) hash = Math.imul(hash ^ normalized.charCodeAt(i + j), 16777619);
    hashes.add(hash >>> 0);
  }
  return { normalized, characters: normalized.length, unique: hashes.size, samples: [...hashes].sort((a, b) => a - b).slice(0, 1024) };
}

export function parseContentProfile(value: unknown): LectureContentProfile | null {
  if (!value || typeof value !== "object") return null;
  const p = value as LectureContentProfile;
  if (p.version !== 1 || !/^[a-f0-9]{64}$/.test(p.fileHash) || (p.textHash !== null && !/^[a-f0-9]{64}$/.test(p.textHash)) ||
      !Number.isInteger(p.characters) || p.characters < 0 || !Number.isInteger(p.unique) || p.unique < 0 ||
      typeof p.complete !== "boolean" || !Array.isArray(p.samples) || p.samples.length > 1024 ||
      p.samples.some((n, i) => !Number.isInteger(n) || n < 0 || n > 4294967295 || (i > 0 && n <= p.samples[i - 1]))) return null;
  return p;
}

/** Require near-complete inclusion of the smaller source, not merely a common topic. */
export function contentCovers(larger: LectureContentProfile, smaller: LectureContentProfile): boolean {
  if (larger.fileHash === smaller.fileHash) return true;
  if (!larger.complete || !smaller.complete || smaller.characters < 600 || larger.characters < smaller.characters) return false;
  // Equal text in different files cannot establish whether unseen image/ink content is richer.
  if (larger.textHash && larger.textHash === smaller.textHash) return false;
  if (larger.unique <= smaller.unique || !larger.samples.length || !smaller.samples.length) return false;
  const cutoff = Math.min(larger.samples.at(-1)!, smaller.samples.at(-1)!);
  const sample = smaller.samples.filter(hash => hash <= cutoff);
  if (sample.length < 128) return false;
  const other = new Set(larger.samples);
  return sample.filter(hash => other.has(hash)).length / sample.length >= 0.97;
}

export interface ProfiledLecture {
  id: string;
  linkedType: string;
  linkedId?: string;
  createdAt: string;
  tags?: string[];
  contentProfile?: LectureContentProfile;
}

export function preferredLectureNotes<T extends ProfiledLecture>(notes: T[]): T[] {
  const selected: T[] = [];
  const eligible = (note: T) => !note.tags?.some(tag => ["문제은행", "과제", "강의계획서", "기타"].includes(tag));
  const sorted = notes.slice().sort((a, b) =>
    (b.contentProfile?.unique ?? 0) - (a.contentProfile?.unique ?? 0) ||
    (b.contentProfile?.characters ?? 0) - (a.contentProfile?.characters ?? 0) ||
    a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  for (const note of sorted) {
    const profile = eligible(note) ? note.contentProfile : undefined;
    const duplicate = profile && note.linkedType === "course" && note.linkedId && selected.some(other =>
      eligible(other) && other.linkedType === "course" && other.linkedId === note.linkedId && other.contentProfile && contentCovers(other.contentProfile, profile));
    if (!duplicate) selected.push(note);
  }
  const ids = new Set(selected.map(note => note.id));
  return notes.filter(note => ids.has(note.id));
}

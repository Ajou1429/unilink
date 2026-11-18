import type { MyNote } from "./my-notes-storage";

type CourseIdentity = { id: string; name: string; courseCode?: string | null };
type Note = Pick<MyNote, "id" | "title" | "fileName" | "filePath" | "driveFileId" | "linkedType" | "linkedId">;
const normalized = (value: string) => value.normalize("NFKC").toLowerCase().replace(/디비/g, "db");
const compact = (value: string) => normalized(value).replace(/[^\p{L}\p{N}]/gu, "");

export function matchMaterialCourse<T extends CourseIdentity>(courses: T[], request: string): T | undefined {
  const input = compact(request);
  const matches = courses.filter(course => {
    const name = compact(course.name);
    const code = compact(course.courseCode ?? "");
    return (name.length >= 2 && input.includes(name)) || (code.length >= 3 && input.includes(code))
      || (name === "엔지니어링db" && input.includes("엔db"));
  });
  return matches.length === 1 ? matches[0] : undefined;
}

export const isReadablePdfSource = (note: Note) => Boolean(note.driveFileId || (note.filePath && /\.pdf$/i.test(note.fileName ?? note.filePath)));
export const belongsToCourse = (note: Note, id: string) => note.linkedType === "course" && note.linkedId === id;

/** Resolve a named PDF independently of the model's optional note_id. */
export function namedPlanMaterials<T extends Note>(notes: T[], request: string, courseId?: string): T[] {
  const input = compact(request);
  const matches = notes.filter(note => isReadablePdfSource(note) && (!courseId || belongsToCourse(note, courseId)))
    .map(note => ({ note, score: Math.max(0, ...[note.fileName, note.title].map(value => {
      const name = compact((value ?? "").replace(/\.pdf$/i, ""));
      return name.length >= 6 && input.includes(name) ? name.length : 0;
    })) }));
  const longest = Math.max(0, ...matches.map(match => match.score));
  return longest ? matches.filter(match => match.score === longest).map(match => match.note) : [];
}

export function requestedChapters(request: string): number[] {
  const chapters = new Set<number>();
  for (const match of normalized(request).matchAll(/(?<![\d.])(\d{1,2})(?:\s*장)?\s*[~–-]\s*(\d{1,2})\s*장/gu)) {
    const start = Number(match[1]), end = Number(match[2]);
    for (let n = start; n <= end; n++) chapters.add(n);
  }
  for (const match of normalized(request).matchAll(/(?<![\d.])((?:\d{1,2}(?:\s*장)?\s*[,·、]\s*)*\d{1,2})\s*장/gu)) {
    for (const number of match[1].match(/\d+/g) ?? []) chapters.add(Number(number));
  }
  return [...chapters].filter(n => n > 0).sort((a, b) => a - b);
}

export function requestedPlanChapters(request: string) {
  const lines = request.split("\n").filter(line => !/\.pdf\s*$/i.test(line.trim()));
  const explicit = lines.findLast(line => /장\s*만/.test(line) && requestedChapters(line).length > 0);
  if (explicit) return requestedChapters(explicit);
  return /강의\s*(?:자료|노트)|필기|pdf|분석|확인/.test(request.toLowerCase())
    ? requestedChapters(lines.findLast(line => requestedChapters(line).length > 0) ?? "") : [];
}

export function matchesChapter(note: Note, chapter: number) {
  const pattern = new RegExp(`(?<![0-9])0*${chapter}\\s*장|(?:chapter|챕터)\\s*0*${chapter}(?![0-9])`, "iu");
  return [note.title, note.fileName].some(name => name && pattern.test(normalized(name)));
}

export function selectChapterMaterials<T extends Note>(notes: T[], courseId: string, chapters: number[], request: string) {
  const local = notes.filter(note => belongsToCourse(note, courseId));
  const input = normalized(request);
  const groups = chapters.map(chapter => {
    const matching = local.filter(note => matchesChapter(note, chapter));
    const readable = matching.filter(isReadablePdfSource).sort((a,b)=>(a.fileName??a.title).localeCompare(b.fileName??b.title,"ko")||a.id.localeCompare(b.id));
    const named = readable.map(note=>({note,length:Math.max(0,...[note.title,note.fileName].map(value=>{
      const name=normalized(value??"");return name.length>=5&&input.includes(name)?name.length:0;
    }))}));
    const best = Math.max(0,...named.map(entry=>entry.length));
    const candidates = best ? named.filter(entry=>entry.length===best).map(entry=>entry.note) : readable;
    return { chapter, candidates, unavailable: matching.length > 0 && !readable.length };
  });
  const ambiguous = groups.filter(group=>group.candidates.length>1);
  const replies = input.split("\n").reverse();
  const choice = replies.find(line=>/^(?:전자|후자|첫\s*번째|두\s*번째|아무거나|\(\d+\))/.test(line.trim()) || /같은\s*거.{0,20}아무거나/.test(line));
  if(ambiguous.length===1&&choice) {
    const group=ambiguous[0];
    const numbered=choice.trim().match(/^\((\d+)\)/)?.[1];
    const version=numbered&&group.candidates.find(note=>normalized(note.fileName??note.title).includes(`(${numbered})`));
    const selected=numbered?version:/^\s*(?:후자|두\s*번째)/.test(choice)?group.candidates[1]:group.candidates[0];
    if(selected)group.candidates=[selected];
  }
  return groups;
}

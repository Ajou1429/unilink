import type { MyNote } from "./my-notes-storage";

export type CourseNoteSort = "name" | "modified" | "type";
export type CourseNoteSortDirection = "asc" | "desc";
const collator = new Intl.Collator("ko", { numeric: true, sensitivity: "base" });

function fileType(note: MyNote): string {
  const filename = note.fileName ?? "";
  const dot = filename.lastIndexOf(".");
  return dot > 0 && dot < filename.length - 1 ? filename.slice(dot + 1).toLowerCase() : "";
}

export function sortCourseNotes(notes: MyNote[], sort: CourseNoteSort, direction: CourseNoteSortDirection): MyNote[] {
  const sign = direction === "asc" ? 1 : -1;
  return [...notes].sort((a, b) => {
    let comparison = 0;
    if (sort === "modified") {
      const aTime = Date.parse(a.driveModifiedTime ?? a.updatedAt);
      const bTime = Date.parse(b.driveModifiedTime ?? b.updatedAt);
      if (!Number.isFinite(aTime) || !Number.isFinite(bTime)) {
        if (Number.isFinite(aTime) !== Number.isFinite(bTime)) return Number.isFinite(aTime) ? -1 : 1;
      } else comparison = aTime - bTime;
    } else if (sort === "type") {
      const aType = fileType(a), bType = fileType(b);
      if (!aType || !bType) { if (Boolean(aType) !== Boolean(bType)) return aType ? -1 : 1; }
      comparison = collator.compare(aType, bType);
    } else comparison = collator.compare(a.title, b.title);
    return sign * comparison || collator.compare(a.title, b.title) || collator.compare(a.id, b.id);
  });
}

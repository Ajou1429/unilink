// 강의자료 정렬 (이름·수정일·파일 종류). 순수 함수라 Node 테스트에서 바로 읽는다.
import type { Material } from "./data";


export type MaterialSort = "name" | "modified" | "type";
const collator = new Intl.Collator("ko", { numeric: true, sensitivity: "base" });
const extension = (m: Material) => {
  const name = m.kind === "note" ? m.note.fileName ?? "" : m.kind === "file" ? m.file.name : "";
  const dot = name.lastIndexOf(".");
  return dot > 0 && dot < name.length - 1 ? name.slice(dot + 1).toLowerCase() : "";
};
const modified = (m: Material) => Date.parse(m.kind === "note" ? m.note.driveModifiedTime ?? m.note.updatedAt : m.date) || 0;

export function sortMaterials(list: Material[], sort: MaterialSort, direction: "asc" | "desc") {
  const sign = direction === "asc" ? 1 : -1;
  return [...list].sort((a, b) => {
    const comparison = sort === "modified" ? modified(a) - modified(b)
      : sort === "type" ? collator.compare(extension(a), extension(b))
        : collator.compare(a.title, b.title);
    return sign * comparison || collator.compare(a.title, b.title) || collator.compare(a.key, b.key);
  });
}

import { RequestError } from "./requestLimits.ts";
export const MAX_PDF_BYTES = 20 * 1024 * 1024;
export const MAX_PDF_PAGES = 50;
export const MAX_LABELS = 1000;

export function validatePdf(bytes: Uint8Array, mime: string) {
  if (bytes.length > MAX_PDF_BYTES) throw new RequestError("PDF는 20MB 이하만 업로드할 수 있습니다.", 413);
  if (mime !== "application/pdf" || new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-") {
    throw new RequestError("유효한 PDF 파일이 필요합니다.", 415);
  }
}
export function validatePageCount(count: number) {
  if (!Number.isInteger(count) || count < 1 || count > MAX_PDF_PAGES) {
    throw new RequestError("PDF는 1~50페이지까지 분석할 수 있습니다.", 413);
  }
}
export function flattenLabels(items: unknown): string[] {
  if (!Array.isArray(items) || items.length > MAX_LABELS) throw new RequestError("분석 결과 형식이 올바르지 않습니다.", 502);
  const out: string[] = [];
  for (const item of items) {
    if (!item || typeof item.number !== "string" || !item.number.trim() || item.number.length > 100 ||
        !Array.isArray(item.parts) || item.parts.length > 100 ||
        item.parts.some((p: unknown) => typeof p !== "string" || p.length > 16)) {
      throw new RequestError("분석 결과 형식이 올바르지 않습니다.", 502);
    }
    const number = item.number.trim();
    out.push(...(item.parts.length ? item.parts.map((p: string) => `${number}(${p.trim()})`) : [number]));
    if (out.length > MAX_LABELS) throw new RequestError("분석된 문제가 너무 많습니다.", 502);
  }
  return out;
}

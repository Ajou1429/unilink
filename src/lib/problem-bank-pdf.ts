import { extractLabels, MAX_LABELS, MIN_CHARS_PER_PAGE, pageLines, type PdfTextItem } from "./problem-bank-labels.ts";

// 브라우저에서 PDF를 읽어 문항 번호를 뽑는다. 파일은 서버로 보내지 않는다.
export const MAX_PDF_BYTES = 20 * 1024 * 1024;
export const MAX_PDF_PAGES = 300;

export type ProblemExtractionCode = "NO_TEXT" | "NO_PROBLEMS" | "INVALID_PDF" | "TOO_LARGE";

export class ProblemExtractionError extends Error {
  constructor(public code: ProblemExtractionCode, message: string) {
    super(message);
  }
}

interface PdfPage {
  getViewport(input: { scale: number }): { width: number };
  getTextContent(): Promise<{ items: PdfTextItem[] }>;
  cleanup(): void;
}

interface PdfDocument {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfPage>;
  destroy(): Promise<void>;
}

interface PdfJsModule {
  getDocument(input: { data: ArrayBuffer; isEvalSupported: boolean }): { promise: Promise<PdfDocument> };
  GlobalWorkerOptions: { workerSrc: string };
}

export async function extractProblemsFromPdf(file: File): Promise<string[]> {
  if (file.size > MAX_PDF_BYTES) {
    throw new ProblemExtractionError("TOO_LARGE", "PDF는 20MB 이하만 넣을 수 있어요. 문제가 있는 페이지만 잘라서 넣어 주세요.");
  }
  const { getDocument, GlobalWorkerOptions } = (await import("pdfjs-dist/build/pdf.mjs")) as PdfJsModule;
  GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

  let pdf: PdfDocument;
  try {
    pdf = await getDocument({ data: await file.arrayBuffer(), isEvalSupported: false }).promise;
  } catch {
    throw new ProblemExtractionError("INVALID_PDF", "올바른 PDF 파일이 아니에요.");
  }

  const lines: string[] = [];
  const pageChars: number[] = [];
  try {
    if (pdf.numPages > MAX_PDF_PAGES) {
      throw new ProblemExtractionError(
        "TOO_LARGE",
        `${MAX_PDF_PAGES}페이지 이하만 넣을 수 있어요. 교과서 전체 대신 연습문제 페이지만 잘라서 넣어 주세요.`,
      );
    }
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const { items } = await page.getTextContent();
      const pageText = pageLines(items, page.getViewport({ scale: 1 }).width);
      pageChars.push(pageText.reduce((n, line) => n + line.replace(/\s/g, "").length, 0));
      lines.push(...pageText);
      page.cleanup();
    }
  } finally {
    await pdf.destroy();
  }

  const labels = extractLabels(lines).slice(0, MAX_LABELS);
  const imagePages = pageChars.filter((c) => c < MIN_CHARS_PER_PAGE).length;
  // 문제를 그림으로 붙인 PDF(스캔·캡처)는 글자가 거의 없는 페이지가 생긴다
  if (!labels.length && imagePages > 0) {
    throw new ProblemExtractionError(
      "NO_TEXT",
      `${pageChars.length}페이지 중 ${imagePages}페이지가 글자 없이 이미지로 되어 있어요. 스캔하거나 캡처한 문제는 아직 자동 인식을 지원하지 않아요.`,
    );
  }
  if (!labels.length) {
    throw new ProblemExtractionError("NO_PROBLEMS", "PDF에서 문항 번호를 찾지 못했어요.");
  }
  return labels;
}

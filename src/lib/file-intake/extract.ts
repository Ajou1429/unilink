import { pageLines, type PdfTextItem } from "../problem-bank-labels.ts";
import { ooxmlText, readZipEntries, slideNumber } from "./zip.ts";

// 분류에 필요한 만큼만 읽는다: 앞쪽 몇 페이지 텍스트, 텍스트가 없으면 첫 페이지의 작은 이미지.

export type IntakeFileKind = "pdf" | "image" | "pptx" | "docx";

export const INTAKE_ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.pptx,.docx";
export const MAX_INTAKE_BYTES = 20 * 1024 * 1024;
/** 텍스트가 이보다 적으면 이미지로 분석한다 */
export const MIN_TEXT_CHARS = 40;
const IMAGE_MAX_SIDE = 768;

export const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export interface ExtractedContent {
  kind: IntakeFileKind;
  text: string;
  /** 텍스트가 거의 없을 때만 만든 첫 페이지 JPEG (data URL) */
  image?: string;
}

export function detectKind(file: Pick<File, "name" | "type">): IntakeFileKind | null {
  const name = file.name.toLowerCase();
  if (file.type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (/^image\/(png|jpeg|webp)$/.test(file.type) || /\.(png|jpe?g|webp)$/.test(name)) return "image";
  if (file.type === PPTX_MIME || name.endsWith(".pptx")) return "pptx";
  if (file.type === DOCX_MIME || name.endsWith(".docx")) return "docx";
  return null;
}

/** 저장할 때 쓸 MIME. 브라우저가 Office 형식의 type을 비워 두는 경우가 있어 확장자로 채운다. */
export function normalizedFile(file: File, kind: IntakeFileKind): File {
  const type = kind === "pptx" ? PPTX_MIME : kind === "docx" ? DOCX_MIME : kind === "pdf" ? "application/pdf" : file.type;
  return file.type === type ? file : new File([file], file.name, { type, lastModified: file.lastModified });
}

interface PdfPage {
  getViewport(input: { scale: number }): { width: number; height: number };
  getTextContent(): Promise<{ items: PdfTextItem[] }>;
  render(input: { canvasContext: CanvasRenderingContext2D; viewport: unknown }): { promise: Promise<void> };
  cleanup(): void;
}
interface PdfDocument { numPages: number; getPage(n: number): Promise<PdfPage>; destroy(): Promise<void> }
interface PdfJsModule {
  getDocument(input: { data: ArrayBuffer; isEvalSupported: boolean }): { promise: Promise<PdfDocument> };
  GlobalWorkerOptions: { workerSrc: string };
}

async function loadPdf(file: Blob) {
  const { getDocument, GlobalWorkerOptions } = (await import("pdfjs-dist/build/pdf.mjs")) as PdfJsModule;
  GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  return getDocument({ data: await file.arrayBuffer(), isEvalSupported: false }).promise;
}

function canvasToJpeg(canvas: HTMLCanvasElement) {
  return canvas.toDataURL("image/jpeg", 0.6);
}

function scaledCanvas(width: number, height: number) {
  const scale = Math.min(1, IMAGE_MAX_SIDE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  return { canvas, scale };
}

async function extractPdf(file: Blob, pages: number, maxChars: number): Promise<ExtractedContent> {
  const pdf = await loadPdf(file);
  try {
    const lines: string[] = [];
    for (let p = 1; p <= Math.min(pages, pdf.numPages); p++) {
      const page = await pdf.getPage(p);
      const { items } = await page.getTextContent();
      lines.push(...pageLines(items, page.getViewport({ scale: 1 }).width));
      page.cleanup();
      if (lines.join("\n").length >= maxChars) break;
    }
    const text = lines.join("\n").slice(0, maxChars);
    if (text.replace(/\s/g, "").length >= MIN_TEXT_CHARS) return { kind: "pdf", text };
    // 스캔·손글씨 PDF: 첫 페이지만 작게 렌더링
    const page = await pdf.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const { canvas, scale } = scaledCanvas(base.width, base.height);
    const context = canvas.getContext("2d");
    if (!context) return { kind: "pdf", text };
    await page.render({ canvasContext: context, viewport: page.getViewport({ scale }) }).promise;
    page.cleanup();
    return { kind: "pdf", text, image: canvasToJpeg(canvas) };
  } finally {
    await pdf.destroy();
  }
}

async function extractImage(file: Blob): Promise<ExtractedContent> {
  const bitmap = await createImageBitmap(file);
  const { canvas } = scaledCanvas(bitmap.width, bitmap.height);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return { kind: "image", text: "", image: canvasToJpeg(canvas) };
}

async function extractOffice(file: Blob, kind: "pptx" | "docx", pages: number, maxChars: number): Promise<ExtractedContent> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (kind === "docx") {
    const entries = await readZipEntries(bytes, (name) => name === "word/document.xml");
    const xml = entries.get("word/document.xml");
    return { kind, text: xml ? ooxmlText(new TextDecoder().decode(xml)).slice(0, maxChars) : "" };
  }
  const entries = await readZipEntries(bytes, (name) => /^ppt\/slides\/slide\d+\.xml$/.test(name));
  const slides = [...entries.keys()].sort((a, b) => slideNumber(a) - slideNumber(b)).slice(0, Math.max(3, pages + 1));
  const text = slides.map((name) => ooxmlText(new TextDecoder().decode(entries.get(name)!))).join("\n\n");
  return { kind, text: text.slice(0, maxChars) };
}

/**
 * 분류용 내용 추출. pages: PDF 앞쪽 몇 페이지(슬라이드)까지 읽을지, maxChars: 보낼 최대 글자 수.
 * 일반 분류는 2페이지·2500자, 강의계획서 항목 추출은 3페이지·6000자를 쓴다.
 */
export async function extractContent(file: Blob & { name?: string }, kind: IntakeFileKind, pages = 2, maxChars = 2500): Promise<ExtractedContent> {
  if (kind === "pdf") return extractPdf(file, pages, maxChars);
  if (kind === "image") return extractImage(file);
  return extractOffice(file, kind, pages, maxChars);
}

// 문제은행·강의노트 PDF 분석 (브라우저)
// 1) 페이지마다 글자 레이어가 있는지 본다(글자 PDF / 이미지 PDF).
// 2) 글자 PDF는 규칙으로 문항 번호와 위치를 찾는다.
// 3) 동의했으면 페이지 이미지(+글자 줄)를 AI로 보내 번호·영역·본문(LaTeX)·그림 영역을 받는다.
// 4) 규칙과 AI 번호를 맞춰 보고, 필요한 영역을 고해상도로 렌더링해 크롭한다.
import { getSupabaseBrowserClient } from "../supabase-client";
import { getStorageUser, privateStorage } from "../private-storage";
import { extractLabelPositions, MIN_CHARS_PER_PAGE, pageLinesDetailed, type PageLine, type PdfTextItem } from "../problem-bank-labels";
import { MAX_PDF_BYTES, MAX_PDF_PAGES, ProblemExtractionError } from "../problem-bank-pdf";
import {
  listProblems, saveProblems, setProblemContent, type ProblemContent,
} from "../problem-bank-storage";
import type { Box, PageAnalysis } from "../../../supabase/functions/_shared/problemAnalyze.ts";
import { lectureCandidatePages, mergeLecture, mergeProblemSet, padBox, type AnalyzedProblem, type Region, type RuleHit } from "./merge";
import { removeCrops, saveCrop } from "./images";

/** 문제 파일은 앞 60페이지, 강의노트는 후보 25페이지까지만 AI로 본다 */
export const AI_PAGE_LIMIT = 60;
export const LECTURE_PAGE_LIMIT = 25;
const AI_IMAGE_WIDTH = 1400;
const CROP_PAGE_WIDTH = 2200;
const MAX_CANVAS_PIXELS = 16_000_000;

// ── 동의 ──
const CONSENT_KEY = "unilink:problem-analysis-consent";
export type ProblemConsent = "granted" | "declined" | null;
export function getProblemConsent(): ProblemConsent {
  try {
    const value = privateStorage.getItem(CONSENT_KEY);
    return value === "granted" || value === "declined" ? value : null;
  } catch {
    return null;
  }
}
export function setProblemConsent(value: Exclude<ProblemConsent, null>) {
  try { privateStorage.setItem(CONSENT_KEY, value); } catch { /* 이번 화면에서만 */ }
}

export async function problemAiAvailable() {
  const db = getSupabaseBrowserClient();
  if (!db) return false;
  const user = (await db.auth.getUser()).data.user;
  return Boolean(user && getStorageUser() === user.id);
}

// ── pdf.js ──
interface Viewport { width: number; height: number }
interface PdfPage {
  getViewport(input: { scale: number }): Viewport;
  getTextContent(): Promise<{ items: PdfTextItem[] }>;
  render(input: { canvasContext: CanvasRenderingContext2D; viewport: Viewport }): { promise: Promise<void> };
  cleanup(): void;
}
interface PdfDocument { numPages: number; getPage(n: number): Promise<PdfPage>; destroy(): Promise<void> }
interface PdfJsModule {
  getDocument(input: { data: ArrayBuffer; isEvalSupported: boolean }): { promise: Promise<PdfDocument> };
  GlobalWorkerOptions: { workerSrc: string };
}

interface PageInfo { width: number; height: number; lines: PageLine[]; text: string; chars: number }

async function openPdf(file: File): Promise<PdfDocument> {
  if (file.size > MAX_PDF_BYTES) throw new ProblemExtractionError("TOO_LARGE", "PDF는 20MB 이하만 넣을 수 있어요. 문제가 있는 페이지만 잘라서 넣어 주세요.");
  const { getDocument, GlobalWorkerOptions } = (await import("pdfjs-dist/build/pdf.mjs")) as PdfJsModule;
  GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  try {
    return await getDocument({ data: await file.arrayBuffer(), isEvalSupported: false }).promise;
  } catch {
    throw new ProblemExtractionError("INVALID_PDF", "올바른 PDF 파일이 아니에요.");
  }
}

async function readPages(pdf: PdfDocument): Promise<PageInfo[]> {
  if (pdf.numPages > MAX_PDF_PAGES) throw new ProblemExtractionError("TOO_LARGE", `${MAX_PDF_PAGES}페이지 이하만 넣을 수 있어요.`);
  const pages: PageInfo[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const { width, height } = page.getViewport({ scale: 1 });
    const lines = pageLinesDetailed((await page.getTextContent()).items, width);
    const text = lines.map((line) => line.text).join("\n");
    pages.push({ width, height, lines, text, chars: text.replace(/\s/g, "").length });
    page.cleanup();
  }
  return pages;
}

/** PDF 좌표(아래가 0) 줄 → 0~1 상자(위가 0) */
function lineBox(line: PageLine, page: PageInfo): Box {
  return {
    x0: Math.max(0, line.x0 / page.width), x1: Math.min(1, line.x1 / page.width),
    y0: Math.max(0, 1 - (line.y + line.h) / page.height), y1: Math.min(1, 1 - (line.y - line.h * 0.3) / page.height),
  };
}

/** 규칙 번호의 영역: 번호 줄부터 같은 페이지의 다음 번호 전까지 */
function ruleHits(pages: PageInfo[]): RuleHit[] {
  const all: { text: string; page: number; line: PageLine }[] = [];
  pages.forEach((page, index) => page.lines.forEach((line) => all.push({ text: line.text, page: index + 1, line })));
  const found = extractLabelPositions(all.map((item) => item.text));
  const startLines = [...new Set(found.map((item) => item.line))].sort((a, b) => a - b);
  return found.map(({ label, line }) => {
    const start = all[line];
    const page = pages[start.page - 1];
    const top = lineBox(start.line, page).y0;
    const next = startLines.find((other) => other > line && all[other].page === start.page);
    const pageBottom = Math.max(...page.lines.map((item) => lineBox(item, page).y1));
    // 다음 번호 줄 바로 위에서 끊는다(크롭 여백이 다음 문제를 침범하지 않도록 여백만큼 더 올린다)
    const bottom = next !== undefined ? lineBox(all[next].line, page).y0 - 0.02 : pageBottom;
    return { label, region: { page: start.page, box: { x0: 0.03, y0: Math.max(0, top - 0.005), x1: 0.97, y1: Math.max(top + 0.02, bottom) } } };
  });
}

async function renderPage(pdf: PdfDocument, n: number, targetWidth: number) {
  const page = await pdf.getPage(n);
  const base = page.getViewport({ scale: 1 });
  let scale = targetWidth / base.width;
  if (base.width * base.height * scale * scale > MAX_CANVAS_PIXELS) scale = Math.sqrt(MAX_CANVAS_PIXELS / (base.width * base.height));
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: context, viewport }).promise;
  page.cleanup();
  return canvas;
}

/** 크롭 영역 안에서 흰 여백을 걷어 낸 내용 범위(여백 약간 남김). 내용이 없으면 원래 영역. */
function contentBounds(canvas: HTMLCanvasElement, x: number, y: number, w: number, h: number) {
  const { data } = canvas.getContext("2d")!.getImageData(x, y, w, h);
  let left = w, right = -1, top = h, bottom = -1;
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      const i = (row * w + col) * 4;
      if (data[i] < 235 || data[i + 1] < 235 || data[i + 2] < 235) {
        if (col < left) left = col;
        if (col > right) right = col;
        if (row < top) top = row;
        if (row > bottom) bottom = row;
      }
    }
  }
  if (right < 0) return { x, y, w, h };
  const margin = Math.round(canvas.width * 0.01);
  const x0 = Math.max(0, left - margin), y0 = Math.max(0, top - margin);
  const x1 = Math.min(w, right + 1 + margin), y1 = Math.min(h, bottom + 1 + margin);
  return { x: x + x0, y: y + y0, w: x1 - x0, h: y1 - y0 };
}

class AiStop extends Error {}

async function analyzePage(pdf: PdfDocument, pages: PageInfo[], n: number, mode: "problems" | "lecture", fileName: string): Promise<PageAnalysis> {
  const db = getSupabaseBrowserClient();
  if (!db) throw new AiStop("로그인이 필요합니다.");
  const canvas = await renderPage(pdf, n, AI_IMAGE_WIDTH);
  const image = canvas.toDataURL("image/jpeg", 0.82);
  const page = pages[n - 1];
  const lines = page.chars >= MIN_CHARS_PER_PAGE ? page.lines.slice(0, 300).map((line) => ({ text: line.text, box: lineBox(line, page) })) : [];
  const { data, error } = await db.functions.invoke<{ result: PageAnalysis }>("problem-analyze", { body: { consent: true, mode, fileName, page: n, image, lines } });
  if (error || !data?.result) {
    let message = "AI 분석을 하지 못했습니다.";
    let status = 0;
    try {
      const response = (error as { context?: Response } | null)?.context;
      status = response?.status ?? 0;
      const body = response ? await response.json() : null;
      if (typeof body?.error === "string") message = body.error;
    } catch {
      // 기본 문구
    }
    // 한도·설정·로그인 문제는 남은 페이지도 같으므로 멈춘다
    if ([401, 429, 503].includes(status)) throw new AiStop(message);
    throw new Error(message);
  }
  return data.result;
}

async function cropRegions(pdf: PdfDocument, items: AnalyzedProblem[]) {
  const byPage = new Map<number, Region[]>();
  for (const item of items) for (const region of item.crops) byPage.set(region.page, [...(byPage.get(region.page) ?? []), region]);
  const out = new Map<Region, { blob: Blob; w: number; h: number }>();
  for (const [n, regions] of [...byPage].sort((a, b) => a[0] - b[0])) {
    const canvas = await renderPage(pdf, n, CROP_PAGE_WIDTH);
    for (const region of regions) {
      const box = padBox(region.box);
      const sx = Math.floor(box.x0 * canvas.width), sy = Math.floor(box.y0 * canvas.height);
      const w = Math.max(1, Math.ceil((box.x1 - box.x0) * canvas.width)), h = Math.max(1, Math.ceil((box.y1 - box.y0) * canvas.height));
      const trim = contentBounds(canvas, sx, sy, w, h);
      const crop = document.createElement("canvas");
      crop.width = trim.w; crop.height = trim.h;
      crop.getContext("2d")!.drawImage(canvas, trim.x, trim.y, trim.w, trim.h, 0, 0, trim.w, trim.h);
      const blob = await new Promise<Blob | null>((resolve) => crop.toBlob(resolve, "image/webp", 0.92));
      if (blob) out.set(region, { blob, w: trim.w, h: trim.h });
    }
  }
  return out;
}

export interface ReadyProblem extends Omit<AnalyzedProblem, "crops"> { images: { blob: Blob; w: number; h: number }[] }
export interface AnalysisResult {
  problems: ReadyProblem[];
  aiUsed: boolean;
  /** AI가 멈춘 이유(한도 등). 규칙 결과만 남는다. */
  aiError: string | null;
  imagePages: number;
  pageCount: number;
}

export async function analyzeProblemPdf(
  file: File,
  options: { mode: "problems" | "lecture"; useAi: boolean; onProgress?: (done: number, total: number) => void },
): Promise<AnalysisResult> {
  const pdf = await openPdf(file);
  try {
    const pages = await readPages(pdf);
    const imagePages = pages.filter((page) => page.chars < MIN_CHARS_PER_PAGE).length;
    const rule = options.mode === "problems" ? ruleHits(pages) : [];
    const targets = !options.useAi ? []
      : options.mode === "problems" ? pages.map((_, index) => index + 1).slice(0, AI_PAGE_LIMIT)
        : lectureCandidatePages(pages.map((page) => page.text), 5, LECTURE_PAGE_LIMIT);
    const results: { page: number; analysis: PageAnalysis | null }[] = [];
    const analyzed = new Set<number>();
    let aiError: string | null = null;
    let done = 0;
    options.onProgress?.(0, targets.length);
    // 3페이지씩 동시에
    for (let i = 0; i < targets.length && !aiError; i += 3) {
      await Promise.all(targets.slice(i, i + 3).map(async (n) => {
        try {
          results.push({ page: n, analysis: await analyzePage(pdf, pages, n, options.mode, file.name) });
          analyzed.add(n);
        } catch (error) {
          if (error instanceof AiStop) aiError = error.message;
          results.push({ page: n, analysis: null });
        } finally {
          options.onProgress?.(++done, targets.length);
        }
      }));
    }
    results.sort((a, b) => a.page - b.page);
    const merged = options.mode === "problems" ? mergeProblemSet(rule, results, analyzed) : mergeLecture(results);
    if (!merged.length) {
      if (aiError) throw new ProblemExtractionError("NO_PROBLEMS", aiError);
      if (options.mode === "problems" && !analyzed.size && imagePages > 0) {
        throw new ProblemExtractionError("NO_TEXT", `${pages.length}페이지 중 ${imagePages}페이지가 글자 없이 이미지로 되어 있어요. AI 분석에 동의하면 이미지로 읽어 문항을 찾아요.`);
      }
      throw new ProblemExtractionError("NO_PROBLEMS", options.mode === "problems" ? "PDF에서 문항 번호를 찾지 못했어요." : "강의노트에서 문제를 찾지 못했어요.");
    }
    const crops = await cropRegions(pdf, merged);
    const problems = merged.map(({ crops: regions, ...item }) => ({ ...item, images: regions.flatMap((region) => crops.get(region) ?? []) }));
    return { problems, aiUsed: analyzed.size > 0, aiError, imagePages, pageCount: pages.length };
  } finally {
    await pdf.destroy();
  }
}

/** 번호를 저장하고(이미 있으면 그대로) 본문·그림을 채운다. 기존 이해도는 바꾸지 않는다. */
export async function saveAnalyzedProblems(subjectId: string, sourceFile: string, problems: ReadyProblem[], kind: ProblemContent["kind"]) {
  const result = await saveProblems(subjectId, sourceFile, problems.map((problem) => problem.label));
  const existing = (await listProblems(subjectId)).filter((problem) => problem.sourceFile === sourceFile);
  const byLabel = new Map(existing.map((problem) => [problem.label, problem]));
  let filled = 0;
  for (const problem of problems) {
    const target = byLabel.get(problem.label.trim());
    if (!target) continue;
    const images = [];
    for (const image of problem.images) images.push({ src: await saveCrop(image.blob), w: image.w, h: image.h });
    const old = target.content?.images.map((image) => image.src) ?? [];
    await setProblemContent(target.id, {
      v: 1, kind, page: problem.page, text: problem.text, images,
      check: problem.status === "check", origin: problem.origin,
    });
    if (old.length) await removeCrops(old);
    filled++;
  }
  return { ...result, filled, check: problems.filter((problem) => problem.status === "check").length };
}

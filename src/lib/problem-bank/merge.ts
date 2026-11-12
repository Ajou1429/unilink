// 문제은행 분석 결과 합치기 (순수 함수, Node 테스트 대상)
// - 문제 파일: 규칙(글자 PDF)으로 찾은 번호와 AI가 찾은 번호를 맞춰 본다. 둘 다 찾으면 확인됨, 한쪽만 찾으면 "확인 필요".
// - 강의노트: AI가 찾은 문제에 페이지 번호로 이름을 붙인다(p.12, 여러 개면 p.12-1, p.12-2).
// - 본문을 정확히 옮긴 문제는 텍스트 + 그림만 크롭, 아니면 문제 영역 전체를 크롭한다.
import type { Box, PageAnalysis } from "../../../supabase/functions/_shared/problemAnalyze.ts";

export interface Region { page: number; box: Box }
/** 규칙으로 찾은 번호와 그 문제 영역(다음 번호 전까지) */
export interface RuleHit { label: string; region: Region }
export interface PageResult { page: number; analysis: PageAnalysis | null }

export interface AnalyzedProblem {
  label: string;
  page: number;
  /** verified: 규칙과 AI가 같은 번호를 찾음(또는 강의노트 페이지 번호) / check: 사용자 확인 필요 */
  status: "verified" | "check";
  origin: "both" | "rule" | "ai";
  /** 수식은 LaTeX($…$). 정확히 옮기지 못한 문제는 null */
  text: string | null;
  /** 이미지로 보여 줄 영역 */
  crops: Region[];
}

interface Block {
  label: string;
  parts: string[];
  page: number;
  top: number;
  regions: Region[];
  figures: Region[];
  text: string;
  complete: boolean;
}

function blocks(pages: PageResult[]): Block[] {
  const out: Block[] = [];
  for (const { page, analysis } of pages) {
    analysis?.problems.forEach((problem) => {
      const last = out[out.length - 1];
      if (problem.continues_previous && last) {
        last.regions.push({ page, box: problem.box });
        last.figures.push(...problem.figures.map((box) => ({ page, box })));
        if (problem.text) last.text = `${last.text}\n\n${problem.text}`.trim();
        last.complete = last.complete && problem.text_complete;
        return;
      }
      out.push({
        label: problem.label, parts: problem.parts, page, top: problem.box.y0,
        regions: [{ page, box: problem.box }], figures: problem.figures.map((box) => ({ page, box })),
        text: problem.text, complete: problem.text_complete,
      });
    });
  }
  return out;
}

function content(block: Block) {
  return block.complete && block.text ? { text: block.text, crops: block.figures } : { text: null, crops: block.regions };
}

/** 번호 없는 문제·강의노트 문제의 이름: 페이지에 하나면 p.12, 여러 개면 p.12-1, p.12-2 */
function pageLabels(list: Block[]) {
  const perPage = new Map<number, number>();
  for (const block of list) perPage.set(block.page, (perPage.get(block.page) ?? 0) + 1);
  const seen = new Map<number, number>();
  return list.map((block) => {
    const index = (seen.get(block.page) ?? 0) + 1;
    seen.set(block.page, index);
    return perPage.get(block.page)! > 1 ? `p.${block.page}-${index}` : `p.${block.page}`;
  });
}

/**
 * 문제 파일. analyzedPages: AI로 본 페이지 번호(나머지 페이지의 규칙 번호는 AI 확인 없이 남는다).
 * AI를 전혀 쓰지 않았으면 규칙 번호를 그대로 쓰고(사용자가 저장 전 목록을 확인), 영역 크롭만 붙인다.
 */
export function mergeProblemSet(rule: RuleHit[], pages: PageResult[], analyzedPages: Set<number>): AnalyzedProblem[] {
  const aiBlocks = blocks(pages);
  const unnamed = pageLabels(aiBlocks.filter((block) => !block.label));
  let unnamedIndex = 0;
  const ai: (AnalyzedProblem & { top: number })[] = [];
  for (const block of aiBlocks) {
    const labels = block.label
      ? (block.parts.length ? block.parts.map((part) => `${block.label}(${part})`) : [block.label])
      : [unnamed[unnamedIndex++]];
    for (const label of labels) ai.push({ label, page: block.page, top: block.top, status: "check", origin: "ai", ...content(block) });
  }
  const ruleLabels = new Set(rule.map((hit) => hit.label));
  const aiLabels = new Set(ai.map((item) => item.label));
  for (const item of ai) {
    if (ruleLabels.has(item.label)) { item.status = "verified"; item.origin = "both"; }
  }
  const ruleOnly = rule.filter((hit) => !aiLabels.has(hit.label)).map((hit) => ({
    label: hit.label, page: hit.region.page, top: hit.region.box.y0,
    status: analyzedPages.size === 0 ? "verified" as const : "check" as const,
    origin: "rule" as const, text: null, crops: [hit.region],
  }));
  const seen = new Set<string>();
  return [...ai, ...ruleOnly]
    .sort((a, b) => a.page - b.page || a.top - b.top)
    .filter((item) => (seen.has(item.label) ? false : (seen.add(item.label), true)))
    .map(({ top, ...item }) => { void top; return item; });
}

/** 강의노트: 페이지 번호로 이름을 붙인다. 페이지 번호는 확실하므로 확인됨으로 둔다. */
export function mergeLecture(pages: PageResult[]): AnalyzedProblem[] {
  const list = blocks(pages);
  const labels = pageLabels(list);
  return list.map((block, index) => ({ label: labels[index], page: block.page, status: "verified", origin: "ai", ...content(block) }));
}

/** 강의노트에서 AI로 볼 페이지: 문제 표시가 있는 글자 페이지 + 글자가 거의 없는 이미지 페이지 */
const LECTURE_HINT = /(문제|예제|연습|퀴즈|quiz|exercise|example|problem|question|\bQ\s*\d|\bQ\.)/i;
export function lectureCandidatePages(pageTexts: string[], minChars: number, limit: number) {
  const out: number[] = [];
  pageTexts.forEach((text, index) => {
    const chars = text.replace(/\s/g, "").length;
    if (chars < minChars || LECTURE_HINT.test(text)) out.push(index + 1);
  });
  return out.slice(0, limit);
}

/** 크롭 영역을 조금 넓히고 페이지 안으로 자른다 */
export function padBox(box: Box, pad = 0.012): Box {
  return {
    x0: Math.max(0, box.x0 - pad), y0: Math.max(0, box.y0 - pad),
    x1: Math.min(1, box.x1 + pad), y1: Math.min(1, box.y1 + pad),
  };
}

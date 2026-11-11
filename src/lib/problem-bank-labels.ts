// 문제은행 PDF -> 문항 번호 규칙 기반 추출 (외부 API 없음).
// 원본: eugenepark0404/AJOUBuild-problembank의 backend/src/ruleParser.js, frontend/src/labels.js.
// 1) pdf.js 텍스트 조각을 위치로 묶어 줄을 만들고, 2단 페이지는 왼쪽 단 → 오른쪽 단 순서로 읽는다.
// 2) 줄 맨 앞 번호 패턴으로 후보를 찾고, 가장 긴 증가 수열만 남겨 본문 숫자·답안지 번호를 걸러낸다.
// 3) 다음 문제 전까지의 (a)(b)…를 소문항으로 붙인다. 라벨 형식: "2.27", "2.27(a)".
// pdf.js에 의존하지 않는 순수 함수만 두어 Node 테스트에서 그대로 검증한다.

export interface PdfTextItem {
  str?: string;
  transform: number[];
  width: number;
  height?: number;
}

export const MAX_LABEL_LENGTH = 40;
export const MAX_LABELS = 1000;
// 페이지의 공백 제외 글자 수가 이보다 적으면 이미지(스캔·캡처) 페이지로 본다
export const MIN_CHARS_PER_PAGE = 30;

// 난이도 표시: "*3.37", "**3.49", "†4.2"
const MARKER = /^[*†‡]+\s*/;
const KEYWORD = /^(?:problem|prob\.|exercise|ex\.|question|문제|문항|q)\s*\.?\s*(\d{1,3}(?:\.\d{1,3}){0,2})(?=$|\s|[.):](?!\d))/i;
// "2.27" 또는 3단 "2.1.4"
const DOTTED = /^(\d{1,2}(?:\.\d{1,3}){1,2})(?=$|\s|[.)](?!\d))/;
// 소수 바로 뒤 짧은 소문자 단어: 단위(m, kg, mol)나 이어지는 문장(and, of)
const CONTINUATION = /^\s+[a-zµμΩ°%]{1,3}(?=$|[\s.,;:)/])/;
const PLAIN = /^(?:(\d{1,3})\s*[.)](?!\d)|\[(\d{1,3})\]|(\d{1,3})\s*번)(?=\s*\S)/;
const PART = /(?:^|(?<=[\s:;,.]))\(([a-z]|[ivx]{1,4}|\d{1,2})\)(?=\s|$)|^([a-z])\)(?=\s)/gm;

const ROMAN = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x", "xi", "xii"];

interface Segment {
  x0: number;
  x1: number;
  text: string;
}

interface Run {
  str: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

// 기준선이 가까운 조각은 한 행, 행 안에서 넓은 간격(단 사이 여백)이 있으면 구간을 나눈다.
export function pageLines(items: PdfTextItem[], pageWidth: number): string[] {
  const runs: Run[] = items
    .filter((it) => typeof it.str === "string" && it.str.length > 0)
    .map((it) => ({
      str: it.str as string,
      x: it.transform[4],
      y: it.transform[5],
      w: it.width,
      h: Math.abs(it.transform[3]) || it.height || 10,
    }))
    .sort((a, b) => b.y - a.y || a.x - b.x);

  const rows: { y: number; h: number; runs: Run[] }[] = [];
  for (const run of runs) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(row.y - run.y) <= Math.max(row.h, run.h) * 0.5) row.runs.push(run);
    else rows.push({ y: run.y, h: run.h, runs: [run] });
  }

  const segments = rows.flatMap((row) => splitRow(row.runs));
  const leftEdge = pageWidth * 0.45;
  const rightStarts = segments.filter((s) => s.x0 >= leftEdge).length;
  // 가운데를 가로지르는 긴 줄이 많으면 1단 페이지(수식 번호도 오른쪽에서 시작하므로)
  const crossing = segments.filter((s) => s.x0 < leftEdge && s.x1 > pageWidth * 0.55).length;
  const ordered =
    rightStarts >= 3 && rightStarts > crossing
      ? [...segments.filter((s) => s.x0 < leftEdge), ...segments.filter((s) => s.x0 >= leftEdge)]
      : segments;
  return ordered.map((s) => s.text).filter(Boolean);
}

function splitRow(rowRuns: Run[]): Segment[] {
  rowRuns.sort((a, b) => a.x - b.x);
  const segments: Segment[] = [];
  let seg: Segment | null = null;
  for (const r of rowRuns) {
    const gap = seg ? r.x - seg.x1 : 0;
    if (!seg || gap > r.h * 1.5) {
      seg = { x0: r.x, x1: r.x + r.w, text: r.str };
      segments.push(seg);
      continue;
    }
    if (gap > r.h * 0.15 && !/\s$/.test(seg.text) && !/^\s/.test(r.str)) seg.text += " ";
    seg.text += r.str;
    seg.x1 = Math.max(seg.x1, r.x + r.w);
  }
  for (const s of segments) s.text = s.text.replace(/\s+/g, " ").trim();
  return segments;
}

interface Candidate {
  label: string;
  key: number[];
  dotted: boolean;
  line: number;
  end: number;
  keyword: boolean;
}

function findCandidate(line: string, index: number): Candidate | null {
  const lead = MARKER.exec(line)?.[0].length ?? 0;
  const text = line.slice(lead);
  let m = KEYWORD.exec(text);
  if (m) return candidate(m[1], index, lead + m[0].length, true);
  m = DOTTED.exec(text);
  // "0.75 m and mass", "2.5 kg."는 줄바꿈된 측정값이지 2.5번 문제가 아니다
  if (m && !m[1].startsWith("0") && !CONTINUATION.test(text.slice(m[0].length))) {
    return candidate(m[1], index, lead + m[0].length, false);
  }
  m = PLAIN.exec(text);
  if (m) return candidate(m[1] ?? m[2] ?? m[3], index, lead + m[0].length, false);
  return null;
}

function candidate(label: string, line: number, end: number, keyword: boolean): Candidate {
  return { label, key: label.split(".").map(Number), dotted: label.includes("."), line, end, keyword };
}

function compareKeys(a: number[], b: number[]) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? -1) - (b[i] ?? -1);
    if (d) return d;
  }
  return 0;
}

// 번호 기준 가장 긴 순증가 부분수열, O(n log n)
function longestIncreasing(cands: Candidate[]): Candidate[] {
  const tails: number[] = [];
  const prev: number[] = new Array(cands.length).fill(-1);
  for (let i = 0; i < cands.length; i++) {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (compareKeys(cands[tails[mid]].key, cands[i].key) < 0) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0) prev[i] = tails[lo - 1];
    tails[lo] = i;
  }
  const out: Candidate[] = [];
  for (let i = tails.length ? tails[tails.length - 1] : -1; i !== -1; i = prev[i]) out.push(cands[i]);
  return out.reverse();
}

function pickProblems(lines: string[]): Candidate[] {
  const all = lines.map(findCandidate).filter((c): c is Candidate => c !== null);
  const keyword = all.filter((c) => c.keyword);
  // "Problem 3", "문제 5" 같은 머리말을 쓰는 파일이면 그것만 믿는다
  const pool = keyword.length >= 2 ? keyword : all;
  const dotted = pool.filter((c) => c.dotted);
  const plain = pool.filter((c) => !c.dotted);
  const dottedRun = longestIncreasing(dotted);
  const plainRun = longestIncreasing(plain);
  return dottedRun.length >= plainRun.length ? fillGaps(dottedRun, dotted) : fillGaps(plainRun, plain);
}

function successor(key: number[]) {
  return [...key.slice(0, -1), key[key.length - 1] + 1];
}

// 위아래로 단 블록이 나뉜 페이지는 3.1.3이 3.1.2보다 먼저 읽혀 증가 수열에서 빠질 수 있다.
// 바로 앞 번호의 다음 값이면 되살린다.
function fillGaps(run: Candidate[], pool: Candidate[]): Candidate[] {
  const taken = new Set(run.map((c) => c.label));
  const out: Candidate[] = [];
  run.forEach((c, i) => {
    out.push(c);
    let last = c;
    for (;;) {
      const want = successor(last.key);
      const next = run[i + 1];
      if (next && compareKeys(want, next.key) >= 0) break;
      const found = pool.find((p) => !taken.has(p.label) && compareKeys(p.key, want) === 0);
      if (!found) break;
      taken.add(found.label);
      out.push(found);
      last = found;
    }
  });
  return out;
}

type PartKind = "letter" | "roman" | "digit";

function nextPart(kind: PartKind, prev: string | null): string {
  if (prev === null) return kind === "digit" ? "1" : kind === "roman" ? "i" : "a";
  if (kind === "digit") return String(Number(prev) + 1);
  if (kind === "roman") return ROMAN[ROMAN.indexOf(prev) + 1];
  return String.fromCharCode(prev.charCodeAt(0) + 1);
}

// 소문항은 (a)/(i)/(1)부터 순서대로여야 한다. 순서를 벗어난 것은 참조이지 소문항이 아니다.
function findParts(text: string): string[] {
  const tokens = [...text.matchAll(PART)].map((m) => m[1] ?? m[2]);
  const first = tokens.find((t) => t === "a" || t === "i" || t === "1");
  if (!first) return [];
  const kind: PartKind = first === "a" ? "letter" : first === "i" ? "roman" : "digit";
  const parts: string[] = [];
  for (const t of tokens) {
    if (t === nextPart(kind, parts.length ? parts[parts.length - 1] : null)) parts.push(t);
  }
  // "(a)" 하나만 있으면 대개 다른 문제를 가리키는 참조다
  return parts.length >= 2 ? parts : [];
}

export function extractLabels(lines: string[]): string[] {
  const problems = pickProblems(lines);
  // 문제 본문은 읽는 순서상 다음 문제 전까지 (번호 순서와 다를 수 있다)
  const starts = problems.map((p) => p.line).sort((a, b) => a - b);
  const labels: string[] = [];
  problems.forEach((p) => {
    const stop = starts.find((s) => s > p.line) ?? lines.length;
    const body = [lines[p.line].slice(p.end), ...lines.slice(p.line + 1, stop)].join("\n");
    const parts = findParts(body);
    if (parts.length) parts.forEach((part) => labels.push(`${p.label}(${part})`));
    else labels.push(p.label);
  });
  return labels;
}

// ---------------------------------------------------------------------------
// 직접 입력
//   "1~10" -> 1…10 / "2.1~2.5", "2.1~5" -> 2.1…2.5 / "3(a~c)" -> 3(a), 3(b), 3(c)
//   "1-2"처럼 하이픈은 많은 교재에서 "1장 2번" 표기이므로 범위로 보지 않는다. 쉼표·줄바꿈으로 구분.
// ---------------------------------------------------------------------------
const MAX_RANGE = 500;

export function expandLabels(input: string): string[] {
  const out: string[] = [];
  for (const raw of input.split(/[,\n]+/)) {
    const item = raw.trim().replace(/\s+/g, " ");
    if (item) out.push(...expandItem(item));
  }
  return out;
}

function expandItem(item: string): string[] {
  let m = /^(.+?)\(\s*([a-z]|\d+)\s*~\s*([a-z]|\d+)\s*\)$/i.exec(item);
  if (m) {
    const [, base, from, to] = m;
    const letters = /[a-z]/i.test(from);
    if (letters !== /[a-z]/i.test(to)) return [item];
    const a = letters ? from.toLowerCase().charCodeAt(0) : Number(from);
    const b = letters ? to.toLowerCase().charCodeAt(0) : Number(to);
    if (b < a || b - a > MAX_RANGE) return [item];
    return range(a, b).map((v) => `${base.trim()}(${letters ? String.fromCharCode(v) : v})`);
  }
  m = /^((?:\d+\.)*)(\d+)\s*~\s*((?:\d+\.)*)(\d+)$/.exec(item);
  if (m) {
    const [, prefix, from, toPrefix, to] = m;
    if (toPrefix && toPrefix !== prefix) return [item];
    const a = Number(from);
    const b = Number(to);
    if (b < a || b - a > MAX_RANGE) return [item];
    return range(a, b).map((v) => `${prefix}${v}`);
  }
  return [item];
}

function range(a: number, b: number) {
  return Array.from({ length: b - a + 1 }, (_, i) => a + i);
}

// "2.9" < "2.10", "3" < "3(a)" < "3(b)"
export function compareLabels(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true });
}

// 문항별 이해도 0-5 -> 0-100%
export function understandingPercent(problems: { level: number }[]) {
  if (!problems.length) return 0;
  const sum = problems.reduce((acc, p) => acc + p.level, 0);
  return Math.round((sum / (problems.length * 5)) * 100);
}

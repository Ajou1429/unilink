import { test } from "node:test";
import assert from "node:assert/strict";
import {
  analyzeModelInput, analyzeSchema, normalizeLabel, parseAnalyzeOutput, parseAnalyzeRequest,
} from "../supabase/functions/_shared/problemAnalyze.ts";
import { lectureCandidatePages, mergeLecture, mergeProblemSet, padBox } from "../src/lib/problem-bank/merge.ts";
import { splitMath } from "../src/lib/problem-bank/math.ts";
import { extractLabelPositions } from "../src/lib/problem-bank-labels.ts";

const IMAGE = "data:image/jpeg;base64,AAAA";
const box = (y0, y1, x0 = 0.05, x1 = 0.95) => ({ x0, y0, x1, y1 });
const problem = (label, y0, y1, extra = {}) => ({ label, parts: [], continues_previous: false, box: box(y0, y1), text: `문제 ${label}: $\\frac{1}{2}$`, text_complete: true, figures: [], ...extra });

test("request: consent, image format and page are required; lines are clipped to the page", () => {
  assert.throws(() => parseAnalyzeRequest({ consent: false, mode: "problems", image: IMAGE, page: 1 }), /동의/);
  assert.throws(() => parseAnalyzeRequest({ consent: true, mode: "problems", image: "http://x", page: 1 }), /이미지/);
  assert.throws(() => parseAnalyzeRequest({ consent: true, mode: "problems", image: IMAGE, page: 0 }), /페이지/);
  const request = parseAnalyzeRequest({ consent: true, mode: "lecture", image: IMAGE, page: 3, fileName: "3장.pdf",
    lines: [{ text: "1. 다음을 구하시오", box: box(0.1, 0.12) }, { text: "", box: box(0.2, 0.3) }, { text: "x", box: { x0: 2, y0: 0, x1: 3, y1: 1 } }] });
  assert.equal(request.lines.length, 2, "empty text dropped; out-of-page box clamped");
  assert.equal(request.lines[1].box.x0, 1);
  const input = analyzeModelInput(request)[0].content;
  assert.match(input[0].text, /\[0\.050,0\.100,0\.950,0\.120\] 1\. 다음을 구하시오/);
  assert.equal(input[1].detail, "high");
  assert.match(analyzeModelInput({ ...request, lines: [] })[0].content[0].text, /no text layer/);
});

test("schema is strict and the output is re-checked", () => {
  const item = analyzeSchema.properties.problems.items;
  assert.deepEqual([...item.required].sort(), Object.keys(item.properties).sort());
  const out = parseAnalyzeOutput({ has_problems: false, problems: [
    { ...problem("Problem 2.27.", 0.1, 0.4), parts: ["(a)", "b", "zz", "a"] },
    { ...problem("Q3", 0.5, 0.505) },
    { ...problem("4", 0.6, 0.9), text: "", text_complete: true, figures: [box(0.7, 0.8), box(0.7, 0.701)] },
    null,
  ] });
  assert.equal(out.has_problems, true);
  assert.deepEqual(out.problems.map((p) => p.label), ["2.27", "4"], "tiny boxes are dropped");
  assert.deepEqual(out.problems[0].parts, ["a", "b"]);
  assert.equal(out.problems[1].text_complete, false, "empty text is never complete");
  assert.equal(out.problems[1].figures.length, 1);
  assert.equal(normalizeLabel("문제 12."), "12");
  assert.equal(normalizeLabel("*3.37"), "3.37");
});

test("problem set: numbers found by both rule and AI are verified, the rest need a check", () => {
  const rule = [
    { label: "1", region: { page: 1, box: box(0.1, 0.3) } },
    { label: "2(a)", region: { page: 1, box: box(0.3, 0.6) } },
    { label: "2(b)", region: { page: 1, box: box(0.3, 0.6) } },
    { label: "7", region: { page: 2, box: box(0.5, 0.9) } },
  ];
  const pages = [
    { page: 1, analysis: { has_problems: true, problems: [problem("1", 0.1, 0.3), { ...problem("2", 0.3, 0.6), parts: ["a", "b"] }, problem("3", 0.6, 0.95, { text_complete: false, figures: [box(0.7, 0.8)] })] } },
    { page: 2, analysis: { has_problems: true, problems: [problem("", 0.05, 0.2, { continues_previous: true, text: "(이어짐)" }), problem("", 0.3, 0.4)] } },
  ];
  const merged = mergeProblemSet(rule, pages, new Set([1, 2]));
  const by = Object.fromEntries(merged.map((p) => [p.label, p]));
  assert.deepEqual(merged.map((p) => p.label), ["1", "2(a)", "2(b)", "3", "p.2", "7"], "page then position order");
  assert.equal(by["1"].status, "verified");
  assert.equal(by["2(b)"].origin, "both");
  assert.equal(by["3"].status, "check", "AI only");
  assert.equal(by["3"].text, null, "incomplete text → whole region as image");
  assert.equal(by["3"].crops.length, 2, "continuation on page 2 is attached to problem 3");
  assert.deepEqual([by["7"].origin, by["7"].status, by["7"].crops[0].page], ["rule", "check", 2]);
  assert.match(by["1"].text, /frac/);
  assert.equal(by["1"].crops.length, 0, "complete text without figures → no image");
  assert.equal(by["p.2"].label, "p.2", "unnumbered problem named by page");
});

test("problem set without AI: rule numbers are kept (the user confirms them) with region crops", () => {
  const merged = mergeProblemSet([{ label: "1", region: { page: 1, box: box(0.1, 0.3) } }], [], new Set());
  assert.deepEqual([merged[0].status, merged[0].origin, merged[0].text, merged[0].crops.length], ["verified", "rule", null, 1]);
});

test("lecture notes: p.N, or p.N-1, p.N-2 when a slide has several problems", () => {
  const merged = mergeLecture([
    { page: 4, analysis: { has_problems: true, problems: [problem("", 0.1, 0.4)] } },
    { page: 12, analysis: { has_problems: true, problems: [problem("1", 0.1, 0.4), problem("", 0.5, 0.8)] } },
    { page: 13, analysis: { has_problems: false, problems: [] } },
  ]);
  assert.deepEqual(merged.map((p) => p.label), ["p.4", "p.12-1", "p.12-2"]);
  assert.ok(merged.every((p) => p.status === "verified"));
  const pages = lectureCandidatePages(["3장 프로세스", "예제 3. 다음을 구하시오", "", "Exercise 2", "Q1. why?"], 5, 3);
  assert.deepEqual(pages, [2, 3, 4], "hint words and scanned pages (short title slides are skipped), limited");
  const padded = padBox(box(0, 1));
  assert.deepEqual([padded.x0.toFixed(3), padded.y0, padded.x1.toFixed(3), padded.y1], ["0.038", 0, "0.962", 1]);
});

test("math text is split into text, inline and display formulas", () => {
  assert.deepEqual(splitMath("값은 $\\sqrt{2}$ 이고 $$x^2+1=0$$ 끝, 가격 \\$5"), [
    { type: "text", value: "값은 " }, { type: "inline", value: "\\sqrt{2}" }, { type: "text", value: " 이고 " },
    { type: "display", value: "x^2+1=0" }, { type: "text", value: " 끝, 가격 $5" },
  ]);
  assert.deepEqual(splitMath("$5 and\nmore"), [{ type: "text", value: "$5 and\nmore" }], "unclosed $ is text");
  assert.deepEqual(splitMath("\\[\\frac{a}{b}\\]"), [{ type: "display", value: "\\frac{a}{b}" }]);
});

test("rule extraction now also reports where each number starts", () => {
  const lines = ["Chapter 2", "1. Find x.", "(a) first", "(b) second", "2. Prove y."];
  assert.deepEqual(extractLabelPositions(lines), [{ label: "1(a)", line: 1 }, { label: "1(b)", line: 1 }, { label: "2", line: 4 }]);
});

test("migration 0036: problem content column and problem-analysis quota", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { readFileSync, readdirSync } = await import("node:fs");
  const db = new PGlite();
  const A = "11111111-1111-4111-8111-111111111111";
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create schema storage;
      create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      create table storage.objects(id uuid default gen_random_uuid(), bucket_id text, name text);
      alter table storage.objects enable row level security;
      create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1, '/') $$;
      grant usage on schema public, auth, storage to anon, authenticated, service_role;
      alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    `);
    const directory = new URL("../supabase/migrations/", import.meta.url);
    for (const file of readdirSync(directory).filter((f) => !f.startsWith("0002")).sort()) {
      await db.exec(readFileSync(new URL(file, directory), "utf8").replace('create extension if not exists "pgcrypto";', ""));
    }
    await db.exec(`insert into auth.users values ('${A}')`);
    const subject = (await db.query(`insert into public.problem_bank_subjects(user_id,name) values ($1,'수학') returning id`, [A])).rows[0].id;
    const id = (await db.query(`insert into public.problem_bank_problems(subject_id,user_id,label,source_file) values ($1,$2,'1','midterm::a.pdf') returning id`, [subject, A])).rows[0].id;
    await db.query(`update public.problem_bank_problems set content=$1 where id=$2`, [{ v: 1, text: "$x$", images: [] }, id]);
    await assert.rejects(db.query(`update public.problem_bank_problems set content='"text"'::jsonb where id=$1`, [id]), /content_shape/);
    const reserve = async (mode) => (await db.query("select public.reserve_file_classification($1, $2) as ok", [A, mode])).rows[0].ok;
    for (let i = 0; i < 400; i++) assert.equal(await reserve("problem"), true);
    assert.equal(await reserve("problem"), false, "400 pages per day");
    assert.equal(await reserve("chat"), true, "separate from chat");
    assert.equal(await reserve("classify"), true, "separate from file classification");
  } finally {
    await db.close();
  }
});

test("typical AI LaTeX renders without KaTeX errors (fractions, roots, powers, limits, integrals)", async () => {
  const katex = (await import("katex")).default;
  const text = String.raw`다음 $$\int_0^2 \left(x^2 + 3x\right)\,dx$$ 와 $\displaystyle \lim_{x\to\infty} \frac{f(x)}{x}$, $\sqrt[3]{a^{2}b}$, $e^{-x^2}$, $\vec{F} = m\vec{a}$`;
  const parts = splitMath(text).filter((part) => part.type !== "text");
  assert.equal(parts.length, 5);
  for (const part of parts) {
    const html = katex.renderToString(part.value, { displayMode: part.type === "display", throwOnError: false, strict: "ignore" });
    assert.ok(!html.includes("katex-error"), part.value);
  }
});

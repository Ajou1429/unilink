import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  compareLabels,
  expandLabels,
  extractLabels,
  pageLines,
  understandingPercent,
} from "../src/lib/problem-bank-labels.ts";

test("textbook-style dotted numbers with sub-parts", () => {
  const lines = [
    "Chapter 2 Problems",
    "2.27 A block of mass 0.5 kg slides down a ramp.",
    "(a) Find the acceleration. (b) Find the normal force.",
    "2.31 Two charges are placed 1.5 m apart.",
    "3.37 Show that the field is uniform.",
    "(a) Use Gauss's law.",
    "(b) Compare with (a).",
    "(c) Sketch the field lines.",
  ];
  assert.deepEqual(extractLabels(lines), ["2.27(a)", "2.27(b)", "2.31", "3.37(a)", "3.37(b)", "3.37(c)"]);
});

test("wrapped measurements are not problem numbers", () => {
  const lines = ["1.2 The rod has length", "0.75 m and mass", "2.5 kg. Find its moment of inertia.", "1.3 Find the period.", "1.4 Find the energy."];
  assert.deepEqual(extractLabels(lines), ["1.2", "1.3", "1.4"]);
});

test("Korean exam numbering and headings", () => {
  assert.deepEqual(
    extractLabels(["2026학년도 중간고사", "1. 다음 극한값을 구하시오.", "2. 고유값을 구하시오.", "(1) 대칭행렬일 때", "(2) 직교행렬일 때", "3번 미분방정식을 푸시오."]),
    ["1", "2(1)", "2(2)", "3"],
  );
  assert.deepEqual(
    extractLabels(["Problem 1 Prove it.", "1. Base case.", "2. Inductive step.", "Problem 2 Compute.", "문제 3 계산하시오."]),
    ["1", "2", "3"],
  );
});

test("answer keys, lone references, roman sub-parts, markers and three-level numbers", () => {
  assert.deepEqual(extractLabels(["1) First", "2) Second", "3) Third", "Answers", "1) 42", "2) 7"]), ["1", "2", "3"]);
  assert.deepEqual(extractLabels(["4.1 Using result (a) of 3.9, find x.", "4.2 Find y."]), ["4.1", "4.2"]);
  assert.deepEqual(extractLabels(["5.1 Consider (i) the free case and (ii) the driven case."]), ["5.1(i)", "5.1(ii)"]);
  assert.deepEqual(extractLabels(["2.1.1 Find I1.", "*2.1.2 Find V.", "**2.2.1 Find P.", "FIGURE P2.2.1"]), ["2.1.1", "2.1.2", "2.2.1"]);
});

test("a problem read out of order is recovered when it is the next number", () => {
  const lines = ["3.1.1 Find I1.", "3.1.3 Use nodal analysis.", "summary text", "3.1.2 Find I2.", "3.1.4 Find Io."];
  assert.deepEqual(extractLabels(lines), ["3.1.1", "3.1.2", "3.1.3", "3.1.4"]);
});

test("manual input ranges", () => {
  assert.deepEqual(expandLabels("1~3, 2.1~3\n4(a~c), 5(1~2), 1-2, 7"), [
    "1", "2", "3", "2.1", "2.2", "2.3", "4(a)", "4(b)", "4(c)", "5(1)", "5(2)", "1-2", "7",
  ]);
  assert.deepEqual(expandLabels("2.1.4 ~ 2.1.6"), ["2.1.4", "2.1.5", "2.1.6"]);
  assert.deepEqual(expandLabels("5~1, 2.1~3.4, 3(a~2)"), ["5~1", "2.1~3.4", "3(a~2)"]);
});

test("natural order and understanding percent", () => {
  assert.deepEqual(["2.10", "3(b)", "2.9", "3", "3(a)"].sort(compareLabels), ["2.9", "2.10", "3", "3(a)", "3(b)"]);
  assert.equal(understandingPercent([]), 0);
  assert.equal(understandingPercent([{ level: 0 }, { level: 5 }]), 50);
  assert.equal(understandingPercent([{ level: 5 }, { level: 4 }, { level: 2 }, { level: 0 }]), 55);
});

// pdf.js가 실제로 만든 텍스트 조각으로 줄 복원·2단 읽기까지 확인한다
async function readLines(bytes) {
  const pdf = await getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, verbosity: 0 }).promise;
  const lines = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    lines.push(...pageLines((await page.getTextContent()).items, page.getViewport({ scale: 1 }).width));
  }
  await pdf.destroy();
  return lines;
}

test("end to end: real PDF text, multi-page and two-column", async () => {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const draw = (page, texts, x) => texts.forEach((text, i) => page.drawText(text, { x, y: 790 - i * 18, size: 10, font }));
  const one = doc.addPage([595, 842]);
  draw(one, ["Homework 3", "2.27 A ball is thrown upward.", "(a) How high? (b) How long?", "2.28 A car accelerates."], 50);
  const two = doc.addPage([595, 842]);
  draw(two, ["2.29 Find the current", "through the resistor.", "2.30 Find the voltage", "across the source."], 40);
  draw(two, ["2.31 Find the power", "delivered to the load.", "2.32 Find the energy", "stored in the coil."], 320);
  const labels = extractLabels(await readLines(await doc.save()));
  assert.deepEqual(labels, ["2.27(a)", "2.27(b)", "2.28", "2.29", "2.30", "2.31", "2.32"]);
});

test("migration 0033 keeps existing rows and makes labels unique per file", async () => {
  const db = new PGlite();
  const A = "11111111-1111-4111-8111-111111111111";
  const S = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
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
    const files = readdirSync(directory).filter((f) => !f.startsWith("0002")).sort();
    const apply = (file) => db.exec(readFileSync(new URL(file, directory), "utf8").replace('create extension if not exists "pgcrypto";', ""));
    for (const file of files.filter((f) => f < "0033")) await apply(file);

    // rows saved before files were tracked
    await db.exec(`insert into auth.users values ('${A}');
      insert into problem_bank_subjects(id,user_id,name) values ('${S}','${A}','전자기학');
      insert into problem_bank_problems(subject_id,user_id,label,level,source_file) values
        ('${S}','${A}','1',3,'hw1.pdf'), ('${S}','${A}','2',5,null);`);

    for (const file of files.filter((f) => f >= "0033")) await apply(file);

    const { rows } = await db.query("select label, level, source_file from problem_bank_problems order by label");
    assert.deepEqual(rows, [
      { label: "1", level: 3, source_file: "hw1.pdf" },
      { label: "2", level: 5, source_file: "" },
    ]);
    // same number in another file is allowed, a duplicate in the same file is not
    await db.exec(`insert into problem_bank_problems(subject_id,user_id,label,source_file) values ('${S}','${A}','1','hw2.pdf')`);
    await assert.rejects(
      db.exec(`insert into problem_bank_problems(subject_id,user_id,label,source_file) values ('${S}','${A}','1','hw2.pdf')`),
      /duplicate key/,
    );
    await db.exec(`insert into problem_bank_problems(subject_id,user_id,label) values ('${S}','${A}','3')`);
    assert.equal((await db.query("select source_file from problem_bank_problems where label='3'")).rows[0].source_file, "");
    await assert.rejects(
      db.exec(`insert into problem_bank_problems(subject_id,user_id,label,source_file) values ('${S}','${A}','  ','hw2.pdf')`),
      /problem_bank_problems_label_length/,
    );
  } finally {
    await db.close();
  }
});

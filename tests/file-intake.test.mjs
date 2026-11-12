import { test } from "node:test";
import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import {
  examPeriodFor, guessDocType, guessLocally, matchCourse, needsAiClassification,
} from "../src/lib/file-intake/classify-local.ts";
import {
  buildSyllabusCourse, findSyllabusCourse, mergeSyllabusIntoCourse, syllabusSchedules, syllabusTerm,
} from "../src/lib/file-intake/syllabus.ts";
import { ooxmlText, readZipEntries, slideNumber } from "../src/lib/file-intake/zip.ts";
import {
  parseClassifyOutput, parseClassifyRequest, parseSyllabusOutput, modelInput,
} from "../supabase/functions/_shared/fileClassify.ts";

const courses = [
  { id: "os", name: "운영체제", courseCode: "SCE213" },
  { id: "circuit", name: "회로이론", courseCode: "ECE201" },
  { id: "circuit-lab", name: "회로이론및실험", courseCode: "ECE202" },
  { id: "db", name: "데이터베이스" },
];

test("course matching: code first, then a single (longest) course name", () => {
  assert.deepEqual(matchCourse("Midterm review SCE 213", "slides.pdf", courses), { courseId: "os", confident: true });
  assert.deepEqual(matchCourse("", "회로이론및실험_3주차.pdf", courses), { courseId: "circuit-lab", confident: true });
  assert.equal(matchCourse("데이터 베이스 정규화", "week5.pdf", courses).courseId, "db");
  assert.deepEqual(matchCourse("운영체제와 데이터베이스 비교", "note.pdf", courses), { courseId: null, confident: false });
  assert.deepEqual(matchCourse("nothing here", "scan.pdf", courses), { courseId: null, confident: false });
});

test("document type heuristics", () => {
  assert.deepEqual(guessDocType("2026학년도 2학기 강의계획서\n성적평가: 중간 30%", "file.pdf"), { type: "syllabus", confident: true });
  const problems = "연습문제\n1. Find the current\n2. Find the voltage\n3. Find the power\n4. Find the energy";
  assert.deepEqual(guessDocType(problems, "hw.pdf"), { type: "problem_set", confident: true });
  assert.deepEqual(guessDocType("", "IMG_0012.jpg"), { type: "notes", confident: false });
  assert.equal(guessDocType(`Chapter 3 Process Scheduling ${"x".repeat(400)}`, "lecture3.pdf").type, "lecture");
});

test("AI is skipped only when both the type and the course are certain (and never for a syllabus)", () => {
  const lecture = guessLocally(`SCE213 Chapter 4 Threads ${"y".repeat(400)}`, "운영체제_ch4.pdf", courses);
  assert.equal(lecture.courseId, "os");
  assert.equal(needsAiClassification(lecture), false);
  assert.equal(needsAiClassification(guessLocally("", "scan.jpg", courses)), true);
  assert.equal(needsAiClassification(guessLocally("운영체제 강의계획서 성적평가", "운영체제.pdf", courses)), true);
});

test("problem bank range follows the semester half", () => {
  assert.equal(examPeriodFor(new Date(2026, 3, 10)), "midterm");
  assert.equal(examPeriodFor(new Date(2026, 10, 20)), "final");
});

const syllabus = {
  course_name: "회로이론", course_code: "ECE201", professor: "김교수", credits: 3, category: "전필",
  year: 2026, semester: "2학기",
  meetings: [{ day: "화", start: "10:30", end: "11:45", room: "팔달관 409" }, { day: "목", start: "10:30", end: "11:45", room: "팔달관 409" }],
  schedule_text: null,
  grading: [{ item: "중간고사", weight: 30 }, { item: "기말고사", weight: 40 }, { item: "과제", weight: 20 }, { item: "출석", weight: 10 }],
};

test("syllabus → term, schedules and a new timetable course", () => {
  assert.equal(syllabusTerm(syllabus, "2026년 1학기"), "2026년 2학기");
  assert.equal(syllabusTerm({ year: null, semester: null }, "2026년 1학기"), "2026년 1학기");
  const course = buildSyllabusCourse(syllabus, "2026년 2학기", "new", "#123456");
  assert.deepEqual(course.days, ["화", "목"]);
  assert.equal(course.location, "팔달관 409");
  assert.equal(course.courseType, "major");
  assert.equal(course.gradingWeights.length, 4);
  // 교시 표기만 있으면 아주대 교시표로 해석
  assert.deepEqual(syllabusSchedules({ meetings: [], schedule_text: "월A(팔409) 목H(팔410)" }).map((s) => [s.day, s.startTime]), [["월", "09:00"], ["목", "19:30"]]);
});

test("an existing course in the same term is reused (by code, then name) and only gains grading", () => {
  const existing = [
    { id: "c1", term: "2026년 2학기", name: "회로 이론", courseCode: "ECE 201", professor: "", location: "", color: "", days: ["월"], startTime: "09:00", endTime: "10:15", credits: 3 },
    { id: "c2", term: "2026년 1학기", name: "회로이론", professor: "", location: "", color: "", days: [], startTime: "", endTime: "", credits: 3 },
  ];
  const found = findSyllabusCourse(existing, syllabus, "2026년 2학기");
  assert.equal(found.id, "c1");
  const merged = mergeSyllabusIntoCourse(found, syllabus);
  assert.deepEqual(merged.days, ["월"]);
  assert.equal(merged.professor, "김교수");
  assert.equal(merged.gradingWeights.length, 4);
  assert.equal(findSyllabusCourse(existing, { course_code: null, course_name: "회로이론" }, "2026년 1학기").id, "c2");
  assert.equal(findSyllabusCourse(existing, syllabus, "2025년 2학기"), undefined);
});

function zip(entries) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const [name, text] of Object.entries(entries)) {
    const nameBytes = Buffer.from(name);
    const data = deflateRawSync(Buffer.from(text));
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8);
    local.writeUInt32LE(data.length, 18); local.writeUInt32LE(Buffer.byteLength(text), 22); local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(8, 10);
    central.writeUInt32LE(data.length, 20); central.writeUInt32LE(Buffer.byteLength(text), 24);
    central.writeUInt16LE(nameBytes.length, 28); central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, data);
    centrals.push(central, nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(entries).length, 8); end.writeUInt16LE(Object.keys(entries).length, 10);
  end.writeUInt32LE(centralSize, 12); end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, ...centrals, end]));
}

test("PPTX/DOCX text is read from the zip without a library", async () => {
  const bytes = zip({
    "ppt/slides/slide10.xml": "<p:sld><a:p><a:r><a:t>Slide ten</a:t></a:r></a:p></p:sld>",
    "ppt/slides/slide2.xml": "<p:sld><a:p><a:r><a:t>운영체제 2주차</a:t></a:r></a:p><a:p><a:r><a:t>Process &amp; Thread</a:t></a:r></a:p></p:sld>",
    "docProps/app.xml": "<x/>",
  });
  const entries = await readZipEntries(bytes, (name) => name.startsWith("ppt/slides/"));
  assert.deepEqual([...entries.keys()].sort((a, b) => slideNumber(a) - slideNumber(b)), ["ppt/slides/slide2.xml", "ppt/slides/slide10.xml"]);
  assert.equal(ooxmlText(new TextDecoder().decode(entries.get("ppt/slides/slide2.xml"))), "운영체제 2주차\nProcess & Thread");
  assert.equal(ooxmlText('<w:document><w:p><w:r><w:t xml:space="preserve">강의 계획서 </w:t></w:r><w:r><w:t>회로이론</w:t></w:r></w:p></w:document>'), "강의 계획서 회로이론");
});

test("server input validation: consent, size limits, image format, course list", () => {
  assert.throws(() => parseClassifyRequest({ mode: "classify", text: "a" }), /동의/);
  assert.throws(() => parseClassifyRequest({ consent: true, mode: "classify", text: " " }), /내용/);
  assert.throws(() => parseClassifyRequest({ consent: true, mode: "classify", text: "", image: "data:text/html;base64,AAAA" }), /이미지/);
  const request = parseClassifyRequest({ consent: true, mode: "classify", fileName: "a.pdf", text: "x".repeat(9000),
    courses: [{ id: "os", name: "운영체제", code: "SCE213" }, { id: "", name: "bad" }] });
  assert.equal(request.text.length, 6000);
  assert.deepEqual(request.courses, [{ id: "os", name: "운영체제", code: "SCE213" }]);
  const input = modelInput({ ...request, image: "data:image/jpeg;base64,AAAA" });
  assert.equal(input[0].content[1].detail, "low");
  assert.match(input[0].content[0].text, /os\t운영체제\tSCE213/);
});

test("model output is validated: unknown course ids and bad times are dropped", () => {
  const courseList = [{ id: "os", name: "운영체제", code: null }];
  assert.deepEqual(parseClassifyOutput({ doc_type: "lecture", course_id: "nope", course_name: " 운영체제 ", course_code: null }, courseList),
    { doc_type: "lecture", course_id: null, course_name: "운영체제", course_code: null });
  assert.equal(parseClassifyOutput({ doc_type: "weird", course_id: "os" }, courseList).doc_type, "other");
  const parsed = parseSyllabusOutput({ ...syllabus, year: 1999, meetings: [...syllabus.meetings, { day: "금", start: "25:00", end: "26:00", room: null }],
    grading: [...syllabus.grading, { item: "보너스", weight: 150 }] });
  assert.equal(parsed.year, null);
  assert.equal(parsed.meetings.length, 2);
  assert.equal(parsed.grading.length, 4);
});

test("migration 0034: daily AI classification limit per user and PPTX/DOCX in note storage", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { readFileSync, readdirSync } = await import("node:fs");
  const db = new PGlite();
  const A = "11111111-1111-4111-8111-111111111111";
  const B = "22222222-2222-4222-8222-222222222222";
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
    await db.exec(`insert into auth.users values ('${A}'), ('${B}')`);
    const reserve = async (user, mode) => (await db.query("select public.reserve_file_classification($1, $2) as ok", [user, mode])).rows[0].ok;
    for (let i = 0; i < 50; i++) assert.equal(await reserve(A, "syllabus"), true);
    assert.equal(await reserve(A, "syllabus"), false, "syllabus extraction is capped at 50 per day");
    for (let i = 0; i < 150; i++) assert.equal(await reserve(A, "classify"), true);
    assert.equal(await reserve(A, "classify"), false, "all calls are capped at 200 per day");
    assert.equal(await reserve(B, "classify"), true, "another user is not affected");
    assert.equal(await reserve(A, "drop table"), false);
    const types = (await db.query("select allowed_mime_types from storage.buckets where id='note-files'")).rows[0].allowed_mime_types;
    assert.ok(types.includes("application/vnd.openxmlformats-officedocument.presentationml.presentation"));
    assert.ok(types.includes("application/pdf"));
  } finally {
    await db.close();
  }
});

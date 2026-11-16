import { test } from "node:test";
import assert from "node:assert/strict";
import { guessDocType, syllabusScore } from "../src/lib/file-intake/classify-local.ts";
import { parseAjouSyllabus, syllabusSchedules } from "../src/lib/file-intake/syllabus.ts";
import { SYLLABI } from "./fixtures/ajou-syllabi.mjs";

test("the four Ajou syllabi are classified as syllabus from the first page alone", () => {
  for (const [name, text] of Object.entries(SYLLABI)) {
    const firstPage = text.slice(0, 2500);
    assert.ok(syllabusScore(firstPage, "20261116232321261.pdf") >= 7, `${name}: ${syllabusScore(firstPage, "x.pdf")}`);
    assert.deepEqual(guessDocType(firstPage, "20261116232321261.pdf"), { type: "syllabus", confident: true }, name);
  }
});

test("course facts are read from the Ajou form without AI", () => {
  const expected = {
    dataStructures: ["자료구조및알고리즘이해", "ECE256", "이정원", "전선", 3, [["출석", 10], ["중간고사", 30], ["기말고사", 30], ["과제", 30]]],
    signals: ["신호 및 시스템", "ECE241", "이채우", "전필", 3, [["출석", 5], ["중간고사", 40], ["기말고사", 40], ["퀴즈", 10], ["과제", 10]]],
    fields: ["전자장론", "ECE224", "이학준", "전필", 3, [["중간고사", 35], ["기말고사", 45], ["과제", 20]]],
    circuits: ["전자회로1", "ECE201", "김장현", "전필", 3, [["출석", 20], ["중간고사", 35], ["기말고사", 35], ["과제", 10]]],
  };
  for (const [name, [course, code, professor, category, credits, grading]] of Object.entries(expected)) {
    const info = parseAjouSyllabus(SYLLABI[name]);
    assert.ok(info, name);
    assert.deepEqual([info.course_name, info.course_code, info.professor, info.category, info.credits, info.year, info.semester],
      [course, code, professor, category, credits, 2026, "2학기"], name);
    assert.deepEqual(info.grading.map((g) => [g.item, g.weight]), grading, name);
  }
});

test("class times in Ajou period codes become timetable slots", () => {
  const slots = syllabusSchedules(parseAjouSyllabus(SYLLABI.dataStructures));
  assert.deepEqual(slots.map((s) => s.day), ["월", "목"]);
  assert.ok(slots.every((s) => /^\d{2}:\d{2}$/.test(s.startTime) && s.startTime < s.endTime));
  const circuits = syllabusSchedules(parseAjouSyllabus(SYLLABI.circuits));
  assert.deepEqual(circuits.map((s) => s.day), ["화", "목"]);
});

test("ordinary lecture notes and problem sets are not mistaken for a syllabus", () => {
  const lecture = "Chapter 3 Processes\n" + "A process is a program in execution. ".repeat(30) + "\nweek 3 lecture slides";
  const problems = "Homework 2 Exercises\n1. Normalize R.\n2. Find keys.\n3. Write SQL.\n4. Explain BCNF.\n5. Draw ER.";
  assert.equal(guessDocType(lecture, "ch3.pdf").type, "lecture");
  assert.equal(guessDocType(problems, "hw2.pdf").type, "problem_set");
  assert.equal(parseAjouSyllabus(lecture), null);
});

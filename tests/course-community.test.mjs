import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildCourseBoards, catalogBoardKey, courseBoardKey, filterCoursePosts, referenceForBoard, resolvePostBoardKey, matchesBoardSearch } from "../src/lib/course-community.ts";
import { getCommunityPosts, getCommunitySnapshot, publishCommunityPost, addPostComment, togglePostLike, hasLikedPost, COMMUNITY_STORAGE_KEY } from "../src/lib/community-storage.ts";
const catalog = JSON.parse(readFileSync(new URL("../src/data/ajou-2026-2.json", import.meta.url), "utf8"));
const section = catalog.courses.find((s) => s.registrationNumber === "X024");
const makeCourse = (id = "custom-id", term = catalog.term) => ({ id, term, catalogSource: "ajou", catalogSubjectId: section.subjectId, registrationNumber: section.registrationNumber, courseCode: section.courseCode, name: section.name, days: [], professor: section.professor, credits: 3, startTime: "09:00", endTime: "10:00", color: "#123456", location: "" });
const post = (id = "post", extra = {}) => ({ id, authorId: "a", authorName: "익명", isAnonymous: true, category: "질문", title: "과제 질문", content: "내용", likes: 0, commentCount: 0, createdAt: "2026-09-10T00:00:00Z", ...extra });
let data;
beforeEach(() => {
  data = new Map();
  globalThis.window = { localStorage: { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) }, dispatchEvent: () => {} };
});

test("all catalog sections become boards; different sections of the same subject share one board", () => {
  const boards = buildCourseBoards([makeCourse()], catalog.courses, catalog.term);
  assert.equal(boards.flatMap((b) => b.sections).length, 1820);
  const board = boards.find((b) => b.key === courseBoardKey(makeCourse()));
  assert.ok(board.sections.some((s) => s.registrationNumber === "X025"));
  assert.deepEqual(board.myCourseIds, ["custom-id"]);
  assert.ok(board.sections.find((s) => s.registrationNumber === "X024").mine);
  assert.ok(!board.sections.find((s) => s.registrationNumber === "X025").mine);
});

test("same names do not merge unrelated subjects or semesters; manual courses stay separate", () => {
  const first = makeCourse();
  const old = makeCourse("old", "2026년 1학기");
  const manual = { ...makeCourse("manual"), catalogSource: undefined };
  const boards = buildCourseBoards([first, old, manual], catalog.courses, catalog.term);
  assert.equal(new Set([first, old, manual].map(courseBoardKey)).size, 3);
  assert.equal(boards.filter((b) => b.myCourseIds.length).length, 3);
});

test("my feed excludes unrelated courses/general, and section filter retains common posts", () => {
  const boards = buildCourseBoards([makeCourse()], catalog.courses, catalog.term);
  const board = boards.find((b) => b.myCourseIds.length);
  const common = post("common", { courseBoard: referenceForBoard(board) });
  const mine = post("mine", { courseBoard: referenceForBoard(board, "X024") });
  const otherSection = post("other", { courseBoard: referenceForBoard(board, "X025") });
  const posts = [common, mine, otherSection, post("general"), post("legacy", { courseId: "unknown" })];
  assert.equal(filterCoursePosts(posts, boards, { view: "my", term: catalog.term }).length, 3);
  assert.deepEqual(filterCoursePosts(posts, boards, { view: board.key, term: catalog.term, section: "X024" }).map((p) => p.id), ["common", "mine"]);
  assert.equal(filterCoursePosts(posts, boards, { view: "general", term: catalog.term })[0].id, "general");
  assert.equal(filterCoursePosts(posts, boards, { view: "legacy", term: catalog.term })[0].id, "legacy");
  assert.throws(() => referenceForBoard(board, "wrong-section"));
});

test("legacy imported course references resolve even after timetable removal", () => {
  const boards = buildCourseBoards([], catalog.courses, catalog.term);
  const p = post("old", { courseId: "ajou-2026-2-X024" });
  assert.equal(resolvePostBoardKey(p, boards), catalogBoardKey(catalog.term, section.subjectId, section.courseCode, section.registrationNumber));
});

test("manual board posts remain archived after deleting the course; catalog search covers professors and numbers", () => {
  const course = { ...makeCourse("manual"), catalogSource: undefined };
  const board = buildCourseBoards([course], [], catalog.term)[0];
  const p = post("archive", { courseBoard: referenceForBoard(board) });
  const archived = buildCourseBoards([], [], catalog.term, [p]);
  assert.equal(archived[0].archived, true);
  const catalogBoard = buildCourseBoards([makeCourse()], catalog.courses, catalog.term).find((b) => b.myCourseIds.length);
  assert.ok(matchesBoardSearch(catalogBoard, "x024 서주영"));
});

test("new storage starts empty, migrates legacy posts/comments on write and keeps originals", () => {
  assert.deepEqual(getCommunityPosts(), []);
  const original = JSON.stringify([post("legacy")]);
  data.set("unilink:posts", original);
  data.set("unilink:comments", JSON.stringify([{ id: "c", postId: "legacy", content: "기존 댓글", createdAt: "2026-09-01" }]));
  publishCommunityPost(post("new"));
  assert.equal(data.get("unilink:posts"), original);
  assert.equal(getCommunityPosts().length, 2);
  assert.equal(getCommunityPosts().find((p) => p.id === "legacy").commentCount, 1);
});

test("comments and per-actor likes persist together, unlike never makes negative counts", () => {
  publishCommunityPost(post());
  addPostComment({ id: "c", postId: "post", content: "댓글", createdAt: "2026-09-10" });
  togglePostLike("post", "a");
  togglePostLike("post", "b");
  assert.equal(getCommunityPosts()[0].likes, 2);
  assert.ok(hasLikedPost("post", "a"));
  togglePostLike("post", "a");
  assert.equal(getCommunityPosts()[0].likes, 1);
  assert.equal(getCommunityPosts()[0].commentCount, 1);
  assert.equal(getCommunitySnapshot().comments.length, 1);
  assert.throws(() => addPostComment({ postId: "missing", content: "x" }));
});

test("failed writes and corrupt data are not silently replaced", () => {
  publishCommunityPost(post());
  const before = data.get(COMMUNITY_STORAGE_KEY);
  window.localStorage.setItem = () => { throw new Error("quota"); };
  assert.throws(() => publishCommunityPost(post("second")));
  assert.equal(data.get(COMMUNITY_STORAGE_KEY), before);
  data.set(COMMUNITY_STORAGE_KEY, "broken");
  assert.throws(() => publishCommunityPost(post("third")));
  assert.equal(data.get(COMMUNITY_STORAGE_KEY), "broken");
});

// Run with Playwright available via AJOU_PLAYWRIGHT_MODULE or installed locally.
// Uses isolated browser contexts; never reads the user's browser profile.
import { createRequire } from "node:module";
import { strict as assert } from "node:assert";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.AJOU_PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ channel: "msedge", headless: true });
const base = process.env.AJOU_TEST_URL || "http://127.0.0.1:3000";
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto(`${base}/timetable`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "아주대 과목 찾기" }).waitFor();
  await page.evaluate(() => {
    const common = { name: "기존 과목", professor: "테스트", location: "101", credits: 3, color: "#334155", days: ["월"], startTime: "07:00", endTime: "08:00", courseType: "major" };
    localStorage.setItem("unilink:courses", JSON.stringify([
      { ...common, id: "existing", term: "2026년 2학기" },
      { ...common, id: "other-term", term: "2026년 1학기" },
    ]));
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByText("2026년 2학기 · 총 3학점", { exact: false }).waitFor();
  await page.getByRole("button", { name: "아주대 과목 찾기" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByText(/전체 1,820개 강좌/).waitFor();
  const search = dialog.getByRole("textbox", { name: "과목 검색" });
  await search.fill("F126");
  await dialog.getByRole("button", { name: "F126 담기", exact: true }).click();
  await search.fill("CCMP114");
  await dialog.getByRole("button", { name: "X024 담기", exact: true }).click();
  assert.ok(await dialog.getByRole("button", { name: "X025 담기", exact: true }).isDisabled(), "another section must be blocked");
  await search.fill("F002");
  assert.ok(await dialog.getByRole("button", { name: "F002 담기", exact: true }).isDisabled(), "overlapping course must be blocked");
  await dialog.getByText("시간 겹침", { exact: false }).waitFor();
  await search.fill("F126");
  await page.screenshot({ path: join(tmpdir(), "ajou-picker-desktop.png"), fullPage: true });
  await dialog.getByRole("button", { name: "2개 과목 시간표에 추가", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("unilink:courses")));
  assert.equal(saved.length, 4);
  assert.ok(saved.some((c) => c.id === "other-term"));
  assert.ok(saved.some((c) => c.id === "existing"));
  assert.equal(saved.find((c) => c.registrationNumber === "F126").schedules[0].startTime, "13:30");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByText("2026년 2학기 · 총 9학점", { exact: false }).waitFor();
  await page.getByRole("button", { name: "아주대 과목 찾기" }).click();
  await page.getByRole("textbox", { name: "과목 검색" }).fill("F126");
  assert.ok(await page.getByRole("button", { name: "F126 담기", exact: true }).isDisabled());
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "아주대 과목 찾기" }).click();
  await page.getByRole("textbox", { name: "과목 검색" }).fill("F125");
  await page.getByRole("button", { name: "F125 담기", exact: true }).click();
  await page.screenshot({ path: join(tmpdir(), "ajou-picker-mobile.png"), fullPage: true });
  const bounds = await page.getByRole("dialog").boundingBox();
  assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 391, "mobile dialog must fit viewport");
  await page.getByRole("button", { name: "1개 과목 시간표에 추가", exact: true }).click();
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("unilink:courses")).length), 5);
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("combobox").first().click();
  await page.getByRole("option", { name: "2026년 1학기", exact: true }).click();
  await page.getByText("2026년 1학기 · 총 3학점", { exact: false }).waitFor();
  await page.getByRole("button", { name: "아주대 과목 찾기" }).click();
  await page.getByText("추가하면 2026년 2학기 시간표로 이동합니다.", { exact: false }).waitFor();
  const untimed = JSON.parse(readFileSync(new URL("../src/data/ajou-2026-2.json", import.meta.url))).courses.find((s) => !s.rawSchedule);
  await page.getByRole("textbox", { name: "과목 검색" }).fill(untimed.registrationNumber);
  assert.ok(await page.getByRole("button", { name: `${untimed.registrationNumber} 담기`, exact: true }).isDisabled());
  await page.getByRole("textbox", { name: "과목 검색" }).fill("F104");
  await page.getByRole("combobox", { name: "공강 희망 요일", exact: true }).selectOption("수");
  await page.getByText("조건에 맞는 과목이 없습니다.", { exact: false }).waitFor();
  await page.getByRole("combobox", { name: "공강 희망 요일", exact: true }).selectOption("");
  await page.getByRole("button", { name: "F104 담기", exact: true }).click();
  await page.getByRole("button", { name: "1개 과목 시간표에 추가", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  const finalSaved = await page.evaluate(() => JSON.parse(localStorage.getItem("unilink:courses")));
  assert.equal(finalSaved.find((c) => c.registrationNumber === "F104").term, "2026년 2학기");
  assert.equal(finalSaved.find((c) => c.registrationNumber === "F104").schedules.length, 3);
  assert.equal(finalSaved.find((c) => c.id === "other-term").term, "2026년 1학기");
  assert.deepEqual(errors, []);
  console.log("PASS: search, section duplicate, conflict, apply, existing/other-term preservation, reload, mobile, untimed courses, free-day filter, term switch, multi-session courses, no page errors.");
  console.log(`Screenshots: ${join(tmpdir(), "ajou-picker-desktop.png")}, ${join(tmpdir(), "ajou-picker-mobile.png")}`);
} finally {
  await context.close();
  await browser.close();
}

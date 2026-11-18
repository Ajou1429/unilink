// Optional browser regression: AJOU_PLAYWRIGHT_MODULE and AJOU_TEST_URL select the local build.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.AJOU_PLAYWRIGHT_MODULE || "playwright",
);
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.AJOU_BROWSER_EXECUTABLE ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
const base = process.env.AJOU_TEST_URL || "http://localhost:3000";
const output = "/tmp/unilink-public-demo";
mkdirSync(output, { recursive: true });
try {
  for (const [device, viewport] of [
    ["desktop", { width: 1440, height: 1000 }],
    ["mobile", { width: 390, height: 844 }],
  ]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage(),
      errors = [],
      external = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await context.route("**/*", async (route) => {
      const url = route.request().url();
      if (
        url.startsWith("http") &&
        new URL(url).origin !== new URL(base).origin
      ) {
        external.push(url.split("?")[0]);
        return route.abort();
      }
      return route.continue();
    });
    await context.addInitScript(() => {
      // Existing auth/account/guest storage is never demo seed/reset input.
      localStorage.setItem(
        "unilink:private:user:real-user:unilink:courses",
        "PRIVATE_SENTINEL",
      );
      sessionStorage.setItem(
        "unilink:private:guest:unilink:courses",
        "GUEST_SENTINEL",
      );
    });
    await page.goto(base + "/dashboard?demo=1");
    await page.getByRole("heading", { name: /수업 자료가/ }).waitFor();
    const feature = (name) =>
      page
        .getByRole("navigation", { name: "데모 기능" })
        .getByRole("button", { name, exact: true });
    await page
      .getByRole("button", { name: "과제 일정을 등록해줘", exact: true })
      .click();
    assert.equal(
      await page.evaluate(() =>
        JSON.parse(
          sessionStorage.getItem("unilink:private:demo:unilink:monthly-events"),
        ).some((x) => x.id === "demo-chat-assignment"),
      ),
      false,
    );
    await page.getByRole("button", { name: "예, 반영하기" }).click();
    assert.equal(
      await page.evaluate(
        () =>
          JSON.parse(
            sessionStorage.getItem(
              "unilink:private:demo:unilink:monthly-events",
            ),
          ).filter((x) => x.id === "demo-chat-assignment").length,
      ),
      1,
    );
    await feature("노트 · Drive").click();
    await page.getByRole("button", { name: "Google Drive 연결 체험" }).click();
    await page.getByRole("button", { name: /운영체제 폴더 선택/ }).click();
    await page.getByRole("button", { name: "선택 폴더 동기화 체험" }).click();
    await page
      .getByRole("button", { name: "PDF 미리보기", exact: true })
      .click();
    await page.getByTitle("샘플 강의노트 PDF").waitFor();
    const pdf = await page.request.get(base + "/demo/operating-systems.pdf");
    assert.equal(pdf.status(), 200);
    assert.ok(
      (await pdf.body()).subarray(0, 8).toString().startsWith("%PDF-1.4"),
    );
    await page.getByRole("button", { name: "주제 분석 체험" }).click();
    await page.getByRole("button", { name: "이 주제로 계획 추천" }).click();
    await page.getByRole("combobox").first().selectOption("오늘 계획");
    await page.getByRole("combobox").nth(1).selectOption("60");
    await page.getByRole("button", { name: "저녁 19:00–22:00" }).click();
    await page.getByRole("button", { name: "추천 시간표 만들기" }).click();
    await page.getByRole("button", { name: "이 계획 승인·저장" }).click();
    const plans = await page.evaluate(() =>
      JSON.parse(
        sessionStorage.getItem(
          "unilink:private:demo:unilink:weekly-study-plans",
        ),
      ),
    );
    assert.equal(plans.length, 5);
    assert.ok(plans.some((x) => x.id === "1")); // Existing manual plans retained.
    assert.ok(
      plans
        .find((x) => x.id === "demo-recommendation-0")
        .description.includes("19:00–20:00"),
    );
    await feature("학습 계획 · 목표").click();
    await page.getByRole("checkbox").first().check();
    await feature("문제은행").click();
    await page.getByRole("button", { name: "예시 해설 확인" }).click();
    await page.getByRole("button", { name: "설명할 수 있어요" }).click();
    await page.reload();
    await feature("학습 계획 · 목표").click();
    assert.equal(await page.getByRole("checkbox").first().isChecked(), true);
    await feature("AI 대화").click();
    await page
      .getByText("일정 등록 흐름을 체험해 볼게요.", { exact: false })
      .waitFor();
    await page.screenshot({
      path: `${output}/${device}-chat.png`,
      fullPage: true,
    });
    await feature("성적 · 설정").click();
    await page.screenshot({
      path: `${output}/${device}-records.png`,
      fullPage: true,
    });
    for (const route of [
      "/timetable",
      "/course?courseId=1",
      "/notes",
      "/ai-coaching",
      "/study",
      "/personal-study?studyId=demo-personal",
      "/problem-bank",
      "/records",
      "/records/calculator",
      "/settings",
    ]) {
      await page.goto(base + route);
      await page
        .getByRole("link", { name: "전체 기능 체험", exact: true })
        .waitFor();
      await page.waitForTimeout(150);
      assert.equal(
        await page
          .locator("body")
          .evaluate((element) => element.scrollWidth > innerWidth + 2),
        false,
        `${device} overflow: ${route}`,
      );
    }
    await page
      .getByRole("link", { name: "전체 기능 체험", exact: true })
      .click();
    await page.getByRole("button", { name: "처음부터 체험" }).click();
    await page.getByRole("heading", { name: /수업 자료가/ }).waitFor();
    assert.equal(
      await page.evaluate(
        () =>
          JSON.parse(
            sessionStorage.getItem(
              "unilink:private:demo:unilink:weekly-study-plans",
            ),
          ).length,
      ),
      3,
    );
    assert.equal(
      await page.evaluate(() =>
        localStorage.getItem("unilink:private:user:real-user:unilink:courses"),
      ),
      "PRIVATE_SENTINEL",
    );
    assert.equal(
      await page.evaluate(() =>
        sessionStorage.getItem("unilink:private:guest:unilink:courses"),
      ),
      "GUEST_SENTINEL",
    );
    assert.deepEqual(external, [], "Demo must not contact external services");
    assert.deepEqual(errors, [], "Demo and linked screens must not throw");
    await context.close();
    console.log(
      `${device}: flow, persistence, routes, isolation and reset passed`,
    );
  }
} finally {
  await browser.close();
}

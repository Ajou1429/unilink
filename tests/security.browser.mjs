// Run against a demo server without Supabase configuration.
import { createRequire } from "node:module";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.AJOU_PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const base = process.env.AJOU_TEST_URL || "http://127.0.0.1:3000";
const errors = [];
page.on("pageerror", error => errors.push(error.message));
try {
  await context.addInitScript(() => {
    const courses = JSON.stringify([{id:"private",name:"PRIVATE_LEGACY_COURSE",days:[],credits:3}]);
    localStorage.setItem("unilink:current-user", JSON.stringify({id:"previous",displayName:"FORGED_IDENTITY"}));
    localStorage.setItem("unilink:courses", courses);
    localStorage.setItem("unilink:private:user:previous:unilink:courses", courses);
  });
  await page.goto(base + "/community");
  await page.getByRole("button", { name: "내 수업 0", exact: true }).waitFor();
  assert.ok(!(await page.locator("body").innerText()).includes("FORGED_IDENTITY"));
  assert.ok(!(await page.locator("body").innerText()).includes("PRIVATE_LEGACY_COURSE"));
  assert.equal(await page.evaluate(() => localStorage.getItem("unilink:current-user")), null);
  assert.ok(await page.evaluate(() => localStorage.getItem("unilink:courses")));
  await page.goto(base + "/login");
  await page.getByRole("status").filter({ hasText: "계정 서비스가 설정되지 않았습니다" }).waitFor();
  assert.ok(await page.getByRole("button", { name: "로그인", exact: true }).isDisabled());
  await page.goto(base + "/signup");
  await page.getByRole("status").filter({ hasText: "계정 서비스가 설정되지 않았습니다" }).waitFor();
  assert.ok(await page.locator('button[type="submit"]').isDisabled());
  assert.equal(await page.evaluate(() => localStorage.getItem("unilink:users")), null);
  assert.deepEqual(errors, []);
  console.log("PASS: forged identity ignored, legacy/account data hidden from guest, legacy originals preserved, demo password authentication disabled.");
} finally { await context.close(); await browser.close(); }

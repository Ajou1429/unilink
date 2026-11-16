import { test } from "node:test";
import assert from "node:assert/strict";
import { FunctionsHttpError, FunctionsFetchError } from "@supabase/supabase-js";
import { describeFunctionError } from "../src/lib/supabase/function-error.ts";

test("missing Edge function reports deployment and preserves the response body", async () => {
  const response = Response.json({ code: "NOT_FOUND", message: "Requested function was not found" }, { status: 404 });
  const message = await describeFunctionError(new FunctionsHttpError(response), "대화를 해석하지 못했습니다.");
  assert.match(message, /서버에 배포되지 않았습니다.*404/);
  assert.equal((await response.json()).code, "NOT_FOUND");
});

test("application and gateway errors retain their HTTP status and safe message", async () => {
  for (const [body, status, expected] of [
    [{ error: "AI 설정이 필요합니다." }, 503, /AI 설정.*503/],
    [{ message: "Invalid JWT" }, 401, /Invalid JWT.*401/],
    [{ error: "오늘 대화 기록 한도에 도달했습니다." }, 429, /한도.*429/],
  ]) {
    assert.match(await describeFunctionError(new FunctionsHttpError(Response.json(body, { status })), "fallback"), expected);
  }
  assert.equal(await describeFunctionError(new FunctionsHttpError(new Response("unavailable", { status: 502 })), "fallback"), "fallback (HTTP 502)");
});

test("network errors are actionable and Drive reconnection handling remains intact", async () => {
  assert.match(await describeFunctionError(new FunctionsFetchError(new Error("Failed to fetch")), "fallback"), /서버에 연결하지 못했습니다/);
  assert.match(await describeFunctionError(new FunctionsHttpError(Response.json({ error: "invalid_grant" }, { status: 409 })), "fallback"), /Google Drive를 다시 연결.*409/);
});

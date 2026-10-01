import { test } from "node:test";
import assert from "node:assert/strict";
import { clearDemoModeOnAuthenticationRoute, isDemoMode } from "../src/lib/demo-mode.ts";

test("authentication pages leave a previous demo session", () => {
  const values = new Map([["unilink:demo-mode", "1"]]);
  globalThis.window = {
    location: { pathname: "/unilink/signup", search: "" },
    sessionStorage: {
      getItem: (key) => values.get(key) ?? null,
      removeItem: (key) => values.delete(key),
    },
  };
  try {
    assert.equal(isDemoMode(), false);
    clearDemoModeOnAuthenticationRoute();
    assert.equal(values.has("unilink:demo-mode"), false);
    window.location.pathname = "/unilink/dashboard";
    assert.equal(isDemoMode(), false);
  } finally {
    delete globalThis.window;
  }
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { isValidPassword, passwordChecks } from "../src/lib/password-policy.ts";

test("registration accepts a ten-character password with every required class", () => {
  assert.equal(isValidPassword("Abcdefg1!2"), true);
  assert.equal(passwordChecks.every(({ test: check }) => check("Abcdefg1!2")), true);
});

test("each missing password class and short passwords are rejected", () => {
  for (const password of ["Abcdef1!", "abcdefg1!2", "ABCDEFG1!2", "Abcdefghi!", "Abcdefg123"]) {
    assert.equal(isValidPassword(password), false, password);
  }
  assert.equal(isValidPassword("Abcdefg1 2"), false, "a space is not a special symbol");
});

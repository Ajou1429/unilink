import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { privateStorage, privateStorageKey, setStorageUser } from "../src/lib/private-storage.ts";
function memory() {
  const data = new Map();
  return { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: k => data.delete(k) };
}
beforeEach(() => {
  globalThis.window = { localStorage: memory(), sessionStorage: memory() };
  setStorageUser(null);
});
test("account A, account B and signed-out guest cannot read each other's data", () => {
  setStorageUser("A"); privateStorage.setItem("notes", "A private notes");
  setStorageUser("B"); assert.equal(privateStorage.getItem("notes"), null);
  privateStorage.setItem("notes", "B private notes");
  setStorageUser(null); assert.equal(privateStorage.getItem("notes"), null);
  privateStorage.setItem("notes", "guest notes");
  assert.equal(window.localStorage.getItem(privateStorageKey("notes")), null);
  setStorageUser("A"); assert.equal(privateStorage.getItem("notes"), "A private notes");
  setStorageUser("B"); assert.equal(privateStorage.getItem("notes"), "B private notes");
});
test("legacy data and a forged cached identity are never automatically adopted", () => {
  window.localStorage.setItem("unilink:current-user", JSON.stringify({ id: "A" }));
  window.localStorage.setItem("notes", "legacy private notes");
  assert.equal(privateStorage.getItem("notes"), null);
  setStorageUser("A"); assert.equal(privateStorage.getItem("notes"), null);
  assert.equal(window.localStorage.getItem("notes"), "legacy private notes");
});
test("guest notes do not persist in a new tab session", () => {
  privateStorage.setItem("notes", "guest");
  window.sessionStorage = memory();
  assert.equal(privateStorage.getItem("notes"), null);
});

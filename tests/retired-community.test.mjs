import { test } from "node:test";
import assert from "node:assert/strict";
import { removeRetiredCommunityData } from "../src/lib/retired-community-data.ts";

test("retired community cleanup removes only its data and notices in every browser namespace", () => {
  const data = new Map();
  const namespaces = ["", "unilink:private:guest:", "unilink:private:demo:", "unilink:private:user:A:", "unilink:private:user:B:"];
  for (const prefix of namespaces) {
    for (const key of ["community-v2", "posts", "comments"]) data.set(`${prefix}unilink:${key}`, "private retired data");
    data.set(`${prefix}unilink:notes`, "keep notes exactly");
    data.set(`${prefix}unilink:notification-settings`, JSON.stringify({ community: true, deadline: true }));
    data.set(`${prefix}unilink:app-notifications`, JSON.stringify([
      { id: "old", type: "community", href: "/community?postId=x" },
      { id: "legacy", href: "/unilink/community/" },
      { id: "deadline", type: "deadline", href: "/study", read: true },
    ]));
  }
  data.set("other-app:posts", "keep external app");
  data.set("unilink:private:user:broken:unilink:notification-settings", "malformed");
  const storage = { get length() { return data.size; }, key: index => [...data.keys()][index] ?? null,
    getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
  removeRetiredCommunityData(storage);
  for (const prefix of namespaces) {
    assert.equal(data.has(`${prefix}unilink:community-v2`), false);
    assert.equal(data.has(`${prefix}unilink:posts`), false);
    assert.equal(data.has(`${prefix}unilink:comments`), false);
    assert.equal(data.get(`${prefix}unilink:notes`), "keep notes exactly");
    assert.deepEqual(JSON.parse(data.get(`${prefix}unilink:notification-settings`)), { deadline: true });
    assert.deepEqual(JSON.parse(data.get(`${prefix}unilink:app-notifications`)), [{ id: "deadline", type: "deadline", href: "/study", read: true }]);
  }
  assert.equal(data.get("other-app:posts"), "keep external app");
  assert.equal(data.get("unilink:private:user:broken:unilink:notification-settings"), "malformed");
  const snapshot = [...data];
  removeRetiredCommunityData(storage);
  assert.deepEqual([...data], snapshot);
});

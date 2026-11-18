import test from "node:test";
import assert from "node:assert/strict";
import { createBrowser } from "../scripts/simulation/runtime.mjs";

test("Drive settings return is one-time, account-bound and expires without consuming OAuth proof", () => {
  const browser = createBrowser(null, "owner");
  const drive = browser.lib("drive-connection");
  const marker = "unilink:drive-settings-return";
  browser.window.sessionStorage.setItem("unilink:drive-oauth-proof", "proof");
  const set = (userId, createdAt) =>
    browser.window.sessionStorage.setItem(
      marker,
      JSON.stringify({ userId, createdAt }),
    );
  set("owner", Date.now());
  assert.equal(drive.takeDriveSettingsReturn(), true);
  assert.equal(drive.takeDriveSettingsReturn(), false);
  assert.equal(
    browser.window.sessionStorage.getItem("unilink:drive-oauth-proof"),
    "proof",
  );
  set("other", Date.now());
  assert.equal(drive.takeDriveSettingsReturn(), false);
  set("owner", Date.now() - 601000);
  assert.equal(drive.takeDriveSettingsReturn(), false);
  set("owner", Date.now() + 100000);
  assert.equal(drive.takeDriveSettingsReturn(), false);
  browser.window.sessionStorage.setItem(marker, "invalid json");
  assert.equal(drive.takeDriveSettingsReturn(), false);
});

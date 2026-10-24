import assert from "node:assert/strict";
import { test } from "node:test";

globalThis.__DEV__ = false;
const { migrateSavedSettings } = await import("./settings.ts");

test("saved shortcuts recorded as a control character are dropped", () => {
  const saved = { shortcuts: { back: ["\u001c", "command", "function"], forward: ["", "command"], find: ["f", "command"], home: ["\r", "command"] } };
  assert.deepEqual(migrateSavedSettings(saved).shortcuts, { forward: ["", "command"], find: ["f", "command"], home: ["\r", "command"] });
});

test("settings with only valid shortcuts come back unchanged", () => {
  const saved = { shortcuts: { find: ["f", "command"] } };
  assert.equal(migrateSavedSettings(saved), saved);
});

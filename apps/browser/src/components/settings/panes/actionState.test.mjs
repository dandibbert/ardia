import assert from "node:assert/strict";
import { test } from "node:test";

const { IDLE_ACTION, RUNNING_ACTION, actionMessage, actionRunning, finishedAction } = await import("./actionState.ts");

test("a running action shows no message, so an old error never sits next to a busy button", () => {
  assert.equal(actionRunning(RUNNING_ACTION), true);
  assert.equal(actionMessage(RUNNING_ACTION), null);
});

test("finishing with a message shows it and frees the button", () => {
  const done = finishedAction(RUNNING_ACTION, "Couldn't export");
  assert.equal(actionRunning(done), false);
  assert.equal(actionMessage(done), "Couldn't export");
});

test("finishing without a message leaves the button free and the row quiet", () => {
  assert.equal(finishedAction(RUNNING_ACTION, null), IDLE_ACTION);
  assert.equal(actionMessage(IDLE_ACTION), null);
});

test("a run that finishes after another one failed keeps that failure on screen", () => {
  const failed = finishedAction(RUNNING_ACTION, "Folder missing");
  assert.equal(finishedAction(failed, null), failed);
});

test("an empty message still counts as one, as an empty string did before", () => {
  const blank = finishedAction(RUNNING_ACTION, "");
  assert.deepEqual(blank, { phase: "idle", message: "" });
});

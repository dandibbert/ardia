import assert from "node:assert/strict";
import test from "node:test";
import { ghostOver, mergePlans, neverStarted, slideOver, STARTS_WITHIN_MS } from "./mergePlans.ts";

const T0 = 1_000_000;

test("a second plan keeps the first plan's moves, ghosts and clipped rows", () => {
  const first = { moves: [{ key: "a" }, { key: "b" }], ghosts: ["g1"], clipped: ["a"], below: 4 };
  const then = { moves: [{ key: "b", later: true }], ghosts: ["g2"], clipped: ["a", "c"], below: 6 };
  assert.deepEqual(mergePlans(first, then), { moves: [{ key: "a" }, { key: "b", later: true }], ghosts: ["g1", "g2"], clipped: ["a", "c"], below: 10 });
});

test("a ghost that was faded is over at its end time", () => {
  const ghost = { born: T0, until: T0 + 200 };
  assert.equal(ghostOver(ghost, T0 + 199), false);
  assert.equal(ghostOver(ghost, T0 + 200), true);
});

test("a ghost whose fade never started is over once its start is overdue", () => {
  const ghost = { born: T0, until: 0 };
  assert.equal(ghostOver(ghost, T0 + STARTS_WITHIN_MS - 1), false);
  assert.equal(ghostOver(ghost, T0 + STARTS_WITHIN_MS), true);
});

test("a slide is over at its end time, or when it never started in time", () => {
  assert.equal(slideOver({ at: T0, until: T0 + 300, landed: false }, T0 + 299), false);
  assert.equal(slideOver({ at: T0, until: T0 + 300, landed: true }, T0 + 300), true);
  assert.equal(slideOver({ at: T0, until: 0, landed: false }, T0 + STARTS_WITHIN_MS - 1), false);
  assert.equal(slideOver({ at: T0, until: 0, landed: false }, T0 + STARTS_WITHIN_MS), true);
});

test("a slide that landed long ago is left alone", () => {
  assert.equal(slideOver({ at: T0, until: 0, landed: true }, T0 + 10 * STARTS_WITHIN_MS), false);
});

test("only an overdue unstarted slide or ghost asks for a render", () => {
  const late = T0 + STARTS_WITHIN_MS;
  assert.equal(neverStarted([{ at: T0, until: 0, landed: true }], [{ born: T0, until: T0 + 200 }], late), false);
  assert.equal(neverStarted([], [{ born: T0, until: 0 }], late - 1), false);
  assert.equal(neverStarted([], [{ born: T0, until: 0 }], late), true);
  assert.equal(neverStarted([{ at: T0, until: 0, landed: false }], [], late), true);
});

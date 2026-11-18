import assert from "node:assert/strict";
import test from "node:test";
import { tabFaceDecodesAtDrawnSize } from "./tabFaceDecode.ts";

test("deck pictures decode at their drawn size only in an Android lab build that asks for it with ArdiaTabFaceResize", () => {
  assert.equal(tabFaceDecodesAtDrawnSize("android", true, true), true);
  assert.equal(tabFaceDecodesAtDrawnSize("android", false, true), false);
  assert.equal(tabFaceDecodesAtDrawnSize("ios", true, true), false);
  assert.equal(tabFaceDecodesAtDrawnSize("android", true, false), false);
});

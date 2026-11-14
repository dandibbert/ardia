import assert from "node:assert/strict";
import { test } from "node:test";

const { littleArdiaLinkOf } = await import("./littleArdiaLink.ts");

const page = "chrome-extension://dlgbgbembiiiodfifcoggapmacjghalf/open.html#";

test("the link menu's page carries the link to open in Little Ardia", () => {
  assert.equal(littleArdiaLinkOf(page + encodeURIComponent("https://example.com/a?b=1#c")), "https://example.com/a?b=1#c");
});

test("only http(s) links from that exact page count", () => {
  assert.equal(littleArdiaLinkOf(page + encodeURIComponent("javascript:alert(1)")), null);
  assert.equal(littleArdiaLinkOf(page + encodeURIComponent("file:///etc/passwd")), null);
  assert.equal(littleArdiaLinkOf(page + "%E0%A4%A"), null);
  assert.equal(littleArdiaLinkOf("chrome-extension://otherextensionidaaaaaaaaaaaaaaaa/open.html#https%3A%2F%2Fexample.com"), null);
  assert.equal(littleArdiaLinkOf("https://example.com"), null);
});

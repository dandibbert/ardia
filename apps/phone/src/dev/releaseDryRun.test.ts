import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const script = read("../../scripts/release-ios");
const workflow = read("../../../../.github/workflows/ios-release.yml");
const exportOptions = read("../../ios/Config/ExportOptions-TestFlight.plist");

test("a dry run stops at the signed archive, before the export that opens an App Store Connect upload record", () => {
  const exports = [...script.matchAll(/xcodebuild -exportArchive/g)];
  assert.equal(exports.length, 1, "release-ios exports in one place");
  const stop = script.indexOf('if [ "$upload" = 0 ]; then');
  assert.ok(stop > 0, "release-ios stops when it isn't uploading");
  const stopBlock = script.slice(stop, script.indexOf("\nfi\n", stop));
  assert.match(stopBlock, /exit 0/);
  assert.ok(exports[0]!.index! > stop, "the export runs only after the dry run has stopped");
  assert.doesNotMatch(script, /Set :destination export/, "nothing exports for App Store Connect without uploading");
});

test("the upload is the only step that sends anything, and the dry run reads the number without reserving it", () => {
  assert.match(exportOptions, /<key>destination<\/key>\s*<string>upload<\/string>/);
  assert.match(script, /--no-upload\) upload=0/);
  assert.match(workflow, /\[ "\$MODE" = upload \] \|\| args\+=\(--no-upload\)/, "every mode but upload passes --no-upload");
  const nextBuild = read("../../scripts/asc.mjs").match(/async function nextBuild\(\) \{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.ok(nextBuild.length > 0);
  assert.doesNotMatch(nextBuild, /\bpost\(|\bpatch\(|method: "(POST|PATCH|DELETE)"/, "next-build only reads");
});

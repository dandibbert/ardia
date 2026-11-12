import assert from "node:assert/strict";
import { mock, test } from "node:test";

globalThis.__DEV__ = false;
await import("../../test-native/index.ts");
const { useBrowser } = await import("../browser/store.ts");
const { makeTab } = await import("../browser/model.ts");
const { startMemoryTrim } = await import("./memoryTrim.ts");

test("a forced GC that held the JS thread for a second is the session's last", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  let now = 1_000_000;
  const realNow = Date.now;
  Date.now = () => now;
  const advance = (ms) => {
    for (let left = ms; left > 0; left -= 250) {
      now += 250;
      mock.timers.tick(250);
    }
  };
  let heap = 400 * 1048576;
  const collections = [];
  globalThis.HermesInternal = { getInstrumentedStats: () => ({ js_heapSize: heap }) };
  globalThis.gc = () => {
    collections.push(now);
    heap -= 1048576;
    now += collections.length === 1 ? 100 : 6500;
  };
  const addTab = () => {
    const tab = makeTab("w-test", "default", "https://example.com/");
    useBrowser.setState((s) => ({ tabs: { ...s.tabs, [tab.id]: tab } }));
  };
  try {
    startMemoryTrim();

    addTab();
    advance(10_000);
    assert.equal(collections.length, 2, "a quick collection that shrank the heap is followed by another");
    advance(60_000);
    assert.equal(collections.length, 2, "the slow one ends the run");

    addTab();
    advance(60_000);
    assert.equal(collections.length, 2, "later tab changes don't force one either");
  } finally {
    Date.now = realNow;
    mock.timers.reset();
    delete globalThis.gc;
    delete globalThis.HermesInternal;
  }
});

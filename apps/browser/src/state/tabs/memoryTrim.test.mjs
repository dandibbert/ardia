import assert from "node:assert/strict";
import { mock, test } from "node:test";

globalThis.__DEV__ = false;
await import("../../test-native/index.ts");
const { useBrowser } = await import("../browser/store.ts");
const { makeTab } = await import("../browser/model.ts");
const { startMemoryTrim } = await import("./memoryTrim.ts");

test("a tab count change trims once input is idle and never forces a JavaScript collection", () => {
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
  const collections = [];
  globalThis.HermesInternal = { getInstrumentedStats: () => ({ js_heapSize: 400 * 1048576 }) };
  globalThis.gc = () => collections.push(now);
  const addTab = () => {
    const tab = makeTab("w-test", "default", "https://example.com/");
    useBrowser.setState((s) => ({ tabs: { ...s.tabs, [tab.id]: tab } }));
  };
  try {
    startMemoryTrim();
    addTab();
    advance(60_000);
    addTab();
    advance(60_000);
    assert.deepEqual(collections, [], "a forced full collection stops the JS thread for seconds on a large heap");
  } finally {
    Date.now = realNow;
    mock.timers.reset();
    delete globalThis.gc;
    delete globalThis.HermesInternal;
  }
});

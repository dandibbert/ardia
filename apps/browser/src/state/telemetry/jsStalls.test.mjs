import assert from "node:assert/strict";
import { test } from "node:test";

globalThis.__DEV__ = false;
await import("../../test-native/index.ts");
const stalls = await import("./jsStalls.ts");

test("a bridge call that holds the JS thread is named in the stall the user clicked through", () => {
  let now = 1_000_000;
  const bridge = {
    __callFunction(module, method, args) {
      now += module === "RCTDeviceEventEmitter" ? 3700 : 5;
      return [module, method, args];
    },
    __invokeCallback() {
      now += 300;
    },
    __callReactNativeMicrotasks() {
      now += 1;
    },
  };
  assert.equal(stalls.timeBridge(bridge, () => now), true);
  assert.equal(stalls.timeBridge(bridge, () => now), false, "wrapped once");

  const from = now;
  assert.deepEqual(bridge.__callFunction("JSTimers", "callTimers", [[1]]), ["JSTimers", "callTimers", [[1]]]);
  bridge.__callFunction("RCTDeviceEventEmitter", "emit", ["windowEvent", {}]);
  bridge.__invokeCallback(7, []);
  bridge.__callReactNativeMicrotasks();
  const clickedAt = from + 200;

  const report = stalls.stallReport(from, now, clickedAt);
  assert.equal(report.ms, 4006);
  assert.equal(report.input_wait_ms, 3806);
  assert.equal(report.long_tasks, 2);
  assert.equal(report.task_1, "RCTDeviceEventEmitter emit windowEvent");
  assert.equal(report.task_1_ms, 3700);
  assert.equal(report.task_2, "callback");
  assert.equal(report.task_2_ms, 300);
  assert.equal("task_3" in report, false, "short calls aren't kept");
});

test("a pause nobody pressed through, or a short one, isn't a stall", () => {
  assert.equal(stalls.stallReport(0, 5000, -1), null);
  assert.equal(stalls.stallReport(0, 5000, 6000), null);
  assert.equal(stalls.stallReport(0, 900, 100), null);
  assert.equal(stalls.stallReport(0, 1200, 100).long_tasks, 0);
});

test("a stall carries the GCs that ran in it and the heap they left, and labels survive the scrubber", () => {
  const report = stalls.stallReport(0, 6500, 100, { heapBytes: 0, gcs: 10, gcSeconds: 1.5 }, { heapBytes: 300 * 1048576, gcs: 13, gcSeconds: 7.9 });
  assert.equal(report.gcs, 3);
  assert.equal(report.gc_ms, 6400);
  assert.equal(report.heap_mb, 300);

  let now = 50_000;
  assert.equal(stalls.timed("engine tabs.updated", () => { now += 900; return 7; }, () => now), 7);
  const named = stalls.stallReport(50_000, 51_200, 50_100);
  assert.equal(named.task_1, "engine tabs updated");
  assert.equal(named.task_1_ms, 900);
});

import assert from "node:assert/strict";
import { after, test } from "node:test";

globalThis.__DEV__ = false;
const stub = await import("../../test-native/index.ts");
const { NativeModules } = await import("react-native");
Object.assign(stub.appInfo, { appVersion: "0.3.0", osVersion: "27.0.1", arch: "arm64", isolatedInstance: false, processStart: Date.now() - 1500 });
stub.docs.set("telemetry.json", JSON.stringify({ version: 1, sharing: true, installId: "install", decidedAt: 1, askDoneAt: 1, crashCursor: 0, lastVersion: "0.3.0", sessionOpen: false }));
let clickAt = 0;
let pendingMarks = [];
NativeModules.ACFieldTiming.lastInput = () => [clickAt, 2];
NativeModules.ACFieldTiming.drain = () => pendingMarks.splice(0);
globalThis.fetch = async () => ({ status: 200 });

const client = await import("./client.ts");
const journeys = await import("./journeys.ts");
const { useBrowser } = await import("../browser/store.ts");
after(() => client.setSharing(false, "settings"));

const S = () => useBrowser.getState();

test("a profile switch is timed to its page, and one shown late is reported on its own", async () => {
  client.loadChoice();
  journeys.startJourneys(null);
  S().hydrate({});
  const w = S().createWindow({ url: "https://personal.example/" });
  const work = S().createProfile({ name: "Work" });
  S().switchProfile(w, work);
  const workTab = S().newTab(w, { url: "https://work.example/" });
  S().switchProfile(w, "default");

  clickAt = Date.now();
  S().switchProfile(w, work);
  assert.equal(S().windows[w].profileId, work);
  const switching = journeys.devJourneys().pending.filter((p) => p.journey === "j5");
  assert.deepEqual(switching.map((p) => p.key), [workTab]);
  pendingMarks.push([workTab, "frame", clickAt + 40], [workTab, "view", clickAt + 2100], [workTab, "shown", clickAt + 2900]);
  journeys.emitJourneys(true);

  await client.saveQueueNow();
  const events = JSON.parse(stub.docs.get("telemetry-queue.json")).events;
  const summary = events.find((e) => e.event === "perf_journeys").properties;
  assert.equal(summary.j5_frame_max, 40);
  assert.equal(summary.j5_view_max, 2100);
  assert.equal(summary.j5_total_max, 2900);
  assert.equal(summary.j5_cold, 1);
  assert.equal(summary.j3_total_n, undefined, "a profile switch isn't counted as a tab switch");
  const slow = events.filter((e) => e.event === "perf_slow_switch").map((e) => e.properties);
  assert.equal(slow.length, 1);
  assert.equal(slow[0].journey, "j5");
  assert.equal(slow[0].kind, "cold");
  assert.equal(slow[0].frame_ms, 40);
  assert.equal(slow[0].view_ms, 2100);
  assert.equal(slow[0].total_ms, 2900);
});

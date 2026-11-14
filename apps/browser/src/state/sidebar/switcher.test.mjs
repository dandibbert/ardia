import assert from "node:assert/strict";
import { test } from "node:test";

globalThis.__DEV__ = false;
await import("../../test-native/index.ts");
const { useBrowser } = await import("../browser/store.ts");
const { sidebarUi } = await import("./sidebarUi.ts");
const switcher = await import("./switcher.ts");

const S = () => useBrowser.getState();
const settle = () => new Promise((resolve) => setImmediate(resolve));
const PROFILES = { default: { id: "default", name: "Personal", color: "plum", icon: null, createdAt: 0 } };

function setup(t) {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  switcher.cancelSwitcher();
  const now = Date.now();
  const tab = (id) => ({
    id, windowId: "w1", profileId: "default", url: `https://${id}.com/`, title: "", favicon: null, pin: null, muted: false, zoom: 1, customTitle: null,
    customIcon: null, pinnedUrl: null, page: { kind: "loaded", nav: { url: `https://${id}.com/`, seq: 1 } }, openerId: null, createdAt: now, lastActiveAt: now,
  });
  const ids = ["a", "b", "c"];
  const windows = { w1: { id: "w1", profileId: "default", kind: "main", tabIds: ids, activeTabIds: { default: "a" }, sidebarOpen: true, frame: null, createdAt: 0 } };
  S().hydrate({ profiles: PROFILES, windows, tabs: Object.fromEntries(ids.map((id) => [id, tab(id)])), focusedWindowId: "w1" });
  switcher.switcherStep("w1", false);
  t.mock.timers.tick(140);
  const open = sidebarUi().switcher;
  assert.ok(open?.visible, "the switcher is up");
  return open.ids;
}

const index = () => sidebarUi().switcher?.index;
const shown = () => S().windows.w1.activeTabIds.default;

test("after a keyboard step the row under the pointer is ignored until the capture settles", (t) => {
  const ids = setup(t);
  switcher.hoverSwitcherRow(0);
  assert.equal(index(), 0);
  switcher.moveSwitcher(1);
  assert.equal(index(), 1);
  switcher.hoverSwitcherRow(2);
  assert.equal(index(), 1);
  switcher.commitSwitcher();
  assert.equal(sidebarUi().switcher, null);
  assert.equal(shown(), ids[1]);
});

test("once the capture settles, a pointer resting on a row takes the selection on the next poll", async (t) => {
  setup(t);
  switcher.moveSwitcher(1);
  switcher.hoverSwitcherRow(0);
  assert.equal(index(), 2);
  await settle();
  assert.equal(index(), 2);
  t.mock.timers.tick(50);
  assert.equal(index(), 0);
  switcher.cancelSwitcher();
});

test("cancelling while a step is pending stops pointer tracking", async (t) => {
  setup(t);
  switcher.hoverSwitcherRow(0);
  switcher.moveSwitcher(1);
  switcher.cancelSwitcher();
  await settle();
  t.mock.timers.tick(200);
  assert.equal(sidebarUi().switcher, null);
});

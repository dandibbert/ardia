import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
const { useBrowser } = await import("../browser/store.ts");
const { AGENT_GROUP_NAME, groupAgentTab, startAgentGroup, stopAgentGroupForTests } = await import("./agentGroup.ts");
await import("../../test-native/index.ts");

const S = () => useBrowser.getState();
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const agentGroups = () => Object.values(S().groups).filter((g) => g.name === AGENT_GROUP_NAME);
let windowId;
let shown;

beforeEach(() => {
  stopAgentGroupForTests();
  S().hydrate({});
  S().updateSettings({ cliControl: true, agentTabsGrouped: true });
  windowId = S().createWindow({ url: "https://mine.example/" });
  shown = S().windows[windowId].activeTabIds[S().windows[windowId].profileId];
});

test("a background tab the command opened goes into one folded Agents group, and the next one joins it", async () => {
  startAgentGroup(async () => ({ owned: true, shown: false }));
  const first = S().newTab(windowId, { url: "https://one.example/", background: true });
  await tick();
  const second = S().newTab(windowId, { url: "https://two.example/", background: true });
  await tick();
  const groups = agentGroups();
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].tabIds, [first, second]);
  assert.equal(groups[0].collapsed, true);
  assert.deepEqual(groups[0].shownTabIds ?? [], []);
  assert.equal(S().windows[windowId].activeTabIds[S().windows[windowId].profileId], shown);
});

test("a tab you opened, and a tab the command opened and showed, stay where they are", async () => {
  const answers = [{ owned: false, shown: false }, { owned: true, shown: true }];
  startAgentGroup(async () => answers.shift());
  S().newTab(windowId, { url: "https://mine-too.example/", background: true });
  await tick();
  S().newTab(windowId, { url: "https://shown.example/", background: true });
  await tick();
  assert.equal(agentGroups().length, 0);
});

test("with the setting off, or control off, nothing is asked and nothing is grouped", async () => {
  let asked = 0;
  startAgentGroup(async () => (asked++, { owned: true, shown: false }));
  S().updateSettings({ agentTabsGrouped: false });
  S().newTab(windowId, { url: "https://one.example/", background: true });
  await tick();
  S().updateSettings({ agentTabsGrouped: true, cliControl: false });
  S().newTab(windowId, { url: "https://two.example/", background: true });
  await tick();
  assert.equal(asked, 0);
  assert.equal(agentGroups().length, 0);
});

test("a tab already in a group of yours is left alone", () => {
  const mine = S().newTab(windowId, { url: "https://grouped.example/", background: true });
  const groupId = S().createGroup([mine], { name: "Work" });
  assert.equal(groupAgentTab(mine, null), false);
  assert.deepEqual(S().groups[groupId].tabIds, [mine]);
  assert.equal(agentGroups().length, 0);
});

test("a tab that closed before the answer came is ignored", async () => {
  let answer;
  startAgentGroup(() => new Promise((resolve) => (answer = resolve)));
  const gone = S().newTab(windowId, { url: "https://gone.example/", background: true });
  S().closeTab(gone);
  answer({ owned: true, shown: false });
  await tick();
  assert.equal(agentGroups().length, 0);
});

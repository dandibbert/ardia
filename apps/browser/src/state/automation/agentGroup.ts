import { cliOwnsTab } from "../../platform/cli";
import { changedIds } from "../browser/changes";
import { useBrowser, type BrowserState } from "../browser/store";
import { innermostGroupOf } from "../groups/groups";
import { noteAgentTabGrouped } from "../telemetry/usage";
import { consentToken, counted, type ConsentToken } from "../telemetry/client";

export const AGENT_GROUP_NAME = "Agents";
const RESTORED_AT_ONCE = 5;

type OwnerCheck = (tabId: string) => Promise<{ owned: boolean; shown: boolean }>;

let stopWatching: (() => void) | null = null;

const agentGroupOf = (s: BrowserState, windowId: string, profileId: string) =>
  Object.values(s.groups).find((g) => g.name === AGENT_GROUP_NAME && g.windowId === windowId && g.profileId === profileId && !g.parentId && !g.pinned);

export function groupAgentTab(tabId: string, consent: ConsentToken | null): boolean {
  const s = useBrowser.getState();
  const tab = s.tabs[tabId];
  if (!s.settings.agentTabsGrouped || !tab || tab.pin || tab.liveItem || s.windows[tab.windowId]?.kind !== "main" || innermostGroupOf(s.groups, tabId)) return false;
  const existing = agentGroupOf(s, tab.windowId, tab.profileId);
  if (existing) s.addTabsToGroup(existing.id, [tabId]);
  const groupId = existing?.id ?? s.createGroup([tabId], { name: AGENT_GROUP_NAME });
  if (!groupId || !useBrowser.getState().groups[groupId]?.tabIds.includes(tabId)) return false;
  if (!existing) useBrowser.getState().updateGroup(groupId, { collapsed: true });
  if (useBrowser.getState().groups[groupId]?.collapsed) useBrowser.getState().updateGroup(groupId, { shownTabIds: [] });
  counted(consent, noteAgentTabGrouped);
  return true;
}

export function startAgentGroup(owns: OwnerCheck = cliOwnsTab) {
  if (stopWatching) return;
  stopWatching = useBrowser.subscribe((s, prev) => {
    if (s.tabs === prev.tabs || !s.settings.agentTabsGrouped || !s.settings.cliControl) return;
    const opened = changedIds(s.tabs, prev.tabs).filter((id) => !prev.tabs[id] && s.tabs[id] && !s.tabs[id]!.pin);
    if (!opened.length || opened.length > RESTORED_AT_ONCE) return;
    const consent = consentToken();
    for (const id of opened) {
      void owns(id).then(
        (owner) => void (owner.owned && !owner.shown && groupAgentTab(id, consent)),
        () => {},
      );
    }
  });
}

export function stopAgentGroupForTests() {
  stopWatching?.();
  stopWatching = null;
}

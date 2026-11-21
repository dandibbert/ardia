import { claimLaunchTab, prepareTabTransfer, releaseTabTransfer, type PageEngine } from "../../platform/tabs";
import { isInternalTab } from "../pages/urls";
import { useBrowser } from "../browser/store";
import { changedIds } from "../browser/changes";
import { earlyLaunchTabOn, launchTab } from "./launchTab";
import { engineProfile } from "../browser/model";
import { hasPage, navigationOf } from "./pageSession";
import { tabEngine } from "../engines/engines";
import type { Tab } from "../browser/types";
import { webviews } from "../../platform/webviews";
import { issuedSeq } from "./earlyNavigate";
import { focusedWindowOf } from "../windows/ui";

export const wantsPage = (t: Tab | undefined): t is Tab => !!t && hasPage(t) && !isInternalTab(t);

type Handoff = { seq: number | undefined; engine: PageEngine };
const handoffs = new Map<string, Handoff & { profile: string }>();

export function takeHandOff(tabId: string, engine: PageEngine): Handoff | null {
  const handoff = handoffs.get(tabId);
  if (!handoff) return null;
  handoffs.delete(tabId);
  if (handoff.engine === engine) return handoff;
  releaseTabTransfer(tabId);
  return null;
}

export function handOff(tabId: string, profile: string, engine: PageEngine) {
  handoffs.set(tabId, { seq: issuedSeq(tabId), engine, profile });
  prepareTabTransfer(tabId);
}

export function startTabPages() {
  claimLaunch();
  useBrowser.subscribeTo(["tabs"], (s, prev) => {
    if (s.tabs === prev.tabs) return;
    for (const id of changedIds(s.tabs, prev.tabs)) {
      const tab = s.tabs[id];
      const before = prev.tabs[id];
      const profile = tab && engineProfile(s, tab.profileId);
      if (tab && before && tab.windowId !== before.windowId && webviews.has(id) && profile === engineProfile(s, before.profileId)) handOff(id, profile!, tabEngine(s, id));
      const kept = handoffs.get(id)?.profile;
      if (kept !== undefined && !(wantsPage(tab) && profile === kept)) {
        handoffs.delete(id);
        releaseTabTransfer(id);
      }
    }
  });
}

function claimLaunch() {
  const s = useBrowser.getState();
  const launch = earlyLaunchTabOn() ? launchTab(s, focusedWindowOf(s)) : null;
  const tab = launch ? s.tabs[launch.id] : undefined;
  const kept = launch && wantsPage(tab) && navigationOf(tab)?.url === launch.url && tabEngine(s, launch.id) === "chromium" ? launch : null;
  if (kept) {
    handoffs.set(kept.id, { seq: navigationOf(tab)?.seq, engine: "chromium", profile: kept.profile });
  }
  claimLaunchTab(kept?.id ?? "", kept?.url ?? "", kept?.profile ?? "");
}

import { extensionActionStates } from "../../platform/extensions";
import { useBrowser } from "../browser/store";
import { usePages } from "../tabs/pageState";
import { pageDocumentOf } from "../engines/pageDocuments";
import { activeTabId } from "../browser/model";
import { extensionProfile, readyTabOf, tabProfile, useExtensions, windowExtensions } from "./store";
import { singleFlight } from "../../lib/singleFlight";
import { noteExtensionActionRefresh, noteExtensionActionStateFailure, noteExtensionActionStateRequest } from "../telemetry/workCounts";
import { consentToken } from "../telemetry/client";

let pending: "all" | Set<string> = new Set();

export function refreshActionStates(profiles?: Iterable<string>): Promise<void> {
  if (!profiles) pending = "all";
  else if (pending !== "all") for (const profile of profiles) pending.add(profile);
  return refresh();
}

const refresh = singleFlight(async () => {
  const only = pending === "all" ? null : pending;
  pending = new Set();
  noteExtensionActionRefresh();
  await pass(only);
});

async function pass(only: Set<string> | null) {
  const s = useBrowser.getState();
  const { popup } = useExtensions.getState();
  await Promise.all(
    s.windowOrder.filter((windowId) => !only || only.has(extensionProfile(s, windowId))).map(async (windowId) => {
      const ids = windowExtensions(s, windowId)
        .filter((x) => x.hasAction !== false && (x.pinned || popup?.extensionId === x.id))
        .map((x) => x.id);
      const tabId = readyTabOf(activeTabId(s, windowId));
      if (!ids.length || !tabId) return;
      const consent = consentToken();
      const readiness = usePages.getState().ready[tabId];
      const document = pageDocumentOf(tabId);
      noteExtensionActionStateRequest();
      const states = await extensionActionStates(tabId, ids, tabProfile(tabId)).catch(() => (noteExtensionActionStateFailure(consent), null));
      if (!states || !useBrowser.getState().tabs[tabId] || usePages.getState().ready[tabId] !== readiness || pageDocumentOf(tabId) !== document) return;
      const previous = useExtensions.getState().actions[tabId];
      if (previous && JSON.stringify(previous) === JSON.stringify(states)) return;
      useExtensions.setState((e) => ({ actions: { ...e.actions, [tabId]: states } }));
    }),
  );
}

import { cliCloseOffscreenTabs, cliMoveOffscreen, cliOwnsTab } from "../../platform/cli";
import { errorText } from "../../lib/errors";
import { useBrowser } from "../browser/store";
import { removeTabs } from "../tabs/tabs";
import { shownTabIds } from "../tabs/shownTabs";
import { failure, type MethodError } from "./automationMethods";
import { isEligibleTab } from "./automationWindows";

type Body = { result: unknown } | { error: MethodError };

const CLOSE_AFTER_MS = 5000;

type OffscreenTabs = { phase: "unserved" } | { phase: "served" } | { phase: "closing"; timer: ReturnType<typeof setTimeout> };

let offscreenTabs: OffscreenTabs = { phase: "unserved" };

export async function offscreenMethod(params: Record<string, unknown>): Promise<Body> {
  const unknown = Object.keys(params).filter((key) => key !== "tab");
  if (unknown.length) return failure("bad_request", `offscreen takes tab, not ${unknown.join(", ")}.`);
  const tab = params.tab;
  if (typeof tab !== "string" || !isEligibleTab(useBrowser.getState(), tab)) return failure("no_window", "There's no such tab the ardia command can use.");
  if (shownTabIds(useBrowser.getState()).has(tab)) return failure("refused", "That tab is shown in a window, so it can't go off-screen.");
  try {
    const owner = await cliOwnsTab(tab);
    if (!owner.owned) return failure("refused", "The ardia command didn't open that tab.");
    if (owner.shown) return failure("refused", "That tab has been shown in a window, so it can't go off-screen.");
    if (shownTabIds(useBrowser.getState()).has(tab)) return failure("refused", "That tab is shown in a window, so it can't go off-screen.");
    const moved = await cliMoveOffscreen(tab);
    if (!moved.ok) return failure("refused", moved.reason ?? "Ardia couldn't take that tab off-screen.");
  } catch (error) {
    return failure("failed", errorText(error));
  }
  useBrowser.setState((s) => removeTabs(s, [tab], false));
  return { result: { ok: true } };
}

export function noteCliConnections(connections: number) {
  if (connections > 0) {
    if (offscreenTabs.phase === "closing") clearTimeout(offscreenTabs.timer);
    offscreenTabs = { phase: "served" };
    return;
  }
  if (offscreenTabs.phase !== "served") return;
  offscreenTabs = {
    phase: "closing",
    timer: setTimeout(() => {
      offscreenTabs = { phase: "unserved" };
      void cliCloseOffscreenTabs().catch(() => {});
    }, CLOSE_AFTER_MS),
  };
}

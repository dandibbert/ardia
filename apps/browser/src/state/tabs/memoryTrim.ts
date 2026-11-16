import { inputIdleSeconds, trimEngineMemory } from "../../platform/performance";
import { useBrowser } from "../browser/store";
import { isQuitting } from "../app/quit";
import { noteMemoryTrim, noteMemoryTrimFailure, noteMemoryTrimGivenUp } from "../telemetry/memoryTrimCounts";

const QUIET_MS = 5000;
const MIN_GAP_MS = 30000;
const BUSY_RETRY_MS = 1000;
const MAX_POSTPONES = 30;
const INPUT_IDLE_SECONDS = 2;
const TIMER_LATE_MS = 50;

let started = false;

export function startMemoryTrim() {
  if (started) return;
  started = true;

  let tabCount = Object.keys(useBrowser.getState().tabs).length;
  let lastTrimAt = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  const later = (fn: (lateMs: number) => void, ms: number) => {
    const due = Date.now() + ms;
    timer = setTimeout(() => {
      timer = null;
      fn(Date.now() - due);
    }, ms);
  };

  const idle = (lateMs: number) => lateMs < TIMER_LATE_MS && (inputIdleSeconds() ?? Infinity) >= INPUT_IDLE_SECONDS;

  const begin = (lateMs: number, postponed = 0) => {
    if (isQuitting()) return;
    const wait = lastTrimAt + MIN_GAP_MS - Date.now();
    if (wait > 0) return later((late) => begin(late, postponed), wait);
    if (!idle(lateMs)) {
      if (postponed < MAX_POSTPONES) later((late) => begin(late, postponed + 1), BUSY_RETRY_MS);
      else noteMemoryTrimGivenUp();
      return;
    }
    lastTrimAt = Date.now();
    trimEngineMemory().then(noteMemoryTrim, noteMemoryTrimFailure);
  };

  useBrowser.subscribe((s, prev) => {
    if (s.tabs === prev.tabs) return;
    const count = Object.keys(s.tabs).length;
    if (count === tabCount) return;
    tabCount = count;
    cancel();
    later(begin, QUIET_MS);
  });
}

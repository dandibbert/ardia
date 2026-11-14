import { fieldTiming } from "../../platform/fieldTiming";
import { timeEngineEvents } from "../../platform/performance";
import { capture, isSharing } from "./client";

type Bridge = Record<string, unknown>;
type LongTask = { label: string; start: number; ms: number };
type HermesStats = { js_heapSize?: number; js_numGCs?: number; js_gcTime?: number };
export type RuntimeStats = { heapBytes: number; gcs: number; gcSeconds: number };

const BEAT_MS = 250;
const STALL_MS = 1000;
export const LONG_TASK_MS = 200;
const KEPT_TASKS = 30;
const REPORTED_TASKS = 3;
const MAX_STALLS_PER_SESSION = 50;

const longTasks: LongTask[] = [];
let stallsSent = 0;
let lastBeat = 0;
let statsAtBeat: RuntimeStats | null = null;
let beat: ReturnType<typeof setInterval> | undefined;

const hermes = (globalThis as { HermesInternal?: { getInstrumentedStats?: () => HermesStats } }).HermesInternal;

export function runtimeStats(): RuntimeStats | null {
  const stats = hermes?.getInstrumentedStats?.();
  if (!stats || typeof stats.js_heapSize !== "number") return null;
  return { heapBytes: stats.js_heapSize, gcs: stats.js_numGCs ?? 0, gcSeconds: stats.js_gcTime ?? 0 };
}

function labelOf(entry: string, args: unknown[]): string {
  if (entry === "__invokeCallback") return "callback";
  if (entry === "__callReactNativeMicrotasks") return "microtasks";
  const [module, method, params] = args as [unknown, unknown, unknown];
  const event = module === "RCTDeviceEventEmitter" && Array.isArray(params) && typeof params[0] === "string" ? ` ${params[0]}` : "";
  return `${String(module)} ${String(method)}${event}`;
}

export function noteLongTask(label: string, start: number, ms: number) {
  longTasks.push({ label: label.replace(/[.:/@]+/g, " ").slice(0, 60), start, ms: Math.round(ms) });
  if (longTasks.length > KEPT_TASKS) longTasks.splice(0, longTasks.length - KEPT_TASKS);
}

export function timed<T>(label: string, run: () => T, clock = () => Date.now()): T {
  const start = clock();
  try {
    return run();
  } finally {
    const ms = clock() - start;
    if (ms >= LONG_TASK_MS) noteLongTask(label, start, ms);
  }
}

export function timeBridge(bridge: Bridge | undefined, clock = () => Date.now()): boolean {
  if (!bridge || bridge.__ardiaTimed) return false;
  let wrapped = false;
  for (const entry of ["__callFunction", "__invokeCallback", "__callReactNativeMicrotasks"]) {
    const original = bridge[entry];
    if (typeof original !== "function") continue;
    bridge[entry] = function timedEntry(this: unknown, ...args: unknown[]) {
      return timed(labelOf(entry, args), () => original.apply(this, args), clock);
    };
    wrapped = true;
  }
  bridge.__ardiaTimed = wrapped;
  return wrapped;
}

export function stallReport(
  from: number,
  to: number,
  inputAt: number,
  before: RuntimeStats | null = null,
  after: RuntimeStats | null = null,
): Record<string, string | number> | null {
  const ms = to - from;
  if (ms < STALL_MS || !(inputAt >= from && inputAt <= to)) return null;
  const during = longTasks
    .filter((t) => t.start < to && t.start + t.ms > from)
    .sort((a, b) => b.ms - a.ms)
    .slice(0, REPORTED_TASKS);
  const props: Record<string, string | number> = { ms: Math.round(ms), input_wait_ms: Math.round(to - inputAt), long_tasks: during.length };
  during.forEach((t, i) => {
    props[`task_${i + 1}`] = t.label;
    props[`task_${i + 1}_ms`] = t.ms;
  });
  if (after) {
    props.heap_mb = Math.round(after.heapBytes / 1048576);
    if (before) {
      props.gcs = after.gcs - before.gcs;
      props.gc_ms = Math.round((after.gcSeconds - before.gcSeconds) * 1000);
    }
  }
  return props;
}

function onBeat() {
  const now = Date.now();
  const from = lastBeat + BEAT_MS;
  const before = statsAtBeat;
  lastBeat = now;
  statsAtBeat = runtimeStats();
  if (now - from < STALL_MS || stallsSent >= MAX_STALLS_PER_SESSION || !isSharing()) return;
  const [inputAt] = fieldTiming.lastInput();
  const report = stallReport(from, now, inputAt, before, statsAtBeat);
  if (!report) return;
  stallsSent++;
  capture("js_stall", report);
}

export function startJsStalls() {
  timeBridge((globalThis as { __fbBatchedBridge?: Bridge }).__fbBatchedBridge);
  timeEngineEvents((name, run) => timed(`engine ${name}`, run));
  if (beat) return;
  lastBeat = Date.now();
  statsAtBeat = runtimeStats();
  beat = setInterval(onBeat, BEAT_MS);
}

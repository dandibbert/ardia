import { fieldTiming } from "../../platform/fieldTiming";
import { capture, isSharing } from "./client";

type Bridge = Record<string, unknown>;
type LongTask = { label: string; start: number; ms: number };

const BEAT_MS = 250;
const STALL_MS = 1000;
const LONG_TASK_MS = 200;
const KEPT_TASKS = 30;
const REPORTED_TASKS = 3;
const MAX_STALLS_PER_SESSION = 50;

const longTasks: LongTask[] = [];
let stallsSent = 0;
let lastBeat = 0;
let beat: ReturnType<typeof setInterval> | undefined;

function labelOf(entry: string, args: unknown[]): string {
  if (entry === "__invokeCallback") return "callback";
  if (entry === "__callReactNativeMicrotasks") return "microtasks";
  const [module, method, params] = args as [unknown, unknown, unknown];
  const event = module === "RCTDeviceEventEmitter" && Array.isArray(params) && typeof params[0] === "string" ? `:${params[0]}` : "";
  return `${String(module)}.${String(method)}${event}`.slice(0, 120);
}

export function noteLongTask(label: string, start: number, ms: number) {
  longTasks.push({ label, start, ms: Math.round(ms) });
  if (longTasks.length > KEPT_TASKS) longTasks.splice(0, longTasks.length - KEPT_TASKS);
}

export function timeBridge(bridge: Bridge | undefined, clock = () => Date.now()): boolean {
  if (!bridge || bridge.__ardiaTimed) return false;
  let timed = false;
  for (const entry of ["__callFunction", "__invokeCallback", "__callReactNativeMicrotasks"]) {
    const original = bridge[entry];
    if (typeof original !== "function") continue;
    bridge[entry] = function timedEntry(this: unknown, ...args: unknown[]) {
      const start = clock();
      try {
        return original.apply(this, args);
      } finally {
        const ms = clock() - start;
        if (ms >= LONG_TASK_MS) noteLongTask(labelOf(entry, args), start, ms);
      }
    };
    timed = true;
  }
  bridge.__ardiaTimed = timed;
  return timed;
}

export function stallReport(from: number, to: number, inputAt: number): Record<string, string | number> | null {
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
  return props;
}

function onBeat() {
  const now = Date.now();
  const from = lastBeat + BEAT_MS;
  lastBeat = now;
  if (now - from < STALL_MS || stallsSent >= MAX_STALLS_PER_SESSION || !isSharing()) return;
  const [inputAt] = fieldTiming.lastInput();
  const report = stallReport(from, now, inputAt);
  if (!report) return;
  stallsSent++;
  capture("js_stall", report);
}

export function startJsStalls() {
  timeBridge((globalThis as { __fbBatchedBridge?: Bridge }).__fbBatchedBridge);
  if (beat) return;
  lastBeat = Date.now();
  beat = setInterval(onBeat, BEAT_MS);
}

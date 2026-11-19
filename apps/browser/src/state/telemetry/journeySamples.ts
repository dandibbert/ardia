import { percentile } from "./transport";

const MAX_SAMPLES = 500;
const samples = new Map<string, number[]>();
const counts = new Map<string, number>();

export function sample(step: string, ms: number | null) {
  if (ms === null || !(ms >= 0 && ms < 60_000)) return;
  let list = samples.get(step);
  if (!list) samples.set(step, (list = []));
  if (list.length < MAX_SAMPLES) list.push(Math.round(ms));
}

export const count = (what: string) => counts.set(what, (counts.get(what) ?? 0) + 1);
export const since = (at: number | null | undefined, from: number | null | undefined) => (at == null || from == null ? null : at - from);

export function forgetJourneySamples() {
  samples.clear();
  counts.clear();
}

export function summarizeJourneySamples(): Record<string, number> | null {
  if (!samples.size && !counts.size) return null;
  const props: Record<string, number> = {};
  for (const [step, list] of samples) {
    list.sort((a, b) => a - b);
    const at = (p: number) => percentile(list, p);
    props[`${step}_p50`] = at(0.5);
    props[`${step}_p75`] = at(0.75);
    props[`${step}_p95`] = at(0.95);
    props[`${step}_max`] = list.at(-1)!;
    props[`${step}_n`] = list.length;
  }
  for (const [what, n] of counts) props[what] = n;
  forgetJourneySamples();
  return props;
}

export const devJourneySamples = () => ({ samples: Object.fromEntries(samples), counts: Object.fromEntries(counts) });

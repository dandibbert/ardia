import { noteSidebarMotionMerge, noteSidebarMotionRescue } from "../../state/telemetry/usage";

type MotionPlan = { moves: { key: string }[]; ghosts: unknown[]; clipped: string[]; below: number };

export function mergePlans<P extends MotionPlan>(first: P, then: P): P {
  const later = new Set(then.moves.map((m) => m.key));
  return {
    ...then,
    moves: [...first.moves.filter((m) => !later.has(m.key)), ...then.moves],
    ghosts: [...first.ghosts, ...then.ghosts],
    clipped: [...new Set([...first.clipped, ...then.clipped])],
    below: first.below + then.below,
  };
}

export function withPending<P extends MotionPlan>(pending: P | null, plan: P): P {
  if (!pending) return plan;
  noteSidebarMotionMerge();
  return mergePlans(pending, plan);
}

export const STARTS_WITHIN_MS = 1000;

type StartedAt = { until: number };
type PreparedSlide = StartedAt & { at: number; landed: boolean };
type PreparedGhost = StartedAt & { born: number };

const overdue = (prepared: number, now: number) => now - prepared >= STARTS_WITHIN_MS;

export function slideOver(slide: PreparedSlide, now: number): boolean {
  if (slide.until) return now >= slide.until;
  if (slide.landed || !overdue(slide.at, now)) return false;
  noteSidebarMotionRescue();
  return true;
}

export function ghostOver(ghost: PreparedGhost, now: number): boolean {
  return ghost.until ? now >= ghost.until : overdue(ghost.born, now);
}

export function neverStarted(slides: Iterable<PreparedSlide>, ghosts: readonly PreparedGhost[], now: number): boolean {
  const stuck = ghosts.filter((g) => !g.until && overdue(g.born, now)).length;
  for (let i = 0; i < stuck; i++) noteSidebarMotionRescue();
  return stuck > 0 || [...slides].some((s) => !s.until && !s.landed && overdue(s.at, now));
}

import { noteSidebarMotionMerge } from "../../state/telemetry/usage";

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

type MotionPlan = { moves: { key: string }[]; ghosts: unknown[]; clipped: string[]; below: number };

export function mergePlans<P extends MotionPlan>(earlier: P, later: P): P {
  const moved = new Set(later.moves.map((m) => m.key));
  return {
    ...later,
    moves: [...earlier.moves.filter((m) => !moved.has(m.key)), ...later.moves],
    ghosts: [...earlier.ghosts, ...later.ghosts],
    below: later.below || earlier.below,
  };
}

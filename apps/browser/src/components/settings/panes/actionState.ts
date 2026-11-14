export type ActionState<M> = { phase: "idle"; message: M | null } | { phase: "running" };

export const IDLE_ACTION: ActionState<never> = { phase: "idle", message: null };
export const RUNNING_ACTION: ActionState<never> = { phase: "running" };

export function finishedAction<M>(state: ActionState<M>, message: M | null): ActionState<M> {
  if (message !== null) return { phase: "idle", message };
  return state.phase === "idle" ? state : IDLE_ACTION;
}

export const actionMessage = <M>(state: ActionState<M>): M | null => (state.phase === "idle" ? state.message : null);

export const actionRunning = (state: ActionState<unknown>): boolean => state.phase === "running";

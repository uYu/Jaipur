import type { Save } from "./types.ts";
import type { Presentation } from "./presentation.ts";
import { presentAction } from "./presentation.ts";
import { newGame } from "./engine.ts";
import { advance } from "./storage.ts";
export type ActionRecord = {
  round: number;
  turn: number;
  action: Presentation;
};
export const lastActionOrder = (latestActor: number | null) =>
  latestActor === 1 ? [0, 1] : [1, 0];
export function actionSummaries(
  save: Save | null,
  limit = save?.events.length ?? 0,
  revealOpponent = false,
): {
  receipts: [Presentation | null, Presentation | null];
  lastActions: [Presentation | null, Presentation | null];
  lastTurns: [number | null, number | null];
  latestActor: number | null;
  history: ActionRecord[];
} {
  let result: [Presentation | null, Presentation | null] = [null, null];
  let lastActions: [Presentation | null, Presentation | null] = [null, null];
  let lastTurns: [number | null, number | null] = [null, null];
  let latestActor: number | null = null;
  const history: ActionRecord[] = [];
  if (!save)
    return { receipts: result, lastActions, lastTurns, latestActor, history };
  let state = newGame(save.seed, save.targetSeals ?? 2);
  for (const event of save.events.slice(0, limit)) {
    const next = advance(state, event);
    if (event.type === "next") {
      result = [null, null];
      lastActions = [null, null];
      lastTurns = [null, null];
      latestActor = null;
    } else {
      const presentation = presentAction(state, event, next, revealOpponent);
      lastActions[state.current] = presentation;
      lastTurns[state.current] = state.turn + 1;
      latestActor = state.current;
      history.push({
        round: state.round,
        turn: state.turn + 1,
        action: presentation,
      });
      if (event.type === "sell") result[state.current] = presentation;
    }
    state = next;
  }
  return { receipts: result, lastActions, lastTurns, latestActor, history };
}
export function saleReceipts(
  save: Save | null,
  limit = save?.events.length ?? 0,
): [Presentation | null, Presentation | null] {
  return actionSummaries(save, limit).receipts;
}

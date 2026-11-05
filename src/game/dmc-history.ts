// Public action history for the DouZero-style research Q-network. Keep only
// actions in the current round; the state encoder already carries match seals.
import { DMC_ACTION, dmcAction } from "./dmc.ts";
import { observe } from "./ai.ts";
import { applyAction, newGame, nextRound } from "./engine.ts";
import type { Event } from "./types.ts";

export const DMC_HISTORY_LENGTH = 16;
export const DMC_HISTORY_FEATURES = DMC_ACTION + 2;

export type DmcPublicMove = { actor: number; action: number[] };

export function dmcEventHistory(seed: number, events: Event[], observer: number): number[][] {
  let state = newGame(seed);
  let moves: DmcPublicMove[] = [];
  for (const event of events) {
    if (event.type === "next") {
      state = nextRound(state);
      moves = [];
    } else {
      moves.push({ actor: state.current, action: dmcAction(observe(state), event) });
      state = applyAction(state, event);
    }
  }
  return dmcHistory(moves, observer);
}

export function dmcHistory(
  moves: readonly DmcPublicMove[],
  observer: number,
): number[][] {
  if (observer !== 0 && observer !== 1) throw Error("Invalid observer");
  const result = Array.from({ length: DMC_HISTORY_LENGTH }, () =>
    Array<number>(DMC_HISTORY_FEATURES).fill(0),
  );
  const recent = moves.slice(-DMC_HISTORY_LENGTH);
  const offset = DMC_HISTORY_LENGTH - recent.length;
  for (let i = 0; i < recent.length; i++) {
    const move = recent[i];
    if ((move.actor !== 0 && move.actor !== 1) ||
        move.action.length !== DMC_ACTION ||
        move.action.some((value) => !Number.isFinite(value)))
      throw Error("Invalid public move");
    result[offset + i] = [
      move.actor === observer ? 1 : 0,
      move.actor === observer ? 0 : 1,
      ...move.action,
    ];
  }
  return result;
}

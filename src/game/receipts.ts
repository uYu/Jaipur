import type { Save } from "./types.ts";
import type { Presentation } from "./presentation.ts";
import { presentAction } from "./presentation.ts";
import { newGame } from "./engine.ts";
import { advance } from "./storage.ts";
export function saleReceipts(
  save: Save | null,
  limit = save?.events.length ?? 0,
): [Presentation | null, Presentation | null] {
  let result: [Presentation | null, Presentation | null] = [null, null];
  if (!save) return result;
  let state = newGame(save.seed);
  for (const event of save.events.slice(0, limit)) {
    const next = advance(state, event);
    if (event.type === "next") result = [null, null];
    else if (event.type === "sell")
      result[state.current] = presentAction(state, event, next);
    state = next;
  }
  return result;
}

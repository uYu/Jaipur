import { GOODS, type State } from "./types.ts";

export function roundEndCause(state: State) {
  if (state.phase === "playing") return null;
  const depleted = GOODS.filter((g) => !state.tokens[g].length);
  // Match the engine: three depleted goods take priority when both conditions hold.
  return depleted.length >= 3
    ? { kind: "tokens" as const, title: "三类货物筹码已售罄", depleted }
    : {
        kind: "market" as const,
        title: "牌堆无法补满市场",
        deckCount: state.deck.length,
        marketCount: state.market.length,
      };
}

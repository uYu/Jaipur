import { sum } from "./data.ts";
import type { Good, State } from "./types.ts";

export function playerCardsDisplay(
  state: State,
  actor: 0 | 1,
  revealOpponent = false,
): {
  handCount: number;
  hand: Good[] | null;
  camels: number | null;
} {
  const player = state.players[actor];
  return {
    handCount: player.hand.length,
    hand: actor === 0 || revealOpponent ? [...player.hand] : null,
    camels:
      actor === 0 || revealOpponent || state.phase !== "playing"
        ? player.camels
        : null,
  };
}

export type PublicScoreView = {
  total: number | null;
  goods: number | null;
  bonus: number | null;
  goodsTokenCount: number;
  bonusTokenCount: number;
  hidden: boolean;
};

// Token counts remain visible during play; the opponent's accumulated score
// and bonus faces are revealed at settlement, or explicitly in replay.
export function playerScoreDisplay(
  state: State,
  actor: 0 | 1,
  revealOpponent = false,
): PublicScoreView {
  const player = state.players[actor];
  const counts = {
    goodsTokenCount: player.goods.length,
    bonusTokenCount: player.bonuses.length,
  };
  if (state.phase === "playing" && actor === 1 && !revealOpponent)
    return { ...counts, total: null, goods: null, bonus: null, hidden: true };

  const settled = state.phase !== "playing";
  const result = settled
    ? state.results.find((round) => round.round === state.round)
    : undefined;
  const goods = result?.goods[actor] ?? sum(player.goods);
  const bonus = result?.bonuses[actor] ?? sum(player.bonuses);
  const camelBonus =
    settled && player.camels > state.players[1 - actor].camels ? 5 : 0;

  return {
    ...counts,
    goods,
    bonus,
    total: result?.scores[actor] ?? goods + bonus + camelBonus,
    hidden: false,
  };
}

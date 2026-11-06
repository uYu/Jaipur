import { sum } from "./data.ts";
import type { State } from "./types.ts";

export type PublicScoreView = {
  total: number | null;
  goods: number | null;
  bonus: number | null;
  goodsTokenCount: number;
  bonusTokenCount: number;
  hidden: boolean;
};

// Token counts remain visible during play; the opponent's accumulated score
// and bonus faces are revealed only when the round has been settled.
export function playerScoreDisplay(
  state: State,
  actor: 0 | 1,
): PublicScoreView {
  const player = state.players[actor];
  const counts = {
    goodsTokenCount: player.goods.length,
    bonusTokenCount: player.bonuses.length,
  };
  if (state.phase === "playing" && actor === 1)
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

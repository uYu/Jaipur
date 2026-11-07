import type { Observation } from "./ai.ts";
import { BONUS_VALUES, COUNTS, precious, sum } from "./data.ts";
import { GOODS } from "./types.ts";
import type { Action } from "./types.ts";

/** Conservative settlement bounds derived entirely from public information. */
export function publicRoundBounds(o: Observation) {
  // Every card is in a hand, herd, market, discard, or deck. This determines
  // the opposing herd without reading it from the simulator's hidden state.
  const opponentCamels =
    sum(Object.values(COUNTS)) -
    o.hand.length -
    o.camels -
    o.market.length -
    o.discard.length -
    o.deckCount -
    o.opponentHandCount;
  const pools = structuredClone(BONUS_VALUES);
  for (const value of o.bonuses) {
    const tier = ([3, 4, 5] as const).find((t) => pools[t].includes(value));
    if (tier === undefined) return undefined;
    pools[tier].splice(pools[tier].indexOf(value), 1);
  }
  let opponentBonusScore = 0;
  let opponentBonusCount = 0;
  for (const tier of [3, 4, 5] as const) {
    const count = pools[tier].length - o.bonusCounts[tier];
    if (count < 0 || count > pools[tier].length) return undefined;
    opponentBonusCount += count;
    // The opponent may hold the most valuable unobserved tokens of each tier.
    opponentBonusScore += sum(pools[tier].slice(pools[tier].length - count));
  }

  function wins(camels: number, goods: number[] = [], tier?: 3 | 4 | 5) {
    const bonus = tier !== undefined && o.bonusCounts[tier] > 0;
    // Even the least valuable possible draw must win against the upper bound.
    const bonusScore = bonus ? pools[tier!][0] : 0;
    const differences = [
      sum(o.goods) +
        sum(o.bonuses) +
        sum(goods) +
        bonusScore +
        (camels > opponentCamels ? 5 : 0) -
        sum(o.opponentGoods) -
        opponentBonusScore -
        (opponentCamels > camels ? 5 : 0),
      o.bonuses.length + Number(bonus) - opponentBonusCount,
      o.goods.length + goods.length - o.opponentGoods.length,
    ];
    return (differences.find((n) => n !== 0) ?? 0) > 0;
  }
  return { pools, opponentCamels, wins };
}

/** Prove a round win from public information, including every hidden bonus face. */
export function findImmediateWinningAction(o: Observation): Action | undefined {
  const depleted = GOODS.filter((g) => o.tokens[g].length === 0).length;
  const marketCamels = o.market.filter((c) => c === "camel").length;
  if (depleted < 2 && o.deckCount >= Math.max(1, marketCamels))
    return undefined;
  const bounds = publicRoundBounds(o);
  if (!bounds) return undefined;
  const { wins } = bounds;

  for (const good of GOODS) {
    const tokens = o.tokens[good];
    if (!tokens.length || depleted < 2) continue;
    const held = o.hand.filter((g) => g === good).length;
    for (
      let count = Math.max(precious(good) ? 2 : 1, tokens.length);
      count <= held;
      count++
    ) {
      const tier = count >= 3 ? (Math.min(5, count) as 3 | 4 | 5) : undefined;
      if (wins(o.camels, tokens.slice(0, count), tier))
        return { type: "sell", good, count };
    }
  }
  // Refill must fail, rather than merely consume the last card of the deck.
  if (
    o.hand.length < 7 &&
    o.market.length - 1 + o.deckCount < 5 &&
    wins(o.camels)
  ) {
    const index = o.market.findIndex((c) => c !== "camel");
    if (index >= 0) return { type: "take", index };
  }
  if (
    marketCamels > 0 &&
    o.market.length - marketCamels + o.deckCount < 5 &&
    wins(o.camels + marketCamels)
  )
    return { type: "camels" };
  return undefined;
}

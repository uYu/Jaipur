// Public-information state/action encoder for the experimental Deep Monte Carlo agent.
// This module deliberately accepts Observation, never a full simulator State.
import { GOODS } from "./types.ts";
import type { Action, Good } from "./types.ts";
import type { Observation } from "./ai.ts";
import { COUNTS, sum } from "./data.ts";

export const DMC_STATE = 146;
export const DMC_ACTION = 24;
export type MatchContext = {
  ownSeals: number;
  opponentSeals: number;
  round: number;
};
const counts = (cards: readonly string[]) =>
  GOODS.map((g) => cards.filter((c) => c === g).length);

export function dmcState(o: Observation, context: MatchContext): number[] {
  const hand = counts(o.hand),
    market = counts(o.market),
    discard = counts(o.discard);
  const x = [
    ...hand.map((n) => n / 7),
    sum(o.goods) / 100,
    sum(o.opponentGoods) / 100,
    sum(o.bonuses) / 50,
    o.hand.length / 7,
    o.opponentHandCount / 7,
    o.camels / 11,
    o.deckCount / 40,
    o.turn / 100,
    ...market.map((n) => n / 5),
    o.market.filter((c) => c === "camel").length / 5,
    ...GOODS.map((g) => o.tokens[g].length / 9),
  ];
  for (const g of GOODS)
    for (let n = 0; n < 9; n++) x.push((o.tokens[g][n] ?? 0) / 7);
  x.push(
    ...([3, 4, 5] as const).map((t) => o.bonusCounts[t] / 7),
    ...discard.map((n) => n / 10),
  );
  const worlds = o.opponentHandDistribution ?? [];
  const mass = worlds.reduce((s, w) => s + w.probability, 0);
  if (!(mass > 0)) throw Error("DMC requires a public hand posterior");
  const marginals = Array<number>(48).fill(0);
  for (const world of worlds)
    for (let g = 0; g < 6; g++)
      marginals[g * 8 + world.hand[g]] += world.probability / mass;
  x.push(
    ...marginals,
    o.opponentNextSaleCloseProbability ?? 0,
    o.bonuses.length / 18,
    o.goods.length / 38,
    o.opponentGoods.length / 38,
  );
  const unknownGoods = GOODS.reduce(
    (s, g, i) => s + COUNTS[g] - hand[i] - market[i] - discard[i],
    0,
  );
  const unknownCamels =
    11 - o.camels - o.market.filter((c) => c === "camel").length;
  const opponentCamels =
    unknownGoods + unknownCamels - o.opponentHandCount - o.deckCount;
  x.push(
    context.ownSeals / 2,
    context.opponentSeals / 2,
    context.round / 3,
    opponentCamels / 11,
  );
  if (x.length !== DMC_STATE || x.some((v) => !Number.isFinite(v)))
    throw Error("Bad DMC state encoding");
  return x;
}

export function dmcAction(o: Observation, a: Action): number[] {
  const x = Array<number>(DMC_ACTION).fill(0);
  const kind = { take: 0, camels: 1, sell: 2, exchange: 3 }[a.type];
  x[kind] = 1;
  if (a.type === "take") x[17 + GOODS.indexOf(o.market[a.index] as Good)] = 1;
  if (a.type === "sell") {
    x[16] = a.count / 7;
    x[17 + GOODS.indexOf(a.good)] = 1;
  }
  if (a.type === "exchange") {
    for (const i of a.market)
      x[4 + GOODS.indexOf(o.market[i] as Good)] += 1 / 7;
    for (const i of a.hand) x[10 + GOODS.indexOf(o.hand[i])] += 1 / 7;
    x[23] = a.camels / 7;
  }
  return x;
}

// Enumerate count vectors instead of physical-card subsets. Equivalent cards
// have one canonical action; no legal sale amount or exchange is pruned.
export function dmcActions(o: Observation): Action[] {
  const hand = counts(o.hand),
    market = counts(o.market),
    out: Action[] = [];
  for (let g = 0; g < 6; g++) {
    if (o.hand.length < 7 && market[g])
      out.push({ type: "take", index: o.market.indexOf(GOODS[g]) });
    for (let n = g < 3 ? 2 : 1; n <= hand[g]; n++)
      out.push({ type: "sell", good: GOODS[g], count: n });
  }
  if (o.market.includes("camel")) out.push({ type: "camels" });
  const take = Array<number>(6).fill(0),
    give = Array<number>(6).fill(0);
  function payment(g: number, left: number) {
    if (g === 6) {
      if (left > o.camels || o.hand.length + left > 7) return;
      const t = [...take],
        v = [...give];
      out.push({
        type: "exchange",
        camels: left,
        market: o.market.flatMap((c, i) =>
          c !== "camel" && t[GOODS.indexOf(c)]-- > 0 ? [i] : [],
        ),
        hand: o.hand.flatMap((c, i) => (v[GOODS.indexOf(c)]-- > 0 ? [i] : [])),
      });
      return;
    }
    for (let n = 0; n <= (take[g] ? 0 : Math.min(left, hand[g])); n++) {
      give[g] = n;
      payment(g + 1, left - n);
    }
  }
  function targets(g: number, total: number) {
    if (g === 6) {
      if (total >= 2) payment(0, total);
      return;
    }
    for (let n = 0; n <= market[g]; n++) {
      take[g] = n;
      targets(g + 1, total + n);
    }
  }
  targets(0, 0);
  return out;
}

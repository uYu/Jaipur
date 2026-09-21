import { GOODS } from "./types.ts";
import type { Action, Card, Difficulty, Good, State } from "./types.ts";
import { COUNTS, precious, random, sum } from "./data.ts";
import { legalActions } from "./engine.ts";
export type Observation = {
  hand: Good[];
  camels: number;
  market: Card[];
  tokens: State["tokens"];
  bonusCounts: Record<3 | 4 | 5, number>;
  discard: Good[];
  deckCount: number;
  opponentHandCount: number;
  turn: number;
};
export function observe(s: State): Observation {
  const p = s.players[s.current];
  return {
    hand: [...p.hand],
    camels: p.camels,
    market: [...s.market],
    tokens: structuredClone(s.tokens),
    bonusCounts: {
      3: s.bonus[3].length,
      4: s.bonus[4].length,
      5: s.bonus[5].length,
    },
    discard: [...s.discard],
    deckCount: s.deck.length,
    opponentHandCount: s.players[1 - s.current].hand.length,
    turn: s.turn,
  };
}
function potential(hand: Good[], o: Observation): number {
  return (
    GOODS.reduce((value, g) => {
      const n = hand.filter((c) => c === g).length;
      if (!n) return value;
      const tier = Math.min(5, n) as 3 | 4 | 5,
        bonus =
          n >= 3 && o.bonusCounts[tier]
            ? tier === 3
              ? 2
              : tier === 4
                ? 5
                : 9
            : 0;
      const remaining = COUNTS[g] - o.discard.filter((c) => c === g).length - n;
      const singleton = precious(g) && n === 1;
      const base = sum(o.tokens[g].slice(0, n));
      return (
        value +
        (base + bonus) * 0.72 * (singleton ? (remaining ? 0.6 : 0) : 1) +
        (n === 2 && !precious(g) && remaining ? 0.8 : 0) +
        (n === 4 && remaining ? 0.8 : 0)
      );
    }, 0) -
    Math.max(0, hand.length - 5) * 0.35
  );
}
export function chooseAction(o: Observation, difficulty: Difficulty): Action {
  const actions = legalActions({
    phase: "playing",
    market: o.market,
    current: 0,
    players: [
      { hand: o.hand, camels: o.camels, goods: [], bonuses: [] },
      { hand: [], camels: 0, goods: [], bonuses: [] },
    ],
  });
  if (!actions.length) throw new Error("没有合法行动");
  const before = potential(o.hand, o);
  let rng = (o.turn * 7837 + o.hand.length * 919 + o.deckCount * 1723) >>> 0;
  const ranked = actions.map((action) => {
    let hand = [...o.hand],
      reward = 0,
      camels = o.camels,
      risk = 0;
    if (action.type === "take") hand.push(o.market[action.index] as Good);
    if (action.type === "camels") {
      const n = o.market.filter((c) => c === "camel").length;
      camels += n;
      risk = n * (o.opponentHandCount < 6 ? 0.6 : 0.15);
    }
    if (action.type === "exchange") {
      hand = hand
        .filter((_, i) => !action.hand.includes(i))
        .concat(action.market.map((i) => o.market[i] as Good));
      camels -= action.camels;
      risk = action.hand.reduce(
        (v, i) => v + (o.tokens[o.hand[i]][0] ?? 0) * 0.2,
        0,
      );
    }
    if (action.type === "sell") {
      for (let i = 0; i < action.count; i++)
        hand.splice(hand.indexOf(action.good), 1);
      const n = Math.min(action.count, 5) as 3 | 4 | 5;
      reward =
        sum(o.tokens[action.good].slice(0, action.count)) +
        (action.count >= 3 && o.bonusCounts[n]
          ? n === 3
            ? 2
            : n === 4
              ? 5
              : 9
          : 0);
      if (
        difficulty === "hard" &&
        action.count >= o.tokens[action.good].length &&
        GOODS.filter((g) => !o.tokens[g].length).length === 2
      )
        reward -= potential(hand, o) * 0.6;
    }
    const herd = (n: number) =>
      Math.min(n, 4) * 1.25 + Math.min(Math.max(n - 4, 0), 3) * 0.3;
    let score =
      reward +
      potential(hand, o) -
      before +
      herd(camels) -
      herd(o.camels) -
      risk;
    if (difficulty === "hard") {
      // Value immediate competition for scarce tokens and late-round liquidation.
      if (action.type === "sell") score += o.deckCount < 8 ? reward * 0.25 : 0;
      if (action.type === "take" && precious(o.market[action.index] as Good))
        score += 0.45;
      if (action.type === "exchange") score -= 0.15;
      if (action.type === "camels" && o.deckCount < 7)
        score += Math.min(camels, 6) * 0.16;
    }
    const [r, next] = random(rng);
    rng = next;
    score +=
      r * (difficulty === "easy" ? 5 : difficulty === "normal" ? 0.65 : 0.12);
    return { action, score };
  });
  return ranked.sort((a, b) => b.score - a.score)[0].action;
}

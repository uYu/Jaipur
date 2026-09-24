import { GOODS } from "./types.ts";
import type { Action, Card, Good, State } from "./types.ts";
import { BONUS_VALUES, COUNTS, sum } from "./data.ts";
import type { Observation } from "./ai.ts";
import { dmcActions, dmcAction } from "./dmc.ts";

export const STATE_SIZE = 109;
export const EVENT_SIZE = 32;
export type PublicEvent = {
  actor: number;
  kind: Action["type"] | "next";
  take: number[];
  give: number[];
  camels: number;
  marketBefore: Card[];
  marketAfter: Card[];
  tier: number;
  phase: State["phase"];
  seals: number[];
  scores: number[];
  round: number;
};
export type PlayerView = {
  player: number;
  observation: Observation;
  opponentCamels: number;
  bonusTiers: number[][];
  ownBonusTiers: number[];
  seals: number[];
  starter: number;
  current: number;
  round: number;
  history: PublicEvent[];
};
export const cardCounts = (xs: readonly string[]) =>
  [...GOODS, "camel"].map((g) => xs.filter((x) => x === g).length);
export function publicEvent(
  before: State,
  after: State,
  a: Action | { type: "next" },
): PublicEvent {
  const take = Array<number>(6).fill(0),
    give = Array<number>(6).fill(0);
  let camels = 0;
  if (a.type === "take") take[GOODS.indexOf(before.market[a.index] as Good)]++;
  if (a.type === "sell") give[GOODS.indexOf(a.good)] = a.count;
  if (a.type === "exchange") {
    a.market.forEach((i) => take[GOODS.indexOf(before.market[i] as Good)]++);
    a.hand.forEach(
      (i) => give[GOODS.indexOf(before.players[before.current].hand[i])]++,
    );
    camels = -a.camels;
  }
  if (a.type === "camels")
    camels = before.market.filter((c) => c === "camel").length;
  const tier =
    a.type === "sell" &&
    a.count >= 3 &&
    after.players[before.current].bonuses.length >
      before.players[before.current].bonuses.length
      ? Math.min(5, a.count)
      : 0;
  return {
    actor: a.type === "next" ? -1 : before.current,
    kind: a.type,
    take,
    give,
    camels,
    marketBefore: [...before.market],
    marketAfter: [...after.market],
    tier,
    phase: after.phase,
    seals: [...after.seals],
    scores:
      after.phase === "playing" ? [0, 0] : [...after.results.at(-1)!.scores],
    round: after.round,
  };
}
export function playerView(
  s: State,
  player: number,
  history: PublicEvent[],
): PlayerView {
  const p = s.players[player],
    opp = s.players[1 - player];
  const bonusTiers: number[][] = [[], []];
  const known = Array<number>(6).fill(0);
  for (const e of history) {
    if (e.kind === "next") {
      bonusTiers[0] = [];
      bonusTiers[1] = [];
      known.fill(0);
    } else {
      if (e.tier) bonusTiers[e.actor].push(e.tier);
      if (e.actor !== player)
        for (let g = 0; g < 6; g++)
          known[g] = Math.max(0, known[g] - e.give[g]) + e.take[g];
    }
  }
  const opponentCamels =
    55 -
    p.hand.length -
    p.camels -
    s.market.length -
    s.discard.length -
    s.deck.length -
    opp.hand.length;
  return {
    player,
    opponentCamels,
    bonusTiers,
    ownBonusTiers: bonusTiers[player],
    seals: [...s.seals],
    starter: s.starter,
    current: s.current,
    round: s.round,
    history,
    observation: {
      hand: [...p.hand],
      camels: p.camels,
      goods: [...p.goods],
      bonuses: [...p.bonuses],
      opponentGoods: [...opp.goods],
      knownOpponentHand: GOODS.flatMap((g, i) => Array<Good>(known[i]).fill(g)),
      market: [...s.market],
      tokens: structuredClone(s.tokens),
      bonusCounts: {
        3: s.bonus[3].length,
        4: s.bonus[4].length,
        5: s.bonus[5].length,
      },
      discard: [...s.discard],
      deckCount: s.deck.length,
      opponentHandCount: opp.hand.length,
      turn: s.turn,
    },
  };
}
export function stateFeatures(v: PlayerView): number[] {
  const o = v.observation,
    tierCounts = (p: number) =>
      [3, 4, 5].map((t) => v.bonusTiers[p].filter((x) => x === t).length / 7);
  const x = [
    ...cardCounts(o.hand)
      .slice(0, 6)
      .map((n) => n / 7),
    o.camels / 11,
    o.opponentHandCount / 7,
    v.opponentCamels / 11,
    sum(o.goods) / 100,
    sum(o.opponentGoods) / 100,
    sum(o.bonuses) / 50,
    ...tierCounts(v.player),
    ...tierCounts(1 - v.player),
    ...cardCounts(o.market).map((n) => n / 5),
    ...GOODS.map((g) => o.tokens[g].length / 9),
    ...GOODS.flatMap((g) =>
      Array.from({ length: 9 }, (_, i) => (o.tokens[g][i] ?? 0) / 7),
    ),
    ...[3, 4, 5].map((t) => o.bonusCounts[t as 3 | 4 | 5] / 7),
    ...cardCounts(o.discard)
      .slice(0, 6)
      .map((n) => n / 10),
    o.deckCount / 40,
    o.turn / 100,
    v.seals[v.player] / 2,
    v.seals[1 - v.player] / 2,
    Math.log1p(v.round) / 2,
    v.starter === v.player ? 1 : 0,
    v.current === v.player ? 1 : 0,
    o.goods.length / 38,
    o.opponentGoods.length / 38,
    ...cardCounts(o.knownOpponentHand)
      .slice(0, 6)
      .map((n) => n / 7),
  ];
  if (x.length !== STATE_SIZE || x.some((n) => !Number.isFinite(n)))
    throw Error("Invalid public state features");
  return x;
}
export function eventFeatures(e: PublicEvent, p: number): number[] {
  return [
    e.actor === p ? 1 : 0,
    e.actor === 1 - p ? 1 : 0,
    ...["take", "camels", "sell", "exchange", "next"].map((k) =>
      e.kind === k ? 1 : 0,
    ),
    ...e.take.map((n) => n / 7),
    ...e.give.map((n) => n / 7),
    e.camels / 11,
    ...cardCounts(e.marketAfter).map((n) => n / 5),
    e.seals[p] / 2,
    e.seals[1 - p] / 2,
    e.phase === "playing" ? 0 : 1,
    e.scores[p] / 100,
    e.scores[1 - p] / 100,
  ];
}
export function rowFeatures(v: PlayerView) {
  const actions = dmcActions(v.observation);
  return {
    state: stateFeatures(v),
    history: v.history.map((e) => eventFeatures(e, v.player)),
    actions: actions.map((a) => dmcAction(v.observation, a)),
  };
}

const choose = (n: number, k: number) => {
  if (k < 0 || k > n) return 0;
  let x = 1;
  for (let i = 1; i <= k; i++) x = (x * (n - i + 1)) / i;
  return x;
};
export type HandParticle = { hand: number[]; probability: number };
/** Exact transfer/reveal filter; choices are interventions, not preference evidence. */
export function structuralBelief(v: PlayerView): HandParticle[] {
  const o = v.observation,
    p = v.player;
  let start = -1;
  for (let i = 0; i < v.history.length; i++)
    if (v.history[i].kind === "next") start = i;
  const trace = v.history.slice(start + 1);
  const own = cardCounts([...o.hand, ...Array<Card>(o.camels).fill("camel")]);
  let opponentCount = o.opponentHandCount,
    opponentCamels = v.opponentCamels;
  for (let i = trace.length - 1; i >= 0; i--) {
    const e = trace[i];
    if (e.actor === p) {
      for (let g = 0; g < 6; g++) own[g] += e.give[g] - e.take[g];
      own[6] -= e.camels;
    } else {
      opponentCount += sum(e.give) - sum(e.take);
      opponentCamels -= e.camels;
    }
  }
  const market = cardCounts(trace[0]?.marketBefore ?? o.market);
  const totals = [...GOODS, "camel"].map((g) => COUNTS[g as Card]);
  const pool = totals.map((n, i) => n - own[i] - market[i]);
  let worlds: HandParticle[] = [];
  const walk = (g: number, left: number, h: number[], w: number) => {
    if (g === 6) {
      if (left === 0)
        worlds.push({ hand: [...h, opponentCamels], probability: w });
      return;
    }
    for (let n = 0; n <= Math.min(left, pool[g]); n++) {
      h[g] = n;
      walk(g + 1, left - n, h, w * choose(pool[g], n));
    }
  };
  walk(0, opponentCount, Array(6).fill(0), choose(pool[6], opponentCamels));
  const discarded = Array<number>(7).fill(0);
  for (const e of trace) {
    const before = cardCounts(e.marketBefore),
      after = cardCounts(e.marketAfter);
    const revealed = after.map(
      (n, g) =>
        n -
        before[g] +
        (g < 6
          ? e.take[g] - (e.kind === "exchange" ? e.give[g] : 0)
          : e.kind === "camels"
            ? e.camels
            : e.kind === "exchange"
              ? e.camels
              : 0),
    );
    worlds = worlds.flatMap((w) => {
      const deck = totals.map(
        (n, g) => n - own[g] - before[g] - discarded[g] - w.hand[g],
      );
      let remaining = sum(deck),
        probability = w.probability;
      for (let g = 0; g < 7; g++)
        for (let j = 0; j < revealed[g]; j++) {
          if (deck[g] <= 0 || remaining <= 0) return [];
          probability *= deck[g]-- / remaining--;
        }
      const hand = [...w.hand];
      if (e.actor !== p) {
        for (let g = 0; g < 6; g++) {
          if (hand[g] < e.give[g]) return [];
          hand[g] += e.take[g] - e.give[g];
        }
        hand[6] += e.camels;
        if (hand.some((n) => n < 0)) return [];
      }
      return probability > 0 ? [{ hand, probability }] : [];
    });
    if (e.actor === p) {
      for (let g = 0; g < 6; g++) own[g] += e.take[g] - e.give[g];
      own[6] += e.camels;
    }
    if (e.kind === "sell")
      for (let g = 0; g < 6; g++) discarded[g] += e.give[g];
    const mass = worlds.reduce((s, w) => s + w.probability, 0);
    if (!(mass > 0)) throw Error("Public posterior lost all support");
    for (const w of worlds) w.probability /= mass;
  }
  const mass = worlds.reduce((s, w) => s + w.probability, 0);
  if (!(mass > 0)) throw Error("Empty public posterior");
  return worlds.map((w) => ({ ...w, probability: w.probability / mass }));
}
export function sampleState(
  v: PlayerView,
  worlds: HandParticle[],
  random: () => number,
): State {
  let u = random(),
    w = worlds.at(-1)!;
  for (const x of worlds) {
    u -= x.probability;
    if (u <= 0) {
      w = x;
      break;
    }
  }
  const o = v.observation,
    p = v.player,
    other = 1 - p;
  const shuffle = <T>(x: T[]) => {
    for (let i = x.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [x[i], x[j]] = [x[j], x[i]];
    }
    return x;
  };
  const bonus = structuredClone(BONUS_VALUES),
    oppBonuses: number[] = [];
  if (v.ownBonusTiers.length !== o.bonuses.length)
    throw Error("Missing public bonus history");
  o.bonuses.forEach((value, i) => {
    const tier = v.ownBonusTiers[i] as 3 | 4 | 5,
      at = bonus[tier].indexOf(value);
    if (at < 0) throw Error("Inconsistent bonus allocation");
    bonus[tier].splice(at, 1);
  });
  for (const t of [3, 4, 5] as const) shuffle(bonus[t]);
  for (const tier of v.bonusTiers[other]) {
    const value = bonus[tier as 3 | 4 | 5].pop();
    if (value === undefined) throw Error("Bonus support exhausted");
    oppBonuses.push(value);
  }
  const own = cardCounts([...o.hand, ...Array<Card>(o.camels).fill("camel")]),
    market = cardCounts(o.market),
    discard = cardCounts(o.discard);
  const deck = ([...GOODS, "camel"] as Card[]).flatMap((g, i) => {
    const n = COUNTS[g] - own[i] - market[i] - discard[i] - w.hand[i];
    if (n < 0) throw Error("Invalid sampled deck");
    return Array<Card>(n).fill(g);
  });
  const players: State["players"] = [
    { hand: [], camels: 0, goods: [], bonuses: [] },
    { hand: [], camels: 0, goods: [], bonuses: [] },
  ];
  players[p] = {
    hand: [...o.hand],
    camels: o.camels,
    goods: [...o.goods],
    bonuses: [...o.bonuses],
  };
  players[other] = {
    hand: GOODS.flatMap((g, i) => Array<Good>(w.hand[i]).fill(g)),
    camels: w.hand[6],
    goods: [...o.opponentGoods],
    bonuses: oppBonuses,
  };
  if (deck.length !== o.deckCount) throw Error("Sampled deck count differs");
  return {
    seed: Math.floor(random() * 0x100000000),
    rng: Math.floor(random() * 0x100000000),
    round: v.round,
    turn: o.turn,
    current: v.current,
    starter: v.starter,
    players,
    deck: shuffle(deck),
    market: [...o.market],
    discard: [...o.discard],
    tokens: structuredClone(o.tokens),
    bonus,
    seals: [v.seals[0], v.seals[1]],
    results: [],
    phase: "playing",
    log: [],
  };
}

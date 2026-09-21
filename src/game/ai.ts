import { chooseEnsembleAction } from "./ai-search.ts";
import { GOODS } from "./types.ts";
import type { Action, Card, Difficulty, Event, Good, State } from "./types.ts";
import { COUNTS, precious, random, sum } from "./data.ts";
import { applyAction, legalActions, newGame, nextRound } from "./engine.ts";

export type Observation = {
  hand: Good[];
  camels: number;
  goods: number[];
  bonuses: number[];
  opponentGoods: number[];
  knownOpponentHand: Good[];
  market: Card[];
  tokens: State["tokens"];
  bonusCounts: Record<3 | 4 | 5, number>;
  discard: Good[];
  deckCount: number;
  opponentHandCount: number;
  turn: number;
};

function removeKnown(cards: Good[], good: Good, count = 1) {
  for (let n = 0; n < count; n++) {
    const index = cards.indexOf(good);
    if (index < 0) break;
    cards.splice(index, 1);
  }
}

/** Infer only cards revealed by public actions; the dealt hand stays unknown. */
function publicOpponentKnowledge(
  state: State,
  events: Event[] | undefined,
  observer: number,
): Good[] {
  if (!events?.length) return [];
  let replay = newGame(state.seed);
  let known: Good[] = [];
  for (const event of events) {
    if (event.type === "next") {
      replay = nextRound(replay);
      known = [];
      continue;
    }
    const actor = replay.current;
    if (actor === 1 - observer) {
      if (event.type === "take") known.push(replay.market[event.index] as Good);
      if (event.type === "exchange") {
        const taken = event.market.map((i) => replay.market[i] as Good);
        const given = event.hand.map((i) => replay.players[actor].hand[i]);
        given.forEach((good) => removeKnown(known, good));
        known.push(...taken);
      }
      if (event.type === "sell") removeKnown(known, event.good, event.count);
    }
    replay = applyAction(replay, event);
  }
  return known.slice(0, state.players[1 - observer].hand.length);
}

export function observe(s: State, events?: Event[]): Observation {
  const player = s.current,
    p = s.players[player],
    opponent = s.players[1 - player];
  return {
    hand: [...p.hand],
    camels: p.camels,
    goods: [...p.goods],
    bonuses: [...p.bonuses],
    opponentGoods: [...opponent.goods],
    knownOpponentHand: publicOpponentKnowledge(s, events, player),
    market: [...s.market],
    tokens: structuredClone(s.tokens),
    bonusCounts: {
      3: s.bonus[3].length,
      4: s.bonus[4].length,
      5: s.bonus[5].length,
    },
    discard: [...s.discard],
    deckCount: s.deck.length,
    opponentHandCount: opponent.hand.length,
    turn: s.turn,
  };
}

function potential(hand: Good[], o: Observation): number {
  return (
    GOODS.reduce((value, good) => {
      const count = hand.filter((card) => card === good).length;
      if (!count) return value;
      const tier = Math.min(5, count) as 3 | 4 | 5;
      const bonus =
        count >= 3 && o.bonusCounts[tier]
          ? tier === 3
            ? 2
            : tier === 4
              ? 5
              : 9
          : 0;
      const remaining =
        COUNTS[good] - o.discard.filter((card) => card === good).length - count;
      const singleton = precious(good) && count === 1;
      const base = sum(o.tokens[good].slice(0, count));
      return (
        value +
        (base + bonus) * 0.72 * (singleton ? (remaining ? 0.6 : 0) : 1) +
        (count === 2 && !precious(good) && remaining ? 0.8 : 0) +
        (count === 4 && remaining ? 0.8 : 0)
      );
    }, 0) -
    Math.max(0, hand.length - 5) * 0.35
  );
}

function chooseHeuristicAction(
  o: Observation,
  difficulty: Exclude<Difficulty, "hard">,
): Action {
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
  return actions
    .map((action) => {
      let hand = [...o.hand],
        reward = 0,
        camels = o.camels,
        risk = 0;
      if (action.type === "take") hand.push(o.market[action.index] as Good);
      if (action.type === "camels") {
        const count = o.market.filter((card) => card === "camel").length;
        camels += count;
        risk = count * (o.opponentHandCount < 6 ? 0.6 : 0.15);
      }
      if (action.type === "exchange") {
        hand = hand
          .filter((_, i) => !action.hand.includes(i))
          .concat(action.market.map((i) => o.market[i] as Good));
        camels -= action.camels;
        risk = action.hand.reduce(
          (value, i) => value + (o.tokens[o.hand[i]][0] ?? 0) * 0.2,
          0,
        );
      }
      if (action.type === "sell") {
        for (let i = 0; i < action.count; i++)
          hand.splice(hand.indexOf(action.good), 1);
        const tier = Math.min(5, action.count) as 3 | 4 | 5;
        reward =
          sum(o.tokens[action.good].slice(0, action.count)) +
          (action.count >= 3 && o.bonusCounts[tier]
            ? tier === 3
              ? 2
              : tier === 4
                ? 5
                : 9
            : 0);
      }
      const herd = (count: number) =>
        Math.min(count, 4) * 1.25 + Math.min(Math.max(count - 4, 0), 3) * 0.3;
      const score =
        reward +
        potential(hand, o) -
        before +
        herd(camels) -
        herd(o.camels) -
        risk;
      const [noise, next] = random(rng);
      rng = next;
      return {
        action,
        score: score + noise * (difficulty === "easy" ? 5 : 0.65),
      };
    })
    .sort((a, b) => b.score - a.score)[0].action;
}

export function chooseAction(o: Observation, difficulty: Difficulty): Action {
  return difficulty === "hard"
    ? chooseEnsembleAction(o)
    : chooseHeuristicAction(o, difficulty);
}

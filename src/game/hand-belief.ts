import { GOODS } from "./types.ts";
import type { Card, Event, State } from "./types.ts";
import { COUNTS } from "./data.ts";
import { applyAction, newGame, nextRound } from "./engine.ts";

export type HandWorld = { hand: number[]; probability: number };
type BeliefCache = {
  seed: number;
  events: Event[];
  replay: State;
  worlds: HandWorld[];
};
const cache = new WeakMap<Event[], Map<string, BeliefCache>>();
const cards: Card[] = [...GOODS, "camel"];
const totals = cards.map((card) => COUNTS[card]);
const count = (values: Card[]) =>
  cards.map((card) => values.filter((x) => x === card).length);
const choose = (n: number, k: number) => {
  if (k < 0 || k > n) return 0;
  let value = 1;
  for (let i = 1; i <= k; i++) value = (value * (n - i + 1)) / i;
  return value;
};

function initialWorlds(state: State, observer: number): HandWorld[] {
  const own = count([
    ...state.players[observer].hand,
    ...Array<Card>(state.players[observer].camels).fill("camel"),
  ]);
  const market = count(state.market);
  const pool = totals.map((total, i) => total - own[i] - market[i]);
  const worlds: HandWorld[] = [];
  const denominator = choose(
    pool.reduce((a, b) => a + b),
    5,
  );
  const walk = (
    index: number,
    left: number,
    hand: number[],
    weight: number,
  ) => {
    if (index === 7) {
      if (!left)
        worlds.push({ hand: [...hand], probability: weight / denominator });
      return;
    }
    for (let n = 0; n <= Math.min(left, pool[index]); n++) {
      hand[index] = n;
      walk(index + 1, left - n, hand, weight * choose(pool[index], n));
    }
  };
  walk(0, 5, Array(7).fill(0), 1);
  const visibleHandCount = state.players[1 - observer].hand.length;
  const possible = worlds.filter(
    (world) =>
      world.hand.slice(0, 6).reduce((a, b) => a + b, 0) === visibleHandCount,
  );
  const mass = possible.reduce((total, world) => total + world.probability, 0);
  return possible.map((world) => ({
    ...world,
    probability: world.probability / mass,
  }));
}

/** Exact card-count posterior conditional on public card transfers and reveals.
 * Players' choice of action is not treated as evidence of strategic preference.
 */
export function publicHandDistribution(
  state: State,
  events: Event[] | undefined,
  observer = state.current,
  takePreference = 0,
): HandWorld[] {
  if (!events) return [];
  const key = `${observer}:${takePreference}`;
  const entries = cache.get(events) ?? new Map<string, BeliefCache>();
  const previous = entries.get(key);
  const reusable =
    previous?.seed === state.seed &&
    previous.events.length <= events.length &&
    previous.events.every((event, index) => event === events[index]);
  let replay = reusable ? previous.replay : newGame(state.seed);
  let worlds = reusable ? previous.worlds : initialWorlds(replay, observer);
  const start = reusable ? previous.events.length : 0;
  for (let eventIndex = start; eventIndex < events.length; eventIndex++) {
    const event = events[eventIndex];
    if (event.type === "next") {
      replay = nextRound(replay);
      worlds = initialWorlds(replay, observer);
      continue;
    }
    const after = applyAction(replay, event);
    const opponentTurn = replay.current !== observer;
    const taken =
      event.type === "take"
        ? [replay.market[event.index]]
        : event.type === "exchange"
          ? event.market.map((i) => replay.market[i])
          : [];
    const kept =
      event.type === "exchange"
        ? replay.market.filter((_, i) => !event.market.includes(i))
        : event.type === "take"
          ? replay.market.filter((_, i) => i !== event.index)
          : event.type === "camels"
            ? replay.market.filter((card) => card !== "camel")
            : replay.market;
    const paid =
      event.type === "exchange"
        ? after.market.slice(kept.length, kept.length + event.hand.length)
        : [];
    const revealed =
      event.type === "take" || event.type === "camels"
        ? after.market.slice(kept.length)
        : [];
    const own = count([
      ...replay.players[observer].hand,
      ...Array<Card>(replay.players[observer].camels).fill("camel"),
    ]);
    const market = count(replay.market);
    const discarded = count(replay.discard);
    const next: HandWorld[] = [];
    for (const world of worlds) {
      const hand = [...world.hand];
      let probability = world.probability;
      if (opponentTurn) {
        if (event.type === "take" && takePreference) {
          const selected = cards.indexOf(replay.market[event.index]);
          const denominator = replay.market.reduce(
            (sum, card) =>
              card === "camel"
                ? sum
                : sum +
                  Math.exp(takePreference * world.hand[cards.indexOf(card)]),
            0,
          );
          probability *=
            Math.exp(takePreference * world.hand[selected]) / denominator;
        }
        if (event.type === "sell") {
          const good = cards.indexOf(event.good);
          if (hand[good] < event.count) continue;
          hand[good] -= event.count;
        } else if (event.type === "exchange") {
          for (const card of paid) hand[cards.indexOf(card)]--;
          hand[6] -= event.camels;
          if (hand.some((n) => n < 0)) continue;
          for (const card of taken) hand[cards.indexOf(card)]++;
        } else if (event.type === "take") hand[cards.indexOf(taken[0])]++;
        else if (event.type === "camels") hand[6] += market[6];
      }
      const deck = totals.map(
        (total, i) => total - own[i] - market[i] - discarded[i] - world.hand[i],
      );
      let remaining = deck.reduce((a, b) => a + b, 0);
      for (const card of revealed) {
        const index = cards.indexOf(card);
        if (deck[index] <= 0 || remaining <= 0) {
          probability = 0;
          break;
        }
        probability *= deck[index]-- / remaining--;
      }
      if (probability > 0) next.push({ hand, probability });
    }
    const mass = next.reduce((value, world) => value + world.probability, 0);
    if (!mass) return [];
    worlds = next.map((world) => ({
      ...world,
      probability: world.probability / mass,
    }));
    replay = after;
  }
  entries.set(key, {
    seed: state.seed,
    events: events.slice(),
    replay,
    worlds,
  });
  cache.set(events, entries);
  const possible = worlds.filter(
    (world) =>
      world.hand.slice(0, 6).reduce((a, b) => a + b, 0) ===
      state.players[1 - observer].hand.length,
  );
  const mass = possible.reduce((total, world) => total + world.probability, 0);
  return possible.map((world) => ({
    ...world,
    probability: world.probability / mass,
  }));
}

export function nextSaleCloseProbability(
  worlds: HandWorld[],
  state: State,
): number {
  if (!worlds.length) return 0;
  const empty = GOODS.filter((good) => state.tokens[good].length === 0).length;
  if (empty < 2) return 0;
  return worlds.reduce(
    (probability, world) =>
      probability +
      (GOODS.some((good, i) => {
        const needed = state.tokens[good].length;
        return needed > 0 && world.hand[i] >= Math.max(needed, i < 3 ? 2 : 1);
      })
        ? world.probability
        : 0),
    0,
  );
}

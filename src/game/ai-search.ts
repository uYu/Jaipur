import type { Observation } from "./ai.ts";
import { BONUS_VALUES, COUNTS, shuffle, sum } from "./data.ts";
import { GOODS } from "./types.ts";
import type { Action, Card, Good } from "./types.ts";

const CAMEL = GOODS.length;
const GOOD_COUNT = GOODS.length;
const ENSEMBLE_SIZE = 8;
const ITERATIONS_PER_TREE = 2000;

type FastPlayer = {
  hand: number[];
  camels: number;
  goods: number;
  bonuses: number;
  goodsCount: number;
  bonusCount: number;
};

type FastState = {
  current: 0 | 1;
  players: [FastPlayer, FastPlayer];
  market: number[];
  deck: number[];
  deckCount: number;
  tokens: number[][];
  bonus: [number[], number[], number[]];
  discarded: number[];
  terminal: boolean;
  value: number;
};

type SemanticAction =
  | { kind: "take"; good: number }
  | { kind: "camels" }
  | { kind: "sell"; good: number; count: number }
  | {
      kind: "exchange";
      take: number[];
      give: number[];
      camels: number;
    };

type Draft = {
  phase: "take" | "pay";
  take: number[];
  give: number[];
  takeTotal: number;
  payTotal: number;
  camels: number;
};

type Position = { game: FastState; draft: Draft | null };

type SearchStep =
  | { kind: "play"; action: Exclude<SemanticAction, { kind: "exchange" }> }
  | { kind: "startExchange" }
  | { kind: "takeExchange"; good: number }
  | { kind: "finishTake" }
  | { kind: "giveExchange"; good: number }
  | { kind: "giveCamel" }
  | { kind: "commitExchange" };

type Edge = {
  step: SearchStep;
  prior: number;
  visits: number;
  total: number;
  child: SearchNode;
};

type SearchNode = { visits: number; children: Map<string, Edge> };
type ActionStat = { action: SemanticAction; visits: number; total: number };

const goodIndex = (good: Good) => GOODS.indexOf(good);
const cardIndex = (card: Card) => (card === "camel" ? CAMEL : goodIndex(card));
const counts = () => Array<number>(GOOD_COUNT).fill(0);

function hashObservation(observation: Observation): number {
  const text = JSON.stringify(observation);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0 || 1;
}

function removeOne<T>(values: T[], value: T) {
  const index = values.indexOf(value);
  if (index >= 0) values.splice(index, 1);
}

function determinize(
  observation: Observation,
  seed: number,
): [FastState, number] {
  const knownOpponent = observation.knownOpponentHand.map(goodIndex);
  const unknownGoods = GOODS.flatMap((good, index) => {
    const known =
      observation.hand.filter((card) => card === good).length +
      observation.market.filter((card) => card === good).length +
      observation.discard.filter((card) => card === good).length +
      knownOpponent.filter((card) => card === index).length;
    return Array<number>(Math.max(0, COUNTS[good] - known)).fill(index);
  });
  let shuffledGoods: number[];
  [shuffledGoods, seed] = shuffle(unknownGoods, seed);
  const unknownOpponentCount = Math.max(
    0,
    observation.opponentHandCount - knownOpponent.length,
  );
  const opponentHand = [
    ...knownOpponent,
    ...shuffledGoods.slice(0, unknownOpponentCount),
  ];
  const deckGoods = shuffledGoods.slice(unknownOpponentCount);
  const unknownCamels =
    COUNTS.camel -
    observation.camels -
    observation.market.filter((card) => card === "camel").length;
  const totalUnknownCards =
    unknownGoods.length + knownOpponent.length + unknownCamels;
  const opponentCamels = Math.max(
    0,
    totalUnknownCards - observation.opponentHandCount - observation.deckCount,
  );
  let deck: number[];
  [deck, seed] = shuffle(
    [
      ...deckGoods,
      ...Array<number>(Math.max(0, unknownCamels - opponentCamels)).fill(CAMEL),
    ],
    seed,
  );

  const ownBonusByTier: [number[], number[], number[]] = [[], [], []];
  for (const value of observation.bonuses)
    ownBonusByTier[value <= 3 ? 0 : value <= 6 ? 1 : 2].push(value);
  const bonus = [[], [], []] as [number[], number[], number[]];
  let opponentBonusSum = 0,
    opponentBonusCount = 0;
  for (let index = 0; index < 3; index++) {
    const tier = (index + 3) as 3 | 4 | 5;
    const candidates = [...BONUS_VALUES[tier]];
    ownBonusByTier[index].forEach((value) => removeOne(candidates, value));
    let shuffled: number[];
    [shuffled, seed] = shuffle(candidates, seed);
    const takenByOpponent = Math.max(
      0,
      BONUS_VALUES[tier].length -
        observation.bonusCounts[tier] -
        ownBonusByTier[index].length,
    );
    const opponentValues = shuffled.slice(0, takenByOpponent);
    opponentBonusSum += sum(opponentValues);
    opponentBonusCount += opponentValues.length;
    bonus[index] = shuffled.slice(takenByOpponent);
  }

  const discarded = counts();
  observation.discard.forEach((good) => discarded[goodIndex(good)]++);
  return [
    {
      current: 0,
      players: [
        {
          hand: observation.hand.map(goodIndex),
          camels: observation.camels,
          goods: sum(observation.goods),
          bonuses: sum(observation.bonuses),
          goodsCount: observation.goods.length,
          bonusCount: observation.bonuses.length,
        },
        {
          hand: opponentHand,
          camels: opponentCamels,
          goods: sum(observation.opponentGoods),
          bonuses: opponentBonusSum,
          goodsCount: observation.opponentGoods.length,
          bonusCount: opponentBonusCount,
        },
      ],
      market: observation.market.map(cardIndex),
      deck,
      deckCount: deck.length,
      tokens: GOODS.map((good) => [...observation.tokens[good]]),
      bonus,
      discarded,
      terminal: false,
      value: 0,
    },
    seed,
  ];
}

function cloneState(state: FastState): FastState {
  return {
    current: state.current,
    players: [
      { ...state.players[0], hand: [...state.players[0].hand] },
      { ...state.players[1], hand: [...state.players[1].hand] },
    ],
    market: [...state.market],
    deck: state.deck,
    deckCount: state.deckCount,
    tokens: state.tokens.map((tokens) => [...tokens]),
    bonus: state.bonus.map((tokens) => [...tokens]) as FastState["bonus"],
    discarded: [...state.discarded],
    terminal: state.terminal,
    value: state.value,
  };
}

function cardCounts(cards: number[]): number[] {
  const result = counts();
  cards.forEach((card) => {
    if (card < GOOD_COUNT) result[card]++;
  });
  return result;
}

function refill(state: FastState) {
  while (state.market.length < 5 && state.deckCount)
    state.market.push(state.deck[--state.deckCount]);
}

function finish(state: FastState) {
  const [a, b] = state.players;
  const camel = a.camels === b.camels ? -1 : a.camels > b.camels ? 0 : 1;
  const scores = [
    a.goods + a.bonuses + (camel === 0 ? 5 : 0),
    b.goods + b.bonuses + (camel === 1 ? 5 : 0),
  ];
  const differences = [
    scores[0] - scores[1],
    a.bonusCount - b.bonusCount,
    a.goodsCount - b.goodsCount,
  ];
  const difference = differences.find((value) => value !== 0) ?? 0;
  const outcome = difference === 0 ? 0 : difference > 0 ? 1 : -1;
  state.value = outcome + Math.tanh((scores[0] - scores[1]) / 18) * 0.15;
  state.terminal = true;
}

function removeCards(hand: number[], good: number, amount: number) {
  for (let count = 0; count < amount; count++)
    hand.splice(hand.indexOf(good), 1);
}

function applyAction(state: FastState, action: SemanticAction) {
  const player = state.players[state.current];
  if (action.kind === "take") {
    state.market.splice(state.market.indexOf(action.good), 1);
    player.hand.push(action.good);
    refill(state);
  } else if (action.kind === "camels") {
    const camelCount = state.market.filter((card) => card === CAMEL).length;
    player.camels += camelCount;
    state.market = state.market.filter((card) => card !== CAMEL);
    refill(state);
  } else if (action.kind === "sell") {
    removeCards(player.hand, action.good, action.count);
    state.discarded[action.good] += action.count;
    const tokens = state.tokens[action.good].splice(0, action.count);
    player.goods += sum(tokens);
    player.goodsCount += tokens.length;
    if (action.count >= 3) {
      const tier = Math.min(5, action.count) - 3;
      const bonus = state.bonus[tier].pop();
      if (bonus !== undefined) {
        player.bonuses += bonus;
        player.bonusCount++;
      }
    }
  } else {
    for (let good = 0; good < GOOD_COUNT; good++) {
      removeCards(player.hand, good, action.give[good]);
      for (let count = 0; count < action.take[good]; count++) {
        state.market.splice(state.market.indexOf(good), 1);
        player.hand.push(good);
      }
      for (let count = 0; count < action.give[good]; count++)
        state.market.push(good);
    }
    player.camels -= action.camels;
    for (let count = 0; count < action.camels; count++)
      state.market.push(CAMEL);
  }

  if (state.tokens.filter((tokens) => !tokens.length).length >= 3)
    finish(state);
  else if (state.market.length < 5) finish(state);
  else state.current = state.current === 0 ? 1 : 0;
}

function exchangeCapacity(state: FastState, take: number[]) {
  const player = state.players[state.current];
  const hand = cardCounts(player.hand);
  let capacity = Math.min(player.camels, 7 - player.hand.length);
  for (let good = 0; good < GOOD_COUNT; good++)
    if (!take[good]) capacity += hand[good];
  return capacity;
}

function availableSteps(position: Position): SearchStep[] {
  const state = position.game;
  if (state.terminal) return [];
  const player = state.players[state.current];
  if (!position.draft) {
    const steps: SearchStep[] = [];
    const market = cardCounts(state.market);
    if (player.hand.length < 7)
      for (let good = 0; good < GOOD_COUNT; good++)
        if (market[good])
          steps.push({ kind: "play", action: { kind: "take", good } });
    if (state.market.includes(CAMEL))
      steps.push({ kind: "play", action: { kind: "camels" } });
    const hand = cardCounts(player.hand);
    for (let good = 0; good < GOOD_COUNT; good++)
      for (let count = good < 3 ? 2 : 1; count <= hand[good]; count++)
        steps.push({ kind: "play", action: { kind: "sell", good, count } });
    const marketGoods = state.market.filter((card) => card !== CAMEL).length;
    if (marketGoods >= 2 && exchangeCapacity(state, counts()) >= 2)
      steps.push({ kind: "startExchange" });
    return steps;
  }

  const draft = position.draft;
  if (draft.phase === "take") {
    const steps: SearchStep[] = [];
    const market = cardCounts(state.market);
    if (
      draft.takeTotal >= 2 &&
      exchangeCapacity(state, draft.take) >= draft.takeTotal
    )
      steps.push({ kind: "finishTake" });
    for (let good = 0; good < GOOD_COUNT; good++)
      if (draft.take[good] < market[good])
        steps.push({ kind: "takeExchange", good });
    return steps;
  }

  if (draft.payTotal === draft.takeTotal) return [{ kind: "commitExchange" }];
  const steps: SearchStep[] = [];
  const hand = cardCounts(player.hand);
  for (let good = 0; good < GOOD_COUNT; good++)
    if (!draft.take[good] && draft.give[good] < hand[good])
      steps.push({ kind: "giveExchange", good });
  if (draft.camels < player.camels && player.hand.length + draft.camels < 7)
    steps.push({ kind: "giveCamel" });
  return steps;
}

function semanticKey(action: SemanticAction): string {
  if (action.kind === "take") return `t:${action.good}`;
  if (action.kind === "camels") return "c";
  if (action.kind === "sell") return `s:${action.good}:${action.count}`;
  return `x:${action.take.join("")}|${action.give.join("")}|${action.camels}`;
}

function stepKey(step: SearchStep): string {
  if (step.kind === "play") return semanticKey(step.action);
  if (step.kind === "takeExchange") return `xt:${step.good}`;
  if (step.kind === "giveExchange") return `xg:${step.good}`;
  return step.kind;
}

function acquireValue(state: FastState, good: number, player: number) {
  const count = state.players[player].hand.filter(
    (card) => card === good,
  ).length;
  return (
    (state.tokens[good][0] ?? 0) * 0.45 +
    count * 1.15 +
    (good < 3 ? 0.6 : 0) +
    (count === 2 || count === 4 ? 1.2 : 0)
  );
}

function herdValue(camels: number) {
  return (
    Math.min(camels, 4) * 1.25 + Math.min(Math.max(camels - 4, 0), 3) * 0.3
  );
}

function potentialForHand(state: FastState, handCards: number[]) {
  const hand = cardCounts(handCards);
  let value = 0;
  for (let good = 0; good < GOOD_COUNT; good++) {
    const count = hand[good];
    if (!count) continue;
    const tier = Math.min(5, count) - 3;
    const bonus = count >= 3 ? (state.bonus[tier].at(-1) ?? 0) : 0;
    const remaining = COUNTS[GOODS[good]] - state.discarded[good] - count;
    const singleton = good < 3 && count === 1;
    value +=
      (sum(state.tokens[good].slice(0, count)) + bonus) *
      0.72 *
      (singleton ? (remaining ? 0.6 : 0) : 1);
    if (count === 2 && good >= 3 && remaining) value += 0.8;
    if (count === 4 && remaining) value += 0.8;
  }
  return value - Math.max(0, handCards.length - 5) * 0.35;
}

function exchangeStartPrior(state: FastState) {
  const player = state.players[state.current];
  const marketGoods = state.market.filter((card) => card !== CAMEL);
  const takeValues = marketGoods
    .map((good) => acquireValue(state, good, state.current))
    .sort((a, b) => b - a);
  const hand = cardCounts(player.hand);
  const paymentValues: number[] = [];
  const camelCapacity = Math.min(player.camels, 7 - player.hand.length);
  for (let index = 0; index < camelCapacity; index++)
    paymentValues.push(
      herdValue(player.camels - index) - herdValue(player.camels - index - 1),
    );
  for (let good = 0; good < GOOD_COUNT; good++)
    for (let index = 0; index < hand[good]; index++)
      paymentValues.push(acquireValue(state, good, state.current) * 0.55);
  paymentValues.sort((a, b) => a - b);

  let best = Number.NEGATIVE_INFINITY;
  const limit = Math.min(takeValues.length, paymentValues.length);
  for (let amount = 2; amount <= limit; amount++)
    best = Math.max(
      best,
      sum(takeValues.slice(0, amount)) - sum(paymentValues.slice(0, amount)),
    );
  return Number.isFinite(best) ? best : -10;
}

function stepPrior(position: Position, step: SearchStep): number {
  const state = position.game,
    player = state.players[state.current];
  if (step.kind === "play") {
    const action = step.action;
    const before = potentialForHand(state, player.hand);
    if (action.kind === "take")
      return (
        potentialForHand(state, [...player.hand, action.good]) -
        before +
        (action.good < 3 ? 0.45 : 0)
      );
    if (action.kind === "camels") {
      const amount = state.market.filter((card) => card === CAMEL).length;
      const risk =
        amount *
        (state.players[1 - state.current].hand.length < 6 ? 0.6 : 0.15);
      return (
        herdValue(player.camels + amount) - herdValue(player.camels) - risk
      );
    }
    const hand = [...player.hand];
    removeCards(hand, action.good, action.count);
    const immediate = sum(state.tokens[action.good].slice(0, action.count));
    const tier = Math.min(5, action.count) - 3;
    const bonus = action.count >= 3 ? (state.bonus[tier].at(-1) ?? 0) : 0;
    return immediate + bonus + potentialForHand(state, hand) - before;
  }
  if (step.kind === "startExchange") return exchangeStartPrior(state);
  if (step.kind === "takeExchange")
    return acquireValue(state, step.good, state.current);
  if (step.kind === "finishTake") return 1;
  if (step.kind === "giveCamel") return -0.8 - player.camels * 0.08;
  if (step.kind === "giveExchange")
    return -acquireValue(state, step.good, state.current) * 0.55;
  return 4;
}

function applyStep(
  position: Position,
  step: SearchStep,
): SemanticAction | null {
  if (step.kind === "play") {
    applyAction(position.game, step.action);
    return step.action;
  }
  if (step.kind === "startExchange") {
    position.draft = {
      phase: "take",
      take: counts(),
      give: counts(),
      takeTotal: 0,
      payTotal: 0,
      camels: 0,
    };
  } else if (step.kind === "takeExchange") {
    position.draft!.take[step.good]++;
    position.draft!.takeTotal++;
  } else if (step.kind === "finishTake") {
    position.draft!.phase = "pay";
  } else if (step.kind === "giveExchange") {
    position.draft!.give[step.good]++;
    position.draft!.payTotal++;
  } else if (step.kind === "giveCamel") {
    position.draft!.camels++;
    position.draft!.payTotal++;
  } else {
    const draft = position.draft!;
    const action: SemanticAction = {
      kind: "exchange",
      take: [...draft.take],
      give: [...draft.give],
      camels: draft.camels,
    };
    position.draft = null;
    applyAction(position.game, action);
    return action;
  }
  return null;
}

function completeDraft(position: Position): SemanticAction | null {
  for (let safety = 0; position.draft && safety < 20; safety++) {
    const steps = availableSteps(position);
    if (!steps.length) return null;
    const draft = position.draft;
    let step: SearchStep;
    if (draft.phase === "take") {
      const finish = steps.find((candidate) => candidate.kind === "finishTake");
      if (finish && draft.takeTotal >= 2) step = finish;
      else
        step = steps
          .filter((candidate) => candidate.kind === "takeExchange")
          .sort((a, b) => stepPrior(position, b) - stepPrior(position, a))[0];
    } else if (draft.payTotal === draft.takeTotal) {
      step = { kind: "commitExchange" };
    } else {
      step = steps.sort(
        (a, b) => stepPrior(position, b) - stepPrior(position, a),
      )[0];
    }
    const completed = applyStep(position, step);
    if (completed) return completed;
  }
  return null;
}

function handPotential(state: FastState, player: number) {
  return potentialForHand(state, state.players[player].hand);
}

function evaluate(state: FastState) {
  if (state.terminal) return state.value;
  const progress = 1 - state.deckCount / 40;
  const emptyPiles = state.tokens.filter((tokens) => !tokens.length).length;
  const camel =
    state.players[0].camels === state.players[1].camels
      ? 0
      : state.players[0].camels > state.players[1].camels
        ? 2 + progress * 3
        : -2 - progress * 3;
  const banked = (player: number) =>
    state.players[player].goods + state.players[player].bonuses;
  const futureWeight = 0.9 - progress * 0.25 - emptyPiles * 0.08;
  const score = (player: number) =>
    banked(player) + handPotential(state, player) * futureWeight;
  const bankedLead = banked(0) - banked(1);
  const player = state.players[state.current];
  const hand = cardCounts(player.hand);
  const canEmptyPile = state.tokens.some(
    (tokens, good) =>
      tokens.length > 0 &&
      hand[good] >= tokens.length &&
      hand[good] >= (good < 3 ? 2 : 1),
  );
  const canDrainDeck =
    state.deckCount === 0 ||
    state.market.filter((card) => card === CAMEL).length > state.deckCount;
  const canEnd = (emptyPiles >= 2 && canEmptyPile) || canDrainDeck;
  const currentPlayerIsAhead =
    state.current === 0 ? bankedLead > 0 : bankedLead < 0;
  const endControl =
    canEnd && currentPlayerIsAhead ? Math.sign(bankedLead) * 2.4 : 0;
  const tieBreak =
    (state.players[0].bonusCount - state.players[1].bonusCount) * 0.12 +
    (state.players[0].goodsCount - state.players[1].goodsCount) * 0.04;
  return Math.tanh((score(0) - score(1) + camel + tieBreak + endControl) / 20);
}

function newNode(): SearchNode {
  return { visits: 0, children: new Map() };
}

function searchTree(rootState: FastState) {
  const root = newNode();
  const rootActions = new Map<string, ActionStat>();

  for (let iteration = 0; iteration < ITERATIONS_PER_TREE; iteration++) {
    const position: Position = { game: cloneState(rootState), draft: null };
    let node = root;
    const nodes = [root];
    const edges: Edge[] = [];
    let firstAction: SemanticAction | null = null;

    for (let depth = 0; depth < 28 && !position.game.terminal; depth++) {
      const ranked = availableSteps(position)
        .map((step) => ({ step, prior: stepPrior(position, step) }))
        .sort((a, b) => b.prior - a.prior);
      if (!ranked.length) break;
      const width = Math.min(
        ranked.length,
        4 + Math.floor(Math.sqrt(node.visits + 1)),
      );
      const candidates = ranked.slice(0, width);
      const untried = candidates.find(
        ({ step }) => !node.children.has(stepKey(step)),
      );
      let edge: Edge;
      if (untried) {
        edge = {
          step: untried.step,
          prior: untried.prior,
          visits: 0,
          total: 0,
          child: newNode(),
        };
        node.children.set(stepKey(untried.step), edge);
      } else {
        const maximizing = position.game.current === 0;
        edge = candidates
          .map(({ step }) => node.children.get(stepKey(step))!)
          .sort((a, b) => {
            const value = (candidate: Edge) => {
              const mean = candidate.total / Math.max(1, candidate.visits);
              return (
                (maximizing ? mean : -mean) +
                0.85 *
                  Math.sqrt(
                    Math.log(node.visits + 2) / Math.max(1, candidate.visits),
                  ) +
                candidate.prior * 0.025
              );
            };
            return value(b) - value(a);
          })[0];
      }

      const completed = applyStep(position, edge.step);
      if (!firstAction && completed) firstAction = completed;
      edges.push(edge);
      node = edge.child;
      nodes.push(node);
      if (untried) break;
    }

    if (position.draft) {
      const completed = completeDraft(position);
      if (!firstAction && completed) firstAction = completed;
    }
    if (!firstAction && !position.game.terminal) {
      const step = availableSteps(position)
        .map((candidate) => ({
          candidate,
          prior: stepPrior(position, candidate),
        }))
        .sort((a, b) => b.prior - a.prior)[0]?.candidate;
      if (step) firstAction = applyStep(position, step);
      if (!firstAction && position.draft) firstAction = completeDraft(position);
    }

    const value = evaluate(position.game);
    nodes.forEach((visited) => visited.visits++);
    edges.forEach((visited) => {
      visited.visits++;
      visited.total += value;
    });
    if (firstAction) {
      const key = semanticKey(firstAction);
      const stat = rootActions.get(key) ?? {
        action: firstAction,
        visits: 0,
        total: 0,
      };
      stat.visits++;
      stat.total += value;
      rootActions.set(key, stat);
    }
  }
  return { root, rootActions };
}

function convertAction(
  action: SemanticAction,
  observation: Observation,
): Action {
  if (action.kind === "take") {
    const good = GOODS[action.good];
    return { type: "take", index: observation.market.indexOf(good) };
  }
  if (action.kind === "camels") return { type: "camels" };
  if (action.kind === "sell")
    return { type: "sell", good: GOODS[action.good], count: action.count };
  const market: number[] = [],
    hand: number[] = [];
  const marketLeft = [...action.take],
    handLeft = [...action.give];
  observation.market.forEach((card, index) => {
    if (card === "camel") return;
    const good = goodIndex(card);
    if (marketLeft[good] > 0) {
      market.push(index);
      marketLeft[good]--;
    }
  });
  observation.hand.forEach((card, index) => {
    const good = goodIndex(card);
    if (handLeft[good] > 0) {
      hand.push(index);
      handLeft[good]--;
    }
  });
  return { type: "exchange", market, hand, camels: action.camels };
}

export function chooseEnsembleAction(observation: Observation): Action {
  let seed = hashObservation(observation);
  const familyScores = new Map<string, number>();
  const exchangeScores = new Map<string, ActionStat>();
  const directActions = new Map<string, SemanticAction>();

  for (let tree = 0; tree < ENSEMBLE_SIZE; tree++) {
    let rootState: FastState;
    [rootState, seed] = determinize(observation, seed);
    const result = searchTree(rootState);
    for (const [key, edge] of result.root.children) {
      const family = key === "startExchange" ? "exchange" : key;
      familyScores.set(
        family,
        (familyScores.get(family) ?? 0) + edge.visits / ITERATIONS_PER_TREE,
      );
      if (edge.step.kind === "play") directActions.set(key, edge.step.action);
    }
    const exchangeVisits = [...result.rootActions.values()]
      .filter((stat) => stat.action.kind === "exchange")
      .reduce((total, stat) => total + stat.visits, 0);
    for (const [key, stat] of result.rootActions) {
      if (stat.action.kind !== "exchange" || !exchangeVisits) continue;
      const aggregate = exchangeScores.get(key) ?? {
        action: stat.action,
        visits: 0,
        total: 0,
      };
      aggregate.visits += stat.visits / exchangeVisits;
      aggregate.total += stat.total / exchangeVisits;
      exchangeScores.set(key, aggregate);
    }
  }

  const family = [...familyScores].sort((a, b) => b[1] - a[1])[0]?.[0];
  let selected: SemanticAction | undefined;
  if (family === "exchange")
    selected = [...exchangeScores.values()].sort(
      (a, b) =>
        b.visits - a.visits ||
        b.total / Math.max(1, b.visits) - a.total / Math.max(1, a.visits),
    )[0]?.action;
  else if (family) selected = directActions.get(family);

  if (!selected) {
    const good = observation.market.find(
      (card): card is Good => card !== "camel",
    );
    if (good && observation.hand.length < 7)
      selected = { kind: "take", good: goodIndex(good) };
    else selected = { kind: "camels" };
  }
  return convertAction(selected, observation);
}

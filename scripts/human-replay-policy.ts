import { readFileSync } from "node:fs";
import { dmcActions } from "../src/game/dmc.ts";
import { GOODS } from "../src/game/types.ts";
import type { Action, Card } from "../src/game/types.ts";
import type { Observation } from "../src/game/ai.ts";

type Weights = {
  format: string;
  w1: number[][];
  b1: number[];
  w2: number[];
  b2: number;
  encoder1: Layer;
  encoder2: Layer;
  policy1: Layer;
  policy2: Layer;
};
type Layer = { weight: number[][]; bias: number[] };

function dense(layer: Layer, input: number[], relu: boolean): number[] {
  return layer.weight.map((weights, i) => {
    let sum = layer.bias[i];
    for (let j = 0; j < input.length; j++) sum += weights[j] * input[j];
    return relu ? Math.max(0, sum) : sum;
  });
}

function counts(cards: readonly Card[]): number[] {
  const result = Array<number>(7).fill(0);
  for (const card of cards)
    result[card === "camel" ? 6 : GOODS.indexOf(card)]++;
  return result;
}

function delta(observation: Observation, action: Action): number[] {
  const result = Array<number>(7).fill(0);
  if (action.type === "take")
    result[GOODS.indexOf(observation.market[action.index] as typeof GOODS[number])]++;
  if (action.type === "camels")
    result[6] = observation.market.filter((card) => card === "camel").length;
  if (action.type === "sell") result[GOODS.indexOf(action.good)] -= action.count;
  if (action.type === "exchange") {
    for (const index of action.market)
      result[GOODS.indexOf(observation.market[index] as typeof GOODS[number])]++;
    for (const index of action.hand)
      result[GOODS.indexOf(observation.hand[index])]--;
    result[6] -= action.camels;
  }
  return result;
}

/** Tracks only publicly revealed cards; dealt opponent cards remain unknown. */
export class HumanReplayMemory {
  private round = -1;
  private known = [Array<number>(7).fill(0), Array<number>(7).fill(0)];
  private revealed = Array<number>(7).fill(0);
  private discard = Array<number>(6).fill(0);
  private publicBonusCounts = [0, 0];
  private seals = [0, 0];
  private moves: { actor: number; kind: string; delta: number[]; drawn: number }[] = [];

  ensure(round: number, market: readonly Card[], seals?: readonly number[]) {
    if (this.round === round) {
      if (seals) this.seals = [...seals];
      return;
    }
    this.round = round;
    this.known = [Array<number>(7).fill(0), Array<number>(7).fill(0)];
    this.revealed = counts(market);
    this.discard = Array<number>(6).fill(0);
    this.publicBonusCounts = [0, 0];
    this.moves = [];
    this.seals = seals ? [...seals] : [0, 0];
  }

  features(actor: number): number[] {
    return [
      ...this.known[1 - actor].map((n) => n / 7),
      ...this.revealed.map((n) => n / 12),
      ...this.discard.map((n) => n / 12),
    ];
  }

  v2Features(actor: number, opponentGoods: readonly number[]): number[] {
    const recent = Array<number>((8 - this.moves.length) * 12).fill(0);
    for (const move of this.moves) {
      recent.push(Number(move.actor === actor), Number(move.kind === "take"),
        Number(move.kind === "sell"), Number(move.kind === "trade"),
        ...move.delta.map((n) => n / 7), move.drawn / 5);
    }
    return [...this.features(actor), opponentGoods.reduce((a, b) => a + b, 0) / 100,
      this.publicBonusCounts[1 - actor] / 7, this.seals[actor] / 2,
      this.seals[1 - actor] / 2, ...recent];
  }

  update(round: number, actor: number, observation: Observation,
         action: Action, afterMarket?: readonly Card[]) {
    this.ensure(round, observation.market);
    const change = delta(observation, action);
    for (let i = 0; i < 7; i++)
      this.known[actor][i] = change[i] < 0
        ? Math.max(0, this.known[actor][i] + change[i])
        : this.known[actor][i] + change[i];
    if (action.type === "sell")
      this.discard[GOODS.indexOf(action.good)] += action.count;
    if (action.type === "sell" && action.count >= 3 &&
        observation.bonusCounts[Math.min(5, action.count) as 3 | 4 | 5])
      this.publicBonusCounts[actor]++;
    let drawnTotal = 0;
    if (!afterMarket) {
      this.pushMove(actor, action, change, drawnTotal);
      return;
    }
    const expected = counts(observation.market);
    const actual = counts(afterMarket);
    for (let i = 0; i < 7; i++) {
      expected[i] -= Math.max(0, change[i]);
      if (action.type === "exchange") expected[i] += -Math.min(0, change[i]);
      const drawn = actual[i] - expected[i];
      if (drawn < 0 || (action.type !== "take" && action.type !== "camels" && drawn))
        throw Error("Public market history cannot be reconstructed");
      this.revealed[i] += drawn;
      drawnTotal += drawn;
    }
    this.pushMove(actor, action, change, drawnTotal);
  }

  private pushMove(actor: number, action: Action, change: number[], drawn: number) {
    const kind = action.type === "exchange" ? "trade" :
      action.type === "camels" ? "take" : action.type;
    this.moves.push({ actor, kind, delta: change, drawn });
    this.moves = this.moves.slice(-8);
  }
}

export class HumanReplayPolicy {
  private weights: Weights;

  constructor(modelPath: string) {
    this.weights = JSON.parse(readFileSync(modelPath, "utf8")) as Weights;
    const w = this.weights;
    if (w.format === "jaipur-human-policy-v1" &&
        (w.w1.length !== 64 || w.w1.some((row) => row.length !== 66) ||
         w.b1.length !== 64 || w.w2.length !== 64))
      throw Error("Unexpected human-replay model format");
    if (w.format === "jaipur-human-policy-v2" &&
        (w.encoder1.weight.length !== 128 || w.encoder1.weight[0].length !== 154 ||
         w.encoder2.weight.length !== 64 || w.policy1.weight.length !== 64 ||
         w.policy2.weight.length !== 1))
      throw Error("Unexpected human-replay model format");
    if (!["jaipur-human-policy-v1", "jaipur-human-policy-v2"].includes(w.format))
      throw Error("Unexpected human-replay model format");
  }

  choose(observation: Observation, actor: number, round: number,
         memory: HumanReplayMemory, seals?: readonly number[]): Action {
    memory.ensure(round, observation.market, seals);
    const hand = GOODS.map((good) => observation.hand.filter((card) => card === good).length);
    const market = counts(observation.market);
    const stacks = GOODS.map((good) => observation.tokens[good]);
    const state = [
      ...hand.map((n) => n / 7), observation.camels / 7,
      ...market.map((n) => n / 5),
      ...stacks.map((stack) => stack.length / 9),
      ...stacks.map((stack) => (stack[0] ?? 0) / 7),
      ...([3, 4, 5] as const).map((tier) => observation.bonusCounts[tier] / 10),
      observation.deckCount / 40,
      (observation.goods.reduce((a, b) => a + b, 0) +
       observation.bonuses.reduce((a, b) => a + b, 0)) / 100,
      observation.opponentHandCount / 7, (round - 1) / 5, actor,
      ...(this.weights.format === "jaipur-human-policy-v2"
        ? memory.v2Features(actor, observation.opponentGoods)
        : memory.features(actor)),
    ];
    if (state.length !== (this.weights.format === "jaipur-human-policy-v2" ? 154 : 54))
      throw Error("Unexpected human-replay state length");
    const context = this.weights.format === "jaipur-human-policy-v2"
      ? dense(this.weights.encoder2, dense(this.weights.encoder1, state, true), true)
      : undefined;
    const actions = dmcActions(observation);
    let best = actions[0], bestScore = -Infinity;
    for (const action of actions) {
      const change = delta(observation, action);
      const kind = action.type === "exchange" ? "trade" :
        action.type === "camels" ? "take" : action.type;
      const actionFeatures = [
        Number(kind === "take"), Number(kind === "sell"),
        Number(kind === "trade"), ...change.map((n) => n / 7),
        change.reduce((sum, n) => sum + Math.max(0, n), 0) / 7,
        change.reduce((sum, n) => sum + Math.max(0, -n), 0) / 7,
      ];
      let value: number;
      if (context) {
        value = dense(this.weights.policy2,
          dense(this.weights.policy1, [...context, ...actionFeatures], true), false)[0];
      } else {
        const features = [...state, ...actionFeatures];
        value = this.weights.b2;
        for (let i = 0; i < 64; i++) {
          let hidden = this.weights.b1[i];
          for (let j = 0; j < 66; j++) hidden += this.weights.w1[i][j] * features[j];
          value += this.weights.w2[i] * Math.max(0, hidden);
        }
      }
      if (value > bestScore) { best = action; bestScore = value; }
    }
    if (!best) throw Error("No legal actions");
    return best;
  }
}

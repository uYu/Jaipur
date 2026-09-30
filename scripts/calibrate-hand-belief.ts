import {
  applyAction,
  legalActions,
  newGame,
  nextRound,
} from "../src/game/engine.ts";
import { observe } from "../src/game/ai.ts";
import { GOODS } from "../src/game/types.ts";
import { COUNTS } from "../src/game/data.ts";
import type { Event, State } from "../src/game/types.ts";
import { readFileSync } from "node:fs";
import {
  nextSaleCloseProbability,
  publicHandDistribution,
} from "../src/game/hand-belief.ts";

const logPath = process.argv[2]?.endsWith(".jsonl")
  ? process.argv[2]
  : undefined;
const games = logPath ? 0 : Number(process.argv[2] ?? 200);
const start = Number(process.argv[3] ?? 50001);
const takePreference = Number(
  logPath ? (process.argv[3] ?? 0) : (process.argv[4] ?? 0),
);
if (
  (!logPath && (!Number.isInteger(games) || games < 1)) ||
  (!logPath && !Number.isInteger(start)) ||
  !Number.isFinite(takePreference)
)
  throw Error("Usage: calibrate-hand-belief.ts games startSeed | log.jsonl");
const bins = Array.from({ length: 10 }, () => ({
  count: 0,
  predicted: 0,
  actual: 0,
}));
let samples = 0,
  brier = 0,
  baselineBrier = 0,
  logLoss = 0,
  unsupported = 0,
  closing = 0;
let lateSamples = 0,
  lateBrier = 0,
  lateBaselineBrier = 0;
function baseline(state: State, known: readonly string[]): number {
  if (GOODS.filter((good) => !state.tokens[good].length).length < 2) return 0;
  const own = state.players[state.current].hand;
  const otherCount = state.players[1 - state.current].hand.length;
  const fixed = GOODS.map(
    (good) => known.filter((card) => card === good).length,
  );
  const pool = GOODS.map(
    (good, i) =>
      COUNTS[good] -
      fixed[i] -
      own.filter((card) => card === good).length -
      state.market.filter((card) => card === good).length -
      state.discard.filter((card) => card === good).length,
  );
  const choose = (n: number, k: number) => {
    if (k < 0 || k > n) return 0;
    let result = 1;
    for (let i = 1; i <= k; i++) result = (result * (n - i + 1)) / i;
    return result;
  };
  let mass = 0,
    risk = 0;
  const walk = (i: number, left: number, hand: number[], weight: number) => {
    if (i === GOODS.length) {
      if (left) return;
      mass += weight;
      if (
        GOODS.some((good, index) => {
          const needed = state.tokens[good].length;
          return (
            needed > 0 &&
            fixed[index] + hand[index] >= Math.max(needed, index < 3 ? 2 : 1)
          );
        })
      )
        risk += weight;
      return;
    }
    for (let n = 0; n <= Math.min(left, pool[i]); n++) {
      hand[i] = n;
      walk(i + 1, left - n, hand, weight * choose(pool[i], n));
    }
  };
  walk(0, otherCount - fixed.reduce((a, b) => a + b), Array(6).fill(0), 1);
  return mass ? risk / mass : 0;
}
function truth(state: State): number {
  if (GOODS.filter((good) => !state.tokens[good].length).length < 2) return 0;
  return GOODS.some((good, index) => {
    const tokens = state.tokens[good].length;
    const cards = state.players[1 - state.current].hand.filter(
      (card) => card === good,
    ).length;
    return tokens > 0 && cards >= Math.max(tokens, index < 3 ? 2 : 1);
  })
    ? 1
    : 0;
}
const records: { seed: number; events?: Event[] }[] = logPath
  ? readFileSync(logPath, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))
  : Array.from({ length: games }, (_, i) => ({ seed: start + i }));
for (const record of records) {
  const seed = record.seed;
  let state = newGame(seed);
  const events: Event[] = [];
  let rng = (seed ^ 0x9e3779b9) >>> 0;
  for (let step = 0; step < 700 && state.phase !== "finished"; step++) {
    if (record.events && step >= record.events.length) break;
    if (state.phase === "roundEnd") {
      events.push({ type: "next" });
      state = nextRound(state);
      continue;
    }
    const observation = observe(state, events, true);
    const worlds = takePreference
      ? publicHandDistribution(state, events, state.current, takePreference)
      : (observation.opponentHandDistribution ?? []);
    const actual = truth(state);
    const predicted = nextSaleCloseProbability(worlds, state);
    const oldPredicted = baseline(state, observation.knownOpponentHand);
    if (!worlds.length)
      throw Error(`Empty posterior at seed ${seed}, step ${step}`);
    const mass = worlds.reduce((sum, world) => sum + world.probability, 0);
    if (Math.abs(mass - 1) > 1e-9)
      throw Error(
        `Unnormalized posterior at seed ${seed}, step ${step}: ${mass}`,
      );
    if (step % 17 === 0) {
      const fresh = publicHandDistribution(
        state,
        [...events],
        state.current,
        takePreference,
      );
      const freshRisk = nextSaleCloseProbability(fresh, state);
      if (Math.abs(freshRisk - predicted) > 1e-9)
        throw Error(`Cached posterior differs at seed ${seed}, step ${step}`);
    }
    const actualHand = GOODS.map(
      (good) =>
        state.players[1 - state.current].hand.filter((card) => card === good)
          .length,
    );
    if (
      !worlds.some((world) => actualHand.every((n, i) => n === world.hand[i]))
    )
      unsupported++;
    const bin = bins[Math.min(9, Math.floor(predicted * 10))];
    bin.count++;
    bin.predicted += predicted;
    bin.actual += actual;
    samples++;
    closing += actual;
    brier += (predicted - actual) ** 2;
    baselineBrier += (oldPredicted - actual) ** 2;
    logLoss -= actual
      ? Math.log(Math.max(predicted, 1e-12))
      : Math.log(Math.max(1 - predicted, 1e-12));
    if (GOODS.filter((good) => !state.tokens[good].length).length >= 2) {
      lateSamples++;
      lateBrier += (predicted - actual) ** 2;
      lateBaselineBrier += (oldPredicted - actual) ** 2;
    }
    const actions = legalActions(state);
    rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
    const action = record.events
      ? record.events[step]
      : actions[Math.floor((rng / 4294967296) * actions.length)];
    if (action.type === "next")
      throw Error(`Unexpected next at ${seed}:${step}`);
    state = applyAction(state, action);
    events.push(action);
  }
}
console.log(
  JSON.stringify(
    {
      games: records.length,
      logPath,
      takePreference,
      samples,
      closing,
      unsupported,
      brier: brier / samples,
      baselineBrier: baselineBrier / samples,
      logLoss: logLoss / samples,
      lateSamples,
      lateBrier: lateSamples ? lateBrier / lateSamples : null,
      lateBaselineBrier: lateSamples ? lateBaselineBrier / lateSamples : null,
      bins: bins.map((bin, index) => ({
        range: `${index / 10}-${(index + 1) / 10}`,
        count: bin.count,
        predicted: bin.count ? bin.predicted / bin.count : null,
        actual: bin.count ? bin.actual / bin.count : null,
      })),
    },
    null,
    2,
  ),
);

import assert from "node:assert/strict";
import { createReadStream, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { newGame, nextRound, actionError, applyAction } from "../src/game/engine.ts";
import type { Event } from "../src/game/types.ts";

const directory = process.argv[2] ?? "analysis/dmc-resume-fast-2026-09-24";
const read = (name: string) => JSON.parse(readFileSync(join(directory, name), "utf8"));
const lines = async function* (name: string) {
  const input = createInterface({ input: createReadStream(join(directory, name)) });
  for await (const line of input) if (line) yield JSON.parse(line);
};
function replay(game: { seed: number; seat?: number; winner: number; events: Event[] }) {
  let state = newGame(game.seed);
  let actions = 0;
  for (const event of game.events) {
    if (event.type === "next") {
      assert.equal(state.phase, "roundEnd");
      state = nextRound(state);
    } else {
      assert.equal(actionError(state, event), null);
      state = applyAction(state, event);
      actions++;
    }
  }
  assert.equal(state.phase, "finished");
  const winner = state.seals[0] > state.seals[1] ? 0 : 1;
  assert.equal(game.winner, game.seat === undefined ? winner : Number(winner !== game.seat));
  return actions;
}

const config = read("config.json");
assert.equal(config.iterations, 128);
assert.equal(config.gamesPerIteration, 128);
assert.equal(config.devSeed, 3_000_100_000);
assert.equal(config.devPairs, 32);
assert.equal(config.evalEvery, 16);
assert.equal(config.resumeCheckpoint, "analysis/dmc-10m-2026-09-24/model-658.pt");
const training = [];
for await (const row of lines("training.jsonl")) training.push(row);
assert.equal(training.length, 129);
assert.equal(training[0].version, 658);
let sampleTotal = 0;
for (let i = 1; i <= 128; i++) {
  const row = training[i];
  assert.equal(row.iteration, i);
  assert.equal(row.version, 658 + i);
  assert.equal(row.completed, 128);
  assert.equal(row.truncated, 0);
  assert.equal(row.samples, row.totalTurns);
  sampleTotal += row.samples;
  assert.equal(row.cumulativeSamples, sampleTotal);
  assert.equal(row.cumulativeMatches, i * 128);
  assert.equal(Boolean(row.arena), i % 16 === 0);
}
const completion = read("completion.json");
assert.equal(completion.phase, "training-complete");
assert.equal(completion.cumulativeSamples, sampleTotal);
assert.equal(completion.cumulativeMatches, 128 * 128);
const selection = read("selection.json");
assert.equal(selection.latestCheckpoint, training[128].checkpoint);
let best = training[0].arena.wins[0] - training[0].arena.wins[1];
let bestPath = training[0].checkpoint;
for (const row of training.slice(1)) if (row.arena) {
  const score = row.arena.wins[0] - row.arena.wins[1] - row.arena.truncated;
  if (score > best) { best = score; bestPath = row.checkpoint; }
}
assert.equal(selection.bestCheckpoint, bestPath);
assert.equal(selection.bestDevScore, best);

const seen = new Set<number>();
const perIteration = Array<number>(128).fill(0);
let gameActions = 0, replayedTraining = 0;
for await (const game of lines("selfplay-games.jsonl")) {
  assert.ok(Number.isInteger(game.iteration) && game.iteration >= 0 && game.iteration < 128);
  const first = 1_000_000 + (658 + game.iteration) * 10_000;
  assert.ok(game.seed >= first && game.seed < first + 128);
  assert.equal(game.version, 658 + game.iteration);
  assert.equal(game.epsilon, 0.1);
  assert.equal(game.turns, game.events.filter((e: Event) => e.type !== "next").length);
  assert.ok(!seen.has(game.seed));
  seen.add(game.seed);
  perIteration[game.iteration]++;
  gameActions += game.turns;
  if (game.seed === first && (game.iteration % 16 === 0 || game.iteration === 127)) {
    assert.equal(replay(game), game.turns);
    replayedTraining++;
  }
}
assert.ok(perIteration.every((n) => n === 128));
assert.equal(gameActions, sampleTotal);

const comparisons = [
  ["selected-normal", 3_500_000_000, "normal", selection.bestCheckpoint],
  ["prior-normal", 3_500_000_000, "normal", "analysis/dmc-10m-2026-09-24/model-612.pt"],
  ["selected-prior", 3_600_000_000, "analysis/dmc-10m-2026-09-24/model-612.pt", selection.bestCheckpoint],
] as const;
const evaluations = [];
let replayedEvaluationActions = 0;
for (const [name, start, opponent, checkpoint] of comparisons) {
  const result = read(`${name}.json`);
  assert.equal(result.start, start);
  assert.equal(result.pairs, 32);
  assert.equal(result.opponent, opponent);
  assert.equal(result.checkpoint, checkpoint);
  assert.equal(result.truncated, 0);
  const pairs = new Map<number, Set<number>>();
  const wins = [0, 0];
  for await (const game of lines(`${name}.games.jsonl`)) {
    assert.ok(game.seed >= start && game.seed < start + 32);
    assert.equal(game.candidate, checkpoint);
    assert.equal(game.baseline, opponent);
    assert.ok(game.seat === 0 || game.seat === 1);
    const seats = pairs.get(game.seed) ?? new Set<number>();
    assert.ok(!seats.has(game.seat));
    seats.add(game.seat);
    pairs.set(game.seed, seats);
    replayedEvaluationActions += replay(game);
    wins[game.winner]++;
  }
  assert.equal(pairs.size, 32);
  assert.ok([...pairs.values()].every((seats) => seats.size === 2));
  assert.deepEqual(wins, result.wins);
  evaluations.push({ name, wins, pairs: 32 });
}
const output = {
  initialVersion: 658,
  finalVersion: 786,
  updates: 128,
  completedGames: seen.size,
  samples: sampleTotal,
  replayedTraining,
  replayedEvaluationGames: evaluations.length * 64,
  replayedEvaluationActions,
  selectedCheckpoint: bestPath,
  evaluations,
};
writeFileSync(join(directory, "verification.json"), JSON.stringify(output, null, 2) + "\n");
console.log(JSON.stringify(output));

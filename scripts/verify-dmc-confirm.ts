import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { newGame, nextRound, actionError, applyAction } from "../src/game/engine.ts";
import type { Event } from "../src/game/types.ts";

const dir = process.argv[2] ?? "analysis/dmc-resume-confirm-2026-09-24";
const prefix = join(dir, "new-versus-old");
const result = JSON.parse(readFileSync(prefix + ".json", "utf8"));
const newModel = "analysis/dmc-resume-fast-2026-09-24/model-738.pt";
const oldModel = "analysis/dmc-10m-2026-09-24/model-612.pt";
assert.equal(result.checkpoint, newModel);
assert.equal(result.opponent, oldModel);
assert.equal(result.start, 3_700_000_000);
assert.equal(result.pairs, 512);
assert.equal(result.truncated, 0);
const games = readFileSync(prefix + ".games.jsonl", "utf8").trim().split("\n").map(JSON.parse);
assert.equal(games.length, 1024);
const seeds = new Map<number, { seats: Set<number>; wins: number }>();
const wins = [0, 0];
let actions = 0;
for (const game of games) {
  assert.ok(game.seed >= result.start && game.seed < result.start + 512);
  assert.ok(game.seat === 0 || game.seat === 1);
  assert.equal(game.candidate, newModel);
  assert.equal(game.baseline, oldModel);
  const pair = seeds.get(game.seed) ?? { seats: new Set<number>(), wins: 0 };
  assert.ok(!pair.seats.has(game.seat));
  pair.seats.add(game.seat);
  pair.wins += Number(game.winner === 0);
  seeds.set(game.seed, pair);
  let state = newGame(game.seed);
  for (const event of game.events as Event[]) {
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
  const absoluteWinner = state.seals[0] > state.seals[1] ? 0 : 1;
  assert.equal(game.winner, Number(absoluteWinner !== game.seat));
  wins[game.winner]++;
}
assert.equal(seeds.size, 512);
assert.ok([...seeds.values()].every((pair) => pair.seats.size === 2));
assert.deepEqual(wins, result.wins);
const pairCounts = [0, 0, 0];
for (const pair of seeds.values()) pairCounts[pair.wins]++;
const decisive = pairCounts[0] + pairCounts[2];
let term = 2 ** -decisive;
let tail = term;
for (let k = 1; k <= Math.min(pairCounts[0], pairCounts[2]); k++) {
  term *= (decisive - k + 1) / k;
  tail += term;
}
const pTwoSided = Math.min(1, 2 * tail);
const output = {
  verified: true,
  pairedSeeds: 512,
  games: games.length,
  replayedActions: actions,
  wins,
  pairOutcomes: { newModelTwo: pairCounts[2], split: pairCounts[1], oldModelTwo: pairCounts[0] },
  newModelWinRate: wins[0] / games.length,
  pairedTwoSidedP: pTwoSided,
  meetsPreregisteredGate: wins[0] > wins[1] && pTwoSided < 0.05,
  promoted: false,
};
writeFileSync(join(dir, "verification.json"), JSON.stringify(output, null, 2) + "\n");
console.log(JSON.stringify(output));

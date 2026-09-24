import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  newGame,
  nextRound,
  applyAction,
  actionError,
} from "../src/game/engine.ts";
import type { Event } from "../src/game/types.ts";

const directory = process.argv[2] ?? "analysis/dmc-mcts-2026-09-24";
const results = [];
const names =
  process.argv.length > 3
    ? process.argv.slice(3)
    : ["mix-50ms", "pure-50ms", "mix-1s", "mix-2s"];
for (const name of names) {
  const path = join(directory, name + "-result.json");
  if (!existsSync(path)) throw Error(`${name} has not run`);
  const text = readFileSync(path, "utf8");
  const at = text.lastIndexOf("\n{\n");
  if (at < 0) throw Error(`${name} has not completed`);
  const summary = JSON.parse(text.slice(at));
  const games = readFileSync(join(directory, name + "-games.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  const pairs = new Map<number, Set<number>>();
  const wins = [0, 0];
  let actions = 0;
  for (const game of games) {
    const seats = pairs.get(game.seed) ?? new Set<number>();
    if (seats.has(game.seat)) throw Error("Duplicate seed and seat");
    seats.add(game.seat);
    pairs.set(game.seed, seats);
    let state = newGame(game.seed);
    for (const event of game.events as Event[]) {
      if (event.type === "next") {
        if (state.phase !== "roundEnd") throw Error("Bad round transition");
        state = nextRound(state);
      } else {
        const error = actionError(state, event);
        if (error) throw Error(error);
        state = applyAction(state, event);
        actions++;
      }
    }
    if (state.phase !== "finished") throw Error("Incomplete match");
    const winner = state.seals[game.seat] > state.seals[1 - game.seat] ? 0 : 1;
    if (winner !== game.winner) throw Error("Incorrect winner");
    wins[winner]++;
  }
  if (
    pairs.size !== summary.pairs ||
    [...pairs.values()].some((s) => s.size !== 2 || !s.has(0) || !s.has(1))
  )
    throw Error("Incomplete paired evaluation");
  if (JSON.stringify(wins) !== JSON.stringify(summary.wins))
    throw Error("Counts mismatch");
  results.push({
    name,
    verified: true,
    matches: games.length,
    replayedActions: actions,
    ...summary,
  });
}
const result = {
  checkpoint: "analysis/dmc-10m-2026-09-24/model-612.pt",
  temperature: 0.2,
  uniformPriorMass: 0.05,
  rootMix: 0.5,
  promoted: false,
  results,
};
writeFileSync(
  join(directory, "evaluation-summary.json"),
  JSON.stringify(result, null, 2) + "\n",
);
console.log(JSON.stringify(result));

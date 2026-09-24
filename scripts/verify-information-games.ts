import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  newGame,
  nextRound,
  applyAction,
  actionError,
} from "../src/game/engine.ts";
const directory = process.argv[2];
const files: string[] = [];
function walk(path: string) {
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (entry.name === "swanlab") continue;
    const full = join(path, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith("-games.jsonl")) files.push(full);
  }
}
walk(directory);
const dataset = JSON.parse(
  readFileSync(join(directory, "dataset.json"), "utf8"),
);
const priorSeeds = new Set<number>([
  ...dataset.seeds.train,
  ...dataset.seeds.dev,
]);
const trainingSeeds = new Set<number>();
const evaluationSeeds = new Set<number>();
const expected = new Map([
  ["ppo-search/search1-policy-games.jsonl", { start: 56001, pairs: 2 }],
  ["policy-normal/policy-normal-games.jsonl", { start: 51001, pairs: 32 }],
  ["search-policy/search1-policy-games.jsonl", { start: 52001, pairs: 2 }],
  [
    "final-evaluation/ppo-normal/policy-normal-games.jsonl",
    { start: 54001, pairs: 32 },
  ],
  [
    "final-evaluation/bc-normal/policy-normal-games.jsonl",
    { start: 54001, pairs: 32 },
  ],
  [
    "final-evaluation/ppo-dmc/policy-dmc-games.jsonl",
    { start: 55001, pairs: 32 },
  ],
  [
    "final-evaluation/search-old/search1-guidedBehavior-games.jsonl",
    { start: 53001, pairs: 2 },
  ],
]);
const results = [];
for (const file of files) {
  let count = 0,
    actions = 0;
  const pairs = new Map<number, Set<number>>(),
    wins = [0, 0];
  for (const line of readFileSync(file, "utf8").trim().split("\n")) {
    const game = JSON.parse(line);
    if (priorSeeds.has(game.seed)) throw Error("Reused source seed");
    let s = newGame(game.seed);
    for (const a of game.events) {
      if (a.type === "next") {
        if (s.phase !== "roundEnd") throw Error("Bad round transition");
        s = nextRound(s);
      } else {
        const error = actionError(s, a);
        if (error) throw Error(error);
        s = applyAction(s, a);
        actions++;
      }
    }
    if (s.phase !== "finished") throw Error("Unfinished game");
    const absolute = s.seals[0] >= 2 ? 0 : 1;
    if (game.opponent) {
      if (trainingSeeds.has(game.seed)) throw Error("Repeated selfplay seed");
      trainingSeeds.add(game.seed);
      if (absolute !== game.winner) throw Error("Wrong selfplay winner");
    } else {
      evaluationSeeds.add(game.seed);
      const winner = absolute === game.seat ? 0 : 1;
      if (winner !== game.winner) throw Error("Wrong evaluation winner");
      wins[winner]++;
      const seats = pairs.get(game.seed) ?? new Set();
      if (seats.has(game.seat)) throw Error("Duplicate seed/seat");
      seats.add(game.seat);
      pairs.set(game.seed, seats);
    }
    count++;
  }
  if (pairs.size && [...pairs.values()].some((s) => s.size !== 2))
    throw Error("Unpaired evaluation");
  const relative = file.slice(directory.length + 1),
    plan = expected.get(relative);
  if (plan) {
    if (
      count !== plan.pairs * 2 ||
      [...pairs.keys()].some(
        (s) => s < plan.start || s >= plan.start + plan.pairs,
      )
    )
      throw Error("Evaluation differs from plan");
    expected.delete(relative);
  } else if (relative !== "ppo/selfplay-games.jsonl")
    throw Error("Unexpected game file");
  results.push({
    file,
    games: count,
    actions,
    wins: pairs.size ? wins : undefined,
    pairedSeeds: pairs.size,
  });
}
if (expected.size) throw Error("Missing planned evaluation");
if (trainingSeeds.size !== 512) throw Error("Wrong training match count");
if ([...evaluationSeeds].some((s) => trainingSeeds.has(s)))
  throw Error("Train/evaluation overlap");
writeFileSync(
  join(directory, "game-verification.json"),
  JSON.stringify(results, null, 2) + "\n",
);
console.log(results);

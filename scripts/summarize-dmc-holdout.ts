import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2] ?? "analysis/dmc-mcts-holdout-2026-09-24";
const games = readFileSync(join(dir, "count-256-games.jsonl"), "utf8")
  .trim()
  .split("\n")
  .map((line) => JSON.parse(line));
const summary = JSON.parse(readFileSync(join(dir, "evaluation-summary.json"), "utf8"));
const result = summary.results[0];
if (summary.results.length !== 1 || result.name !== "count-256" || !result.verified)
  throw Error("Replay verification is missing");
if (result.start !== 12001 || result.pairs !== 24 || result.comparison !== "equal-search-count" ||
    result.simulationsPerDecision !== 2048 || !result.searchCountVerifiedEveryDecision)
  throw Error("Evaluation differs from the preregistered plan");
const bySeed = new Map<number, Set<number>>();
const pairWins = new Map<number, number>();
for (const game of games) {
  if (game.candidate !== "dmcMcts" || game.baseline !== "guidedBehavior" ||
      game.seed < 12001 || game.seed > 12024 || ![0, 1].includes(game.seat) ||
      ![0, 1].includes(game.winner) || game.fixedIterationsPerTree !== 256)
    throw Error("Unexpected game configuration");
  const seats = bySeed.get(game.seed) ?? new Set<number>();
  if (seats.has(game.seat)) throw Error("Repeated seat");
  seats.add(game.seat);
  bySeed.set(game.seed, seats);
  pairWins.set(game.seed, (pairWins.get(game.seed) ?? 0) + Number(game.winner === 0));
}
if (bySeed.size !== 24 || [...bySeed.values()].some((seats) => seats.size !== 2))
  throw Error("Missing paired matches");
const scores = [...pairWins.entries()].sort(([a], [b]) => a - b).map(([seed, wins]) => ({ seed, wins }));
const swept = scores.filter((x) => x.wins === 2).length;
const split = scores.filter((x) => x.wins === 1).length;
const lost = scores.filter((x) => x.wins === 0).length;
const totalWins = 2 * swept + split;
if (totalWins !== result.wins[0] || 48 - totalWins !== result.wins[1])
  throw Error("Win total differs from replay summary");
// Under paired label exchangeability, only the direction of a 2:0 sweep is random.
const decisive = swept + lost;
let probability = Math.pow(0.5, decisive);
let lowerTail = probability;
for (let k = 1; k <= Math.min(swept, lost); k++) {
  probability *= (decisive - k + 1) / k;
  lowerTail += probability;
}
const pTwoSided = Math.min(1, 2 * lowerTail);
// Hoeffding treats each seed's 0, 0.5, or 1 score as one bounded independent observation.
const winRate = totalWins / 48;
const halfWidth = Math.sqrt(Math.log(40) / (2 * 24));
const output = {
  seedRange: [12001, 12024],
  pairedSeeds: 24,
  games: 48,
  candidateWins: totalWins,
  baselineWins: 48 - totalWins,
  pairOutcomes: { candidateTwo: swept, split, baselineTwo: lost },
  winRate,
  hoeffding95: [Math.max(0, winRate - halfWidth), Math.min(1, winRate + halfWidth)],
  pairedTwoSidedP: pTwoSided,
  scores,
};
writeFileSync(join(dir, "pair-analysis.json"), JSON.stringify(output, null, 2) + "\n");
console.log(JSON.stringify(output));

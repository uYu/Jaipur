import { readFileSync } from "node:fs";
import { applyAction, newGame, nextRound } from "../src/game/engine.ts";
import type { Event } from "../src/game/types.ts";

const paths = process.argv.slice(2);
if (!paths.length)
  throw Error("Usage: fit-take-preference.ts game-log.jsonl [...]");
const samples: { hand: number; alternatives: number[] }[] = [];
for (const path of paths) {
  const records = readFileSync(path, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  for (const record of records) {
    let state = newGame(record.seed);
    for (const event of record.events as Event[]) {
      if (event.type === "next") {
        state = nextRound(state);
        continue;
      }
      if (event.type === "take") {
        const hand = state.players[state.current].hand;
        const counts = state.market
          .filter((card) => card !== "camel")
          .map((card) => hand.filter((held) => held === card).length);
        samples.push({
          hand: hand.filter((held) => held === state.market[event.index])
            .length,
          alternatives: counts,
        });
      }
      state = applyAction(state, event);
    }
  }
}
const grid = Array.from({ length: 21 }, (_, i) => (i - 4) / 8);
const scores = grid.map((beta) => ({
  beta,
  nll:
    samples.reduce((loss, sample) => {
      const denominator = sample.alternatives.reduce(
        (sum, count) => sum + Math.exp(beta * count),
        0,
      );
      return loss + Math.log(denominator) - beta * sample.hand;
    }, 0) / samples.length,
}));
console.log(
  JSON.stringify(
    {
      samples: samples.length,
      scores,
      best: scores.reduce((a, b) => (a.nll < b.nll ? a : b)),
    },
    null,
    2,
  ),
);

import { readFileSync, writeFileSync } from "node:fs";
import {
  newGame,
  nextRound,
  applyAction,
  actionError,
} from "../src/game/engine.ts";
const directory = process.argv[2],
  results = [];
for (const iteration of [16, 48, 80, 112, 144]) {
  const rows = readFileSync(
    `${directory}/model-${String(iteration).padStart(3, "0")}/policy-normal-games.jsonl`,
    "utf8",
  )
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  const seen = new Set(),
    wins = [0, 0];
  let actions = 0;
  const paired = new Map<number, number>();
  for (const g of rows) {
    if (
      g.seed < 310001 ||
      g.seed > 310032 ||
      ![0, 1].includes(g.seat) ||
      seen.has(`${g.seed}:${g.seat}`)
    )
      throw Error("Invalid seed/seat");
    seen.add(`${g.seed}:${g.seat}`);
    let s = newGame(g.seed);
    for (const a of g.events) {
      if (a.type === "next") {
        if (s.phase !== "roundEnd") throw Error("Bad next");
        s = nextRound(s);
      } else {
        const error = actionError(s, a);
        if (error) throw Error(error);
        s = applyAction(s, a);
        actions++;
      }
    }
    const winner = s.seals[g.seat] >= 2 ? 0 : 1;
    if (s.phase !== "finished" || winner !== g.winner)
      throw Error("Wrong winner");
    wins[winner]++;
    paired.set(g.seed, (paired.get(g.seed) ?? 0) + (winner === 0 ? 1 : 0));
  }
  if (rows.length !== 64) throw Error("Missing matches");
  results.push({
    iteration,
    wins,
    actions,
    paired: [...paired].sort((a, b) => a[0] - b[0]),
    verified: true,
  });
}
writeFileSync(
  `${directory}/verification.json`,
  JSON.stringify(results, null, 2) + "\n",
);
console.log(
  results.map(({ iteration, wins, actions }) => ({ iteration, wins, actions })),
);

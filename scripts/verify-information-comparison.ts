import { readFileSync, writeFileSync } from "node:fs";
import {
  newGame,
  nextRound,
  applyAction,
  actionError,
} from "../src/game/engine.ts";
const directory = process.argv[2],
  manifest = JSON.parse(readFileSync(`${directory}/manifest.json`, "utf8")),
  results = [];
for (const c of manifest.cases) {
  const rows = readFileSync(
    `${directory}/${c.name}/policy-${c.baseline}-games.jsonl`,
    "utf8",
  )
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  const seen = new Set<string>(),
    wins = [0, 0];
  let actions = 0;
  const paired = new Map<number, number>();
  for (const r of rows) {
    if (
      r.seed < c.start ||
      r.seed >= c.start + c.pairs ||
      ![0, 1].includes(r.seat) ||
      seen.has(`${r.seed}:${r.seat}`)
    )
      throw Error("Invalid seed/seat");
    seen.add(`${r.seed}:${r.seat}`);
    let s = newGame(r.seed);
    for (const a of r.events) {
      if (a.type === "next") {
        if (s.phase !== "roundEnd") throw Error("Invalid transition");
        s = nextRound(s);
      } else {
        const error = actionError(s, a);
        if (error) throw Error(error);
        s = applyAction(s, a);
        actions++;
      }
    }
    const winner = s.seals[r.seat] >= 2 ? 0 : 1;
    if (s.phase !== "finished" || winner !== r.winner)
      throw Error("Incorrect result");
    wins[winner]++;
    paired.set(r.seed, (paired.get(r.seed) ?? 0) + (winner === 0 ? 1 : 0));
  }
  if (rows.length !== c.pairs * 2) throw Error("Missing matches");
  const summary = JSON.parse(
    readFileSync(
      `${directory}/${c.name}/policy-${c.baseline}-summary.json`,
      "utf8",
    ),
  );
  if (JSON.stringify(summary.wins) !== JSON.stringify(wins))
    throw Error("Summary mismatch");
  results.push({
    name: c.name,
    games: rows.length,
    actions,
    wins,
    pairedResults: [...paired].sort((a, b) => a[0] - b[0]),
    verified: true,
  });
}
writeFileSync(
  `${directory}/verification.json`,
  JSON.stringify(results, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    type: "verification",
    games: results.reduce((s, r) => s + r.games, 0),
    actions: results.reduce((s, r) => s + r.actions, 0),
    verified: true,
  }),
);

import { readFileSync, writeFileSync } from "node:fs";
import {
  newGame,
  nextRound,
  applyAction,
  actionError,
} from "../src/game/engine.ts";
const directory = process.argv[2],
  config = JSON.parse(readFileSync(`${directory}/config.json`, "utf8"));
const expected = new Set<number>();
for (
  let iteration = config.initial_iteration + 1;
  iteration <= config.initial_iteration + config.additional_iterations;
  iteration++
)
  for (let j = 0; j < 32; j++)
    expected.add(config.seed_base + iteration * 100 + j);
let games = 0,
  actions = 0;
for (const line of readFileSync(`${directory}/selfplay-games.jsonl`, "utf8")
  .trim()
  .split("\n")) {
  const game = JSON.parse(line);
  if (!expected.delete(game.seed)) throw Error("Duplicate or unexpected seed");
  let s = newGame(game.seed);
  for (const a of game.events) {
    if (a.type === "next") {
      if (s.phase !== "roundEnd") throw Error("Invalid round transition");
      s = nextRound(s);
    } else {
      const error = actionError(s, a);
      if (error) throw Error(error);
      s = applyAction(s, a);
      actions++;
    }
  }
  if (s.phase !== "finished" || (s.seals[0] >= 2 ? 0 : 1) !== game.winner)
    throw Error("Incorrect terminal result");
  games++;
}
if (expected.size || games !== config.additional_games)
  throw Error("Incomplete continuation");
const training = JSON.parse(readFileSync(`${directory}/training.json`, "utf8"));
if (
  training.length !== config.additional_iterations ||
  training.at(-1).iteration !==
    config.initial_iteration + config.additional_iterations
)
  throw Error("Missing training updates");
const result = {
  type: "verification",
  verified: true,
  games,
  actions,
  samples: training.reduce((s: number, r: any) => s + r.samples, 0),
  final_iteration: training.at(-1).iteration,
  elapsed_s: training.at(-1).elapsed_s,
  promoted: false,
};
writeFileSync(
  `${directory}/verification.json`,
  JSON.stringify(result, null, 2) + "\n",
);
console.log(JSON.stringify(result));

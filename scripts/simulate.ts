import { newGame } from "../src/game/engine.ts";
import { chooseAction, observe } from "../src/game/ai.ts";
import { chooseWasmAction } from "../src/game/ai-wasm.ts";
import { advance } from "../src/game/storage.ts";
import type { Difficulty } from "../src/game/types.ts";
const count = Number(process.argv[2] ?? 100),
  difficulty = (process.argv[3] ?? "hard") as Difficulty;
if (
  !Number.isInteger(count) ||
  count < 1 ||
  count > 10000 ||
  !["easy", "normal", "hard"].includes(difficulty)
)
  throw new Error("Usage: npm run simulate -- 100 hard");
let max = 0,
  total = 0;
for (let seed = 1; seed <= count; seed++) {
  let s = newGame(seed),
    turns = 0;
  const events = [];
  while (s.phase !== "finished" && turns++ < 1000) {
    const event =
      s.phase === "roundEnd"
        ? { type: "next" as const }
        : difficulty === "hard"
          ? await chooseWasmAction(observe(s, events))
          : chooseAction(observe(s, events), difficulty);
    events.push(event);
    s = advance(s, event);
  }
  if (s.phase !== "finished") throw new Error(`Seed ${seed} did not finish`);
  max = Math.max(max, turns);
  total += turns;
}
console.log(
  `${count} complete ${difficulty} AI matches; average ${(total / count).toFixed(1)} actions; max ${max}.`,
);

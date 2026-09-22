import {
  chooseWasmAction,
  chooseOriginalWasmAction,
} from "../src/game/ai-wasm.ts";
import { observe } from "../src/game/ai.ts";
import { newGame } from "../src/game/engine.ts";
import { advance } from "../src/game/storage.ts";
import { MCTS_ITERATIONS_PER_TREE } from "../src/game/ai-config.ts";

const seeds = Number(process.argv[2] ?? 5);
const iterationsPerTree = Number(process.argv[3] ?? MCTS_ITERATIONS_PER_TREE);
if (
  !Number.isInteger(seeds) ||
  seeds < 1 ||
  !Number.isInteger(iterationsPerTree) ||
  iterationsPerTree < 100
)
  throw new Error("Usage: npm run tournament -- 5 1000");

let mctsWins = 0;
let originalWins = 0;
const started = performance.now();
for (let seed = 1; seed <= seeds; seed++)
  for (let mctsSeat = 0; mctsSeat < 2; mctsSeat++) {
    let state = newGame(seed);
    const events = [];
    let turns = 0;
    while (state.phase !== "finished" && turns++ < 700) {
      const observation = observe(state, events);
      const event =
        state.phase === "roundEnd"
          ? { type: "next" as const }
          : state.current === mctsSeat
            ? await chooseWasmAction(observation, iterationsPerTree)
            : await chooseOriginalWasmAction(observation);
      events.push(event);
      state = advance(state, event);
    }
    if (state.phase !== "finished")
      throw new Error(`Seed ${seed}, seat ${mctsSeat} did not finish`);
    const winner = state.seals[0] > state.seals[1] ? 0 : 1;
    if (winner === mctsSeat) mctsWins++;
    else originalWins++;
    console.log(
      `seed ${seed}, MCTS seat ${mctsSeat}: ${winner === mctsSeat ? "MCTS" : "original"}`,
    );
  }

console.log({
  games: seeds * 2,
  iterationsPerTree,
  totalMctsIterations: iterationsPerTree * 8,
  mctsWins,
  originalWins,
  seconds: Number(((performance.now() - started) / 1000).toFixed(1)),
});

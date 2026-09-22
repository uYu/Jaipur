import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import {
  newGame,
  applyAction,
  nextRound,
  actionError,
} from "../src/game/engine.ts";
import { observe } from "../src/game/ai.ts";
import {
  chooseWasmActionWithStats,
  chooseOriginalWasmAction,
  encodeObservation,
  decodeAction,
} from "../src/game/ai-wasm.ts";
import type { Action, Event } from "../src/game/types.ts";
import type { Observation } from "../src/game/ai.ts";
import { MCTS_ITERATIONS_PER_TREE } from "../src/game/ai-config.ts";

// Save the previous bundled module before rebuilding, then supply its path.
// node --experimental-strip-types scripts/benchmark-ai.ts 5 1000 /tmp/old-ai.mjs 30000
const seeds = Number(process.argv[2] ?? 5);
const iterations = Number(process.argv[3] ?? MCTS_ITERATIONS_PER_TREE);
const baselinePath = process.argv[4];
const baselineIterations = Number(process.argv[5] ?? 30000);
if (
  ![seeds, iterations, baselineIterations].every(Number.isInteger) ||
  seeds < 1 ||
  seeds > 100 ||
  iterations < 100 ||
  iterations > 100000 ||
  baselineIterations < 100 ||
  baselineIterations > 100000
)
  throw new Error(
    "Usage: benchmark-ai.ts seeds iterations [baseline.mjs baselineIterations]",
  );
const baseline = baselinePath
  ? await (await import(pathToFileURL(resolve(baselinePath)).href)).default()
  : null;
async function opponent(o: Observation): Promise<Action> {
  if (!baseline) return chooseOriginalWasmAction(o);
  const encoded = encodeObservation(o);
  const input = baseline._malloc(encoded.byteLength);
  // Enough for both the old and current telemetry ABI.
  const output = baseline._malloc(27 * 4);
  try {
    baseline.HEAP32.set(encoded, input / 4);
    if (
      !baseline._jaipur_choose(
        input,
        encoded.length,
        output,
        baselineIterations,
      )
    )
      throw new Error("Baseline rejected observation");
    return decodeAction(baseline.HEAP32.slice(output / 4, output / 4 + 16), o);
  } finally {
    baseline._free(input);
    baseline._free(output);
  }
}
const wins = [0, 0],
  timeMs = [0, 0],
  moves = [0, 0];
const sales: Record<number, number>[] = [{}, {}];
let terminals = 0,
  truncated = 0,
  simulations = 0;
for (let seed = 1; seed <= seeds; ++seed) {
  for (let seat = 0; seat < 2; ++seat) {
    let state = newGame(seed);
    const events: Event[] = [];
    let turn = 0;
    while (state.phase !== "finished" && turn++ < 700) {
      if (state.phase === "roundEnd") {
        events.push({ type: "next" });
        state = nextRound(state);
        continue;
      }
      const side = state.current === seat ? 0 : 1;
      const o = observe(state, events);
      const start = performance.now();
      let action: Action;
      if (side === 0) {
        const result = await chooseWasmActionWithStats(o, iterations);
        action = result.action;
        simulations += result.stats.simulations;
        terminals += result.stats.terminalSimulations;
        truncated += result.stats.truncatedSimulations;
      } else action = await opponent(o);
      timeMs[side] += performance.now() - start;
      moves[side]++;
      if (action.type === "sell")
        sales[side][action.count] = (sales[side][action.count] ?? 0) + 1;
      const error = actionError(state, action);
      if (error)
        throw new Error(JSON.stringify({ seed, seat, turn, action, error }));
      events.push(action);
      state = applyAction(state, action);
    }
    if (state.phase !== "finished") throw new Error("Match did not finish");
    const winner = state.seals[seat] > state.seals[1 - seat] ? 0 : 1;
    wins[winner]++;
    console.log(
      JSON.stringify({
        seed,
        seat,
        winner: winner === 0 ? "new" : "baseline",
        scores: state.results.map((r) => r.scores),
      }),
    );
  }
}
console.log(
  JSON.stringify(
    {
      games: seeds * 2,
      iterations,
      baseline: baselinePath ?? "normal",
      baselineIterations,
      wins,
      meanMs: timeMs.map((t, i) => Math.round(t / moves[i])),
      sales,
      simulations,
      terminals,
      truncated,
    },
    null,
    2,
  ),
);

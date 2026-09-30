// Paired full-match evaluation of a DouZero checkpoint against the native
// guidedBehavior search AI. Evaluation seeds must be disjoint from training/dev.
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { newGame, nextRound, applyAction, actionError } from "../src/game/engine.ts";
import { observe } from "../src/game/ai.ts";
import { encodeObservation, decodeAction } from "../src/game/ai-wasm.ts";
import { dmcActions, dmcState, dmcAction } from "../src/game/dmc.ts";
import { dmcHistory } from "../src/game/dmc-history.ts";
import type { DmcPublicMove } from "../src/game/dmc-history.ts";
import type { Event } from "../src/game/types.ts";

const [checkpoint, startText = "3900003000", pairsText = "4", budgetText = "1000"] =
  process.argv.slice(2);
const start = Number(startText), pairs = Number(pairsText), budget = Number(budgetText);
if (!checkpoint || !Number.isSafeInteger(start) || !Number.isSafeInteger(pairs) ||
    pairs < 1 || pairs > 100 || !Number.isInteger(budget) || budget < 1 || budget > 5000)
  throw Error("Usage: evaluate-douzero-native.ts checkpoint [startSeed pairs searchMs]");
const binary = join(process.env.JAIPUR_AI_BIN_DIR ?? join(tmpdir(), "jaipur-ai-research"), "search");
const python = spawn(process.env.JAIPUR_PYTHON ?? "python3", [
  "scripts/douzero-inference.py", checkpoint,
], { stdio: ["pipe", "pipe", "inherit"] });
const search = spawn(binary, [
  "search-budgeted", "1.4142135623730951", "0", "8", "1", String(budget), "1",
], { stdio: ["pipe", "pipe", "inherit"] });

function rpc(worker: typeof python) {
  let pending: { resolve: (value: any) => void; reject: (error: Error) => void } | undefined;
  createInterface({ input: worker.stdout }).on("line", (line) => {
    const call = pending;
    pending = undefined;
    if (!call) return;
    try {
      const answer = JSON.parse(line);
      if (answer.error) call.reject(Error(answer.error));
      else call.resolve(answer);
    } catch (error) { call.reject(error as Error); }
  });
  worker.on("error", (error) => pending?.reject(error));
  worker.on("exit", (code) => pending?.reject(Error(`Evaluator exited ${code}`)));
  return (line: string): Promise<any> => new Promise((resolve, reject) => {
    if (pending) throw Error("Concurrent evaluator request");
    pending = { resolve, reject };
    worker.stdin.write(line + "\n");
  });
}
const modelCall = rpc(python), searchCall = rpc(search);
const wins = [0, 0], decisions = [0, 0], elapsed = [0, 0];
try {
  const ready = await modelCall(JSON.stringify({ op: "ready" }));
  if (!["jaipur-douzero-history-v1", "jaipur-hierarchical-history-v1"].includes(ready.architecture))
    throw Error("Expected a DouZero history checkpoint");
  const hierarchical = ready.architecture === "jaipur-hierarchical-history-v1";
  const fullSaleOnly = hierarchical || ready.full_sale_only;
  for (let seed = start; seed < start + pairs; seed++)
    for (let seat = 0; seat < 2; seat++) {
      let state = newGame(seed);
      const events: Event[] = [];
      let moves: DmcPublicMove[] = [];
      let turns = 0;
      while (state.phase !== "finished" && turns++ < 700) {
        if (state.phase === "roundEnd") {
          state = nextRound(state);
          events.push({ type: "next" });
          moves = [];
        }
        const observation = observe(state, events, 0.75);
        const side = state.current === seat ? 0 : 1;
        const started = performance.now();
        let action;
        if (side === 0) {
          const actions = dmcActions(observation, fullSaleOnly);
          const answer = await modelCall(JSON.stringify({
            op: "act", rows: [{
              history: dmcHistory(moves, state.current),
              state: dmcState(observation, {
                ownSeals: state.seals[state.current],
                opponentSeals: state.seals[1 - state.current],
                round: state.round,
              }),
              actions: actions.map((candidate) => dmcAction(observation, candidate)),
            }],
          }));
          action = actions[answer.indices[0]];
        } else {
          const input = encodeObservation(observation, true);
          const answer = await searchCall(
            `100000 ${input.length} ${budget.toFixed(3)} ${Array.from(input).join(" ")}`,
          );
          action = decodeAction(Int32Array.from(answer.action), observation);
        }
        elapsed[side] += performance.now() - started;
        decisions[side]++;
        if (!action || actionError(state, action))
          throw Error(`Illegal action at seed ${seed}, seat ${seat}, turn ${turns}`);
        moves.push({ actor: state.current, action: dmcAction(observation, action) });
        state = applyAction(state, action);
        events.push(action);
      }
      if (state.phase !== "finished") throw Error(`Match exceeded 700 actions at seed ${seed}`);
      const winner = state.seals[seat] > state.seals[1 - seat] ? 0 : 1;
      wins[winner]++;
      console.log(JSON.stringify({ seed, seat, winner, turns, wins }));
    }
  console.log(JSON.stringify({ checkpoint, opponent: "guidedBehavior", searchMs: budget,
    trees: 8, seeds: [start, start + pairs - 1], pairs, wins,
    meanDecisionMs: elapsed.map((value, i) => value / decisions[i]) }));
} finally {
  python.stdin.end();
  search.stdin.end();
}

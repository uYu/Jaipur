/** Paired complete games: human-replay policy versus pure DMC or default MCTS. */
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { newGame, nextRound, applyAction, actionError } from "../src/game/engine.ts";
import { observe } from "../src/game/ai.ts";
import { chooseTimedWasmActionWithStats } from "../src/game/ai-wasm.ts";
import { dmcActions, dmcState, dmcAction } from "../src/game/dmc.ts";
import { dmcHistory } from "../src/game/dmc-history.ts";
import type { DmcPublicMove } from "../src/game/dmc-history.ts";
import type { Event } from "../src/game/types.ts";
import { HumanReplayMemory, HumanReplayPolicy } from "./human-replay-policy.ts";

const [opponent, modelPath, outputDir, startText = "4200001000", pairsText = "10",
  budgetText = "1000", checkpoint =
    "output/jaipur-douzero-10m-scratch-stable-v2-20260928/model-715.pt"] =
  process.argv.slice(2);
const startSeed = Number(startText), pairs = Number(pairsText), budget = Number(budgetText);
if (!["dmc", "mcts"].includes(opponent) || !modelPath || !outputDir ||
    !Number.isSafeInteger(startSeed) || !Number.isInteger(pairs) || pairs < 1 ||
    !Number.isInteger(budget) || budget < 100)
  throw Error("Usage: compare-human-replay.ts dmc|mcts model.json outputDir [startSeed pairs mctsBudgetMs dmcCheckpoint]");

const policy = new HumanReplayPolicy(modelPath);
mkdirSync(outputDir, { recursive: true });
const gamesPath = join(outputDir, "games.jsonl");
writeFileSync(gamesPath, "");
const worker = opponent === "dmc"
  ? spawn(process.env.JAIPUR_PYTHON ?? "python3", ["scripts/douzero-inference.py", checkpoint],
          { stdio: ["pipe", "pipe", "inherit"] })
  : undefined;
let pending: { resolve: (value: any) => void; reject: (error: Error) => void } | undefined;
if (worker) {
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
  worker.on("exit", (code) => pending?.reject(Error(`DMC inference exited ${code}`)));
}
function dmcCall(message: object): Promise<any> {
  if (!worker) throw Error("DMC worker not started");
  return new Promise((resolve, reject) => {
    if (pending) throw Error("Concurrent DMC inference request");
    pending = { resolve, reject };
    worker.stdin.write(JSON.stringify(message) + "\n");
  });
}

let humanWins = 0, opponentWins = 0;
const decisions = [0, 0], elapsedMs = [0, 0];
try {
  const ready = worker ? await dmcCall({ op: "ready" }) : undefined;
  if (ready && !["jaipur-douzero-history-v1", "jaipur-hierarchical-history-v1"].includes(ready.architecture))
    throw Error(`Unexpected DMC architecture: ${ready.architecture}`);
  const fullSaleOnly = ready?.architecture === "jaipur-hierarchical-history-v1" ||
    ready?.full_sale_only || false;
  for (let seed = startSeed; seed < startSeed + pairs; seed++)
    for (let humanSeat = 0; humanSeat < 2; humanSeat++) {
      let state = newGame(seed);
      const events: Event[] = [];
      const memory = new HumanReplayMemory();
      let moves: DmcPublicMove[] = [];
      let turns = 0;
      while (state.phase !== "finished" && turns < 700) {
        if (state.phase === "roundEnd") {
          state = nextRound(state);
          events.push({ type: "next" });
          moves = [];
          memory.ensure(state.round, state.market, state.seals);
          continue;
        }
        const o = observe(state, events, opponent === "dmc" ? 0.75 : false);
        const side = state.current === humanSeat ? 0 : 1;
        const started = performance.now();
        let action;
        if (side === 0) action = policy.choose(o, state.current, state.round, memory, state.seals);
        else if (opponent === "mcts")
          action = (await chooseTimedWasmActionWithStats(o, budget)).action;
        else {
          const actions = dmcActions(o, fullSaleOnly);
          const answer = await dmcCall({ op: "act", rows: [{
            history: dmcHistory(moves, state.current),
            state: dmcState(o, {
              ownSeals: state.seals[state.current],
              opponentSeals: state.seals[1 - state.current],
              round: state.round,
            }),
            actions: actions.map((candidate) => dmcAction(o, candidate)),
          }] });
          action = actions[answer.indices[0]];
        }
        elapsedMs[side] += performance.now() - started;
        decisions[side]++;
        if (!action || actionError(state, action))
          throw Error(`Illegal action at seed ${seed}, human seat ${humanSeat}, turn ${turns}`);
        moves.push({ actor: state.current, action: dmcAction(o, action) });
        const next = applyAction(state, action);
        memory.update(state.round, state.current, o, action,
                      next.phase === "playing" ? next.market : undefined);
        state = next;
        events.push(action);
        turns++;
      }
      if (state.phase !== "finished") throw Error(`Match exceeded 700 actions at seed ${seed}`);
      const winner = state.seals[0] > state.seals[1] ? 0 : 1;
      const humanWon = winner === humanSeat;
      if (humanWon) humanWins++; else opponentWins++;
      const row = { seed, humanSeat, humanWon, turns, humanWins, opponentWins };
      appendFileSync(gamesPath, JSON.stringify(row) + "\n");
      console.log(JSON.stringify(row));
    }
  const summary = { opponent, checkpoint: opponent === "dmc" ? checkpoint : null,
    mctsBudgetMs: opponent === "mcts" ? budget : null,
    modelPath, startSeed, pairs, games: pairs * 2, humanWins, opponentWins,
    meanDecisionMs: elapsedMs.map((value, side) => value / decisions[side]),
    decisions };
  writeFileSync(join(outputDir, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
  console.log(JSON.stringify(summary));
} finally {
  worker?.stdin.end();
}

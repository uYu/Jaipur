import { parentPort, workerData } from "node:worker_threads";
import { newGame, applyAction, nextRound, actionError } from "../src/game/engine.ts";
import { observe } from "../src/game/ai.ts";
import { dmcActions, dmcState, dmcAction } from "../src/game/dmc.ts";
import { dmcHistory } from "../src/game/dmc-history.ts";
import type { DmcPublicMove } from "../src/game/dmc-history.ts";
import type { State, Event } from "../src/game/types.ts";
import { completedGameRoundMetrics } from "./douzero-round-metrics.ts";

const port = parentPort;
if (!port) throw Error("DouZero actor requires a parent thread");
const { seedStart, gameCount, lanes, maxTurns, iteration, version, epsilon, fullSaleOnly } =
  workerData as {
    seedStart: number;
    gameCount: number;
    lanes: number;
    maxTurns: number;
    iteration: number;
    version: number;
    epsilon: number;
    fullSaleOnly: boolean;
  };

type Sample = { x: number[]; history: number[][]; actor: number };
type Episode = {
  state: State;
  events: Event[];
  moves: DmcPublicMove[];
  samples: Sample[];
  turns: number;
  id: number;
};
let requestId = 0;
let pending: {
  id: number;
  resolve: (indices: number[]) => void;
  reject: (error: Error) => void;
} | undefined;
port.on("message", (message: { kind: string; id: number; indices?: number[]; error?: string }) => {
  if (!pending || message.id !== pending.id) return;
  const current = pending;
  pending = undefined;
  if (message.error) current.reject(Error(message.error));
  else current.resolve(message.indices ?? []);
});
const act = (rows: object[]) => new Promise<number[]>((resolve, reject) => {
  const id = ++requestId;
  pending = { id, resolve, reject };
  port.postMessage({ kind: "act", id, rows });
});
const context = (state: State) => ({
  ownSeals: state.seals[state.current],
  opponentSeals: state.seals[1 - state.current],
  round: state.round,
});
function prepare(e: Episode) {
  if (e.state.phase === "roundEnd") {
    e.state = nextRound(e.state);
    e.events.push({ type: "next" });
    e.moves = [];
  }
  const observation = observe(e.state, e.events, 0.75);
  const actions = dmcActions(observation, fullSaleOnly);
  return {
    actions,
    row: {
      state: dmcState(observation, context(e.state)),
      actions: actions.map((action) => dmcAction(observation, action)),
      history: dmcHistory(e.moves, e.state.current),
    },
  };
}

async function main() {
  let launched = 0;
  let completed = 0;
  let truncated = 0;
  let totalTurns = 0;
  const active: Episode[] = [];
  while (completed + truncated < gameCount) {
    while (active.length < lanes && launched < gameCount) {
      active.push({
        state: newGame(seedStart + launched),
        events: [],
        moves: [],
        samples: [],
        turns: 0,
        id: seedStart + launched++,
      });
    }
    const prepared = active.map(prepare);
    const indices = await act(prepared.map((entry) => entry.row));
    if (indices.length !== active.length) throw Error("Wrong actor score count");
    for (let i = active.length - 1; i >= 0; i--) {
      const e = active[i];
      const p = prepared[i];
      const action = p.actions[indices[i]];
      if (!action || actionError(e.state, action))
        throw Error(`Illegal actor action at seed ${e.id}`);
      e.samples.push({
        actor: e.state.current,
        x: [...p.row.state, ...p.row.actions[indices[i]]],
        history: p.row.history,
      });
      e.moves.push({ actor: e.state.current, action: p.row.actions[indices[i]] });
      e.state = applyAction(e.state, action);
      e.events.push(action);
      e.turns++;
      totalTurns++;
      if (e.state.phase === "finished") {
        const winner = e.state.seals[0] > e.state.seals[1] ? 0 : 1;
        port.postMessage({
          kind: "game",
          game: { seed: e.id, iteration, version, epsilon, winner,
                  turns: e.turns, events: e.events },
          samples: e.samples,
          winner,
          turns: e.turns,
          rounds: e.state.results.length,
          roundMetrics: completedGameRoundMetrics(e.events, e.samples, e.state.results),
          launched,
          totalTurns,
        });
        completed++;
        active.splice(i, 1);
      } else if (e.turns >= maxTurns) {
        port.postMessage({
          kind: "truncated",
          game: { seed: e.id, iteration, version, epsilon, events: e.events },
          turns: e.turns,
          launched,
          totalTurns,
        });
        truncated++;
        active.splice(i, 1);
      }
    }
  }
  port.postMessage({ kind: "done", completed, truncated, totalTurns });
  port.close();
}

main().catch((error) => {
  port.postMessage({ kind: "error", error: String(error?.stack ?? error) });
  port.close();
});

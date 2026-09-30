// Small paired sanity check against the normal agent. Match results from a
// pilot checkpoint do not establish strength or promotion eligibility.
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { newGame, nextRound, applyAction, actionError } from "../src/game/engine.ts";
import { observe, chooseAction } from "../src/game/ai.ts";
import { dmcActions, dmcState, dmcAction } from "../src/game/dmc.ts";
import { dmcHistory } from "../src/game/dmc-history.ts";
import type { DmcPublicMove } from "../src/game/dmc-history.ts";
import type { Event } from "../src/game/types.ts";

const [checkpoint, seedText = "3900000000", pairsText = "1"] = process.argv.slice(2);
const start = Number(seedText), pairs = Number(pairsText);
if (!checkpoint || !Number.isSafeInteger(start) || !Number.isSafeInteger(pairs) ||
    pairs < 1 || pairs > 100)
  throw Error("Usage: evaluate-douzero.ts checkpoint [startSeed pairs]");
const worker = spawn(process.env.JAIPUR_PYTHON ?? "python3", [
  "scripts/douzero-inference.py", checkpoint,
], { stdio: ["pipe", "pipe", "inherit"] });
let pending: ((value: any) => void) | undefined;
createInterface({ input: worker.stdout }).on("line", (line) => {
  const resolve = pending;
  pending = undefined;
  resolve?.(JSON.parse(line));
});
const call = (message: object): Promise<any> => new Promise((resolve) => {
  if (pending) throw Error("Concurrent inference requests");
  pending = resolve;
  worker.stdin.write(JSON.stringify(message) + "\n");
});
const wins = [0, 0];
try {
  const ready = await call({ op: "ready" });
  if (ready.error) throw Error(ready.error);
  const hierarchical = ready.architecture === "jaipur-hierarchical-history-v1";
  const fullSaleOnly = hierarchical || ready.full_sale_only ||
    process.env.JAIPUR_FULL_SALE_ONLY === "1";
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
        const o = observe(state, events, 0.75);
        let action;
        if (state.current === seat) {
          const actions = dmcActions(o, fullSaleOnly);
          const answer = await call({
            op: "act",
            rows: [{
              history: dmcHistory(moves, state.current),
              state: dmcState(o, {
                ownSeals: state.seals[state.current],
                opponentSeals: state.seals[1 - state.current],
                round: state.round,
              }),
              actions: actions.map((a) => dmcAction(o, a)),
            }],
          });
          if (answer.error) throw Error(answer.error);
          action = actions[answer.indices[0]];
        } else action = chooseAction(o, "normal");
        if (!action || actionError(state, action))
          throw Error(`Illegal candidate action at seed ${seed}, turn ${turns}`);
        moves.push({ actor: state.current, action: dmcAction(o, action) });
        state = applyAction(state, action);
        events.push(action);
      }
      if (state.phase !== "finished") throw Error("Match exceeded 700 actions");
      const winner = state.seals[seat] > state.seals[1 - seat] ? 0 : 1;
      wins[winner]++;
      console.log(JSON.stringify({ seed, seat, winner, turns }));
    }
  console.log(JSON.stringify({ wins, pairs, checkpoint, promotion: false }));
} finally {
  worker.stdin.end();
}

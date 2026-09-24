import { appendFileSync, writeFileSync } from "node:fs";
import { dmcClient } from "./dmc-client.ts";
import {
  newGame,
  nextRound,
  applyAction,
  actionError,
} from "../src/game/engine.ts";
import { observe, chooseAction } from "../src/game/ai.ts";
import { dmcActions, dmcState, dmcAction } from "../src/game/dmc.ts";
import type { Event } from "../src/game/types.ts";

const [
  checkpoint,
  output,
  startText = "3100000000",
  pairsText = "16",
  opponent = "normal",
] = process.argv.slice(2);
if (!checkpoint || !output)
  throw Error(
    "Usage: evaluate-dmc.ts checkpoint output startSeed pairs [normal|other-checkpoint]",
  );
const start = Number(startText),
  pairs = Number(pairsText);
const candidate = dmcClient("/tmp/jaipur-dmc-eval", checkpoint);
const rival =
  opponent === "normal" ? null : dmcClient("/tmp/jaipur-dmc-eval", opponent);
const wins = [0, 0],
  roundWins = [0, 0],
  times = [0, 0],
  moves = [0, 0];
let truncated = 0;
writeFileSync(output + ".games.jsonl", "");
try {
  await candidate.call({ op: "ready" });
  if (rival) await rival.call({ op: "ready" });
  for (let seed = start; seed < start + pairs; seed++)
    for (let seat = 0; seat < 2; seat++) {
      let s = newGame(seed),
        turns = 0;
      const events: Event[] = [];
      while (s.phase !== "finished" && turns++ < 700) {
        if (s.phase === "roundEnd") {
          s = nextRound(s);
          events.push({ type: "next" });
          continue;
        }
        const side = s.current === seat ? 0 : 1,
          begin = performance.now();
        const o = observe(s, events, 0.75),
          worker = side === 0 ? candidate : rival;
        let action;
        if (worker) {
          const actions = dmcActions(o);
          const result = await worker.call({
            op: "act",
            epsilon: 0,
            rows: [
              {
                state: dmcState(o, {
                  ownSeals: s.seals[s.current],
                  opponentSeals: s.seals[1 - s.current],
                  round: s.round,
                }),
                actions: actions.map((a) => dmcAction(o, a)),
              },
            ],
          });
          action = actions[result.indices[0]];
        } else action = chooseAction(o, "normal");
        const error = actionError(s, action);
        if (error) throw Error(error);
        times[side] += performance.now() - begin;
        moves[side]++;
        s = applyAction(s, action);
        events.push(action);
      }
      const winner =
        s.phase === "finished"
          ? s.seals[seat] > s.seals[1 - seat]
            ? 0
            : 1
          : null;
      if (winner === null) truncated++;
      else wins[winner]++;
      for (const r of s.results)
        if (r.winner !== null) roundWins[r.winner === seat ? 0 : 1]++;
      appendFileSync(
        output + ".games.jsonl",
        JSON.stringify({
          seed,
          seat,
          candidate: checkpoint,
          baseline: opponent,
          winner,
          events,
        }) + "\n",
      );
      console.log(JSON.stringify({ seed, seat, winner, wins, truncated }));
    }
  const result = {
    checkpoint,
    opponent,
    start,
    pairs,
    wins,
    roundWins,
    truncated,
    meanWallMs: times.map((v, i) => v / moves[i]),
    promotion: false,
  };
  writeFileSync(output + ".json", JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result));
} finally {
  candidate.close();
  rival?.close();
}

import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  newGame,
  applyAction,
  nextRound,
  actionError,
} from "../src/game/engine.ts";
import { observe } from "../src/game/ai.ts";
import { encodeObservation, decodeAction } from "../src/game/ai-wasm.ts";
import type { Event } from "../src/game/types.ts";
import type { Observation } from "../src/game/ai.ts";

const [candidate = "guided", baseline = "old"] = process.argv.slice(2);
const start = Number(process.argv[4] ?? 101);
const pairs = Number(process.argv[5] ?? 5);
const budget = Number(process.argv[6] ?? 50);
if (
  ![start, pairs, budget].every(Number.isFinite) ||
  !Number.isInteger(start) ||
  !Number.isInteger(pairs) ||
  pairs < 1 ||
  pairs > 100 ||
  budget < 1 ||
  budget > 5000
)
  throw Error(
    "Usage: benchmark-native.ts guided old startSeed seedPairs milliseconds",
  );
const dir =
  process.env.JAIPUR_AI_BIN_DIR ?? join(tmpdir(), "jaipur-ai-research");
const search = join(dir, "search"),
  original = join(dir, "original");
const profiles: Record<string, [string, string[]]> = {
  learned: [
    search,
    ["search", "1.4142135623730951", "0", "8", "1", String(budget)],
  ],
  widened: [search, ["search", "0.5", "1", "8", "1", String(budget)]],
  pure: [
    search,
    ["search", "1.4142135623730951", "0", "8", "0", String(budget)],
  ],
  old: [original, [String(budget)]],
  normal: [search, ["normal"]],
  guided: [
    search,
    ["search", "1.4142135623730951", "0", "8", "1", String(budget), "1"],
  ],
};
function client(profile: string) {
  const config = profiles[profile];
  if (!config) throw Error("Unknown profile " + profile);
  const process = spawn(config[0], config[1], {
    stdio: ["pipe", "pipe", "inherit"],
  });
  let pending: ((x: any) => void) | undefined;
  const lines = createInterface({ input: process.stdout });
  lines.on("line", (line) => {
    const callback = pending;
    pending = undefined;
    callback?.(JSON.parse(line));
  });
  process.on("exit", (code) => {
    if (pending) throw Error("Native worker exited " + code);
  });
  return {
    async choose(o: Observation) {
      const x = encodeObservation(o);
      const promise = new Promise<any>((resolve) => (pending = resolve));
      process.stdin.write(
        "100000 " + x.length + " " + Array.from(x).join(" ") + "\n",
      );
      const result = await promise;
      return {
        ...result,
        action: decodeAction(Int32Array.from(result.action), o),
      };
    },
    close() {
      process.stdin.end();
    },
  };
}
const clients = [client(candidate), client(baseline)];
const wins = [0, 0],
  times = [0, 0],
  moves = [0, 0],
  sales: Record<number, number>[] = [{}, {}];
let terminals = 0;
try {
  for (let seed = start; seed < start + pairs; seed++)
    for (let seat = 0; seat < 2; seat++) {
      let s = newGame(seed),
        turns = 0;
      const events: Event[] = [];
      while (s.phase !== "finished" && turns++ < 700) {
        if (s.phase === "roundEnd") {
          events.push({ type: "next" });
          s = nextRound(s);
          continue;
        }
        const side = s.current === seat ? 0 : 1;
        const r = await clients[side].choose(observe(s, events));
        const error = actionError(s, r.action);
        if (error)
          throw Error(
            JSON.stringify({ seed, seat, turns, error, action: r.action }),
          );
        moves[side]++;
        times[side] += r.elapsedMs;
        if (side === 0) terminals += r.terminal ?? 0;
        if (r.action.type === "sell")
          sales[side][r.action.count] = (sales[side][r.action.count] ?? 0) + 1;
        s = applyAction(s, r.action);
        events.push(r.action);
      }
      if (s.phase !== "finished") throw Error("Match exceeded 700 actions");
      const winner = s.seals[seat] > s.seals[1 - seat] ? 0 : 1;
      wins[winner]++;
      console.log(
        JSON.stringify({
          seed,
          seat,
          winner: winner === 0 ? candidate : baseline,
          scores: s.results.map((r) => r.scores),
        }),
      );
    }
  console.log(
    JSON.stringify(
      {
        candidate,
        baseline,
        start,
        pairs,
        budget,
        wins,
        meanMs: times.map((x, i) => x / moves[i]),
        sales,
        terminals,
      },
      null,
      2,
    ),
  );
} finally {
  clients.forEach((c) => c.close());
}

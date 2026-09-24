import { spawn } from "node:child_process";
import { appendFileSync, writeFileSync } from "node:fs";
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
import { dmcActions, dmcState, dmcAction } from "../src/game/dmc.ts";
import type { MatchContext } from "../src/game/dmc.ts";
import { dmcClient } from "./dmc-client.ts";
import { dmcMctsClient } from "./dmc-mcts-client.ts";

const [candidate = "guided", baseline = "old"] = process.argv.slice(2);
const start = Number(process.argv[4] ?? 101);
const pairs = Number(process.argv[5] ?? 5);
const budget = Number(process.argv[6] ?? 50);
const fixedIterations = Number(process.env.JAIPUR_BENCH_ITERATIONS ?? 0);
if (!Number.isSafeInteger(fixedIterations) || fixedIterations < 0)
  throw Error("JAIPUR_BENCH_ITERATIONS must be a nonnegative integer");
if (
  fixedIterations &&
  ![candidate, baseline].every((p) =>
    ["guidedBehavior", "dmcMcts", "dmcMctsPure"].includes(p),
  )
)
  throw Error(
    "Fixed-count mode currently supports guidedBehavior and DMC MCTS profiles only",
  );
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
const logPath = process.env.JAIPUR_BENCH_LOG;
const progressPath = process.env.JAIPUR_BENCH_PROGRESS;
const verbose = process.env.JAIPUR_BENCH_VERBOSE === "1";
if (logPath) writeFileSync(logPath, "");
const search = join(dir, "search"),
  original = join(dir, "original"),
  observable = join(dir, "search-observable");
const profiles: Record<string, [string, string[]]> = {
  factored: [
    search,
    [
      "search-budgeted",
      "1.4142135623730951",
      "0",
      "8",
      "1",
      String(budget),
      "1",
      "0",
      "0",
      "0",
      "0",
      "0",
      "0",
      "0",
      "1",
    ],
  ],
  tactical: [
    search,
    [
      "search-budgeted",
      "1.4142135623730951",
      "0",
      "8",
      "1",
      String(budget),
      "1",
      "0",
      "0",
      "0",
      "0",
      "0",
      "0",
      "1",
    ],
  ],
  beliefRoot: [
    join(dir, "search-belief"),
    [
      "search-budgeted",
      "1.4142135623730951",
      "0",
      "8",
      "1",
      String(budget),
      "1",
      "0",
      "0",
      "0",
      "0",
      "0",
      "1",
    ],
  ],
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
  guidedLegacy: [
    search,
    ["search", "1.4142135623730951", "0", "8", "1", String(budget), "1"],
  ],
  guidedBehavior: [
    search,
    [
      "search-budgeted",
      "1.4142135623730951",
      "0",
      "8",
      "1",
      String(budget),
      "1",
    ],
  ],
  guidedStratified: [
    search,
    [
      "search-budgeted",
      "1.4142135623730951",
      "0",
      "8",
      "1",
      String(budget),
      "1",
      "0",
      "0",
      "0",
      "1",
    ],
  ],
  guidedCloseRisk: [
    search,
    [
      "search-budgeted",
      "1.4142135623730951",
      "0",
      "8",
      "1",
      String(budget),
      "1",
      "0",
      "0",
      "0",
      "0",
      "1",
    ],
  ],
  guided5x: [
    search,
    ["search", "1.4142135623730951", "0", "8", "1", String(budget * 5), "1"],
  ],
  guided5s: [
    search,
    ["search", "1.4142135623730951", "0", "8", "1", "5000", "1"],
  ],
  guided1s: [
    search,
    ["search", "1.4142135623730951", "0", "8", "1", "1000", "1"],
  ],
  exploreHigh: [search, ["search", "2.5", "0", "8", "1", String(budget), "1"]],
  neural: [
    search,
    [
      "search",
      "1.4142135623730951",
      "0",
      "8",
      "1",
      String(budget),
      "1",
      "1",
      "1",
    ],
  ],
  neuralPrior: [
    search,
    [
      "search",
      "1.4142135623730951",
      "0",
      "8",
      "1",
      String(budget),
      "1",
      "1",
      "0",
    ],
  ],
  neuralRoot: [
    search,
    [
      "search",
      "1.4142135623730951",
      "0",
      "8",
      "1",
      String(budget),
      "1",
      "1",
      "0",
      "1",
    ],
  ],
  observablePrior: [
    observable,
    [
      "search-budgeted",
      "1.4142135623730951",
      "0",
      "8",
      "1",
      String(budget),
      "1",
      "1",
      "0",
    ],
  ],
  observableRollout: [
    observable,
    [
      "search-budgeted",
      "1.4142135623730951",
      "0",
      "8",
      "1",
      String(budget),
      "1",
      "0",
      "1",
    ],
  ],
  observableBoth: [
    observable,
    [
      "search-budgeted",
      "1.4142135623730951",
      "0",
      "8",
      "1",
      String(budget),
      "1",
      "1",
      "1",
    ],
  ],
  observableRootRollout: [
    observable,
    [
      "search-budgeted",
      "1.4142135623730951",
      "0",
      "8",
      "1",
      String(budget),
      "1",
      "1",
      "1",
      "1",
    ],
  ],
};
function client(profile: string) {
  if (profile === "dmcMcts" || profile === "dmcMctsPure")
    return dmcMctsClient(
      search,
      profile === "dmcMcts" ? 0.5 : 1,
      fixedIterations,
    );
  if (profile === "dmc") {
    const checkpoint = process.env.JAIPUR_DMC_CHECKPOINT;
    if (!checkpoint) throw Error("Set JAIPUR_DMC_CHECKPOINT for dmc profile");
    const worker = dmcClient(
      join(tmpdir(), "jaipur-dmc-evaluation"),
      checkpoint,
    );
    const ready = worker.call({ op: "ready" });
    return {
      ready,
      async choose(
        o: Observation,
        _remainingMs: number,
        context: MatchContext,
      ) {
        const start = performance.now(),
          actions = dmcActions(o);
        const r = await worker.call({
          op: "act",
          rows: [
            {
              state: dmcState(o, context),
              actions: actions.map((a) => dmcAction(o, a)),
            },
          ],
          epsilon: 0,
        });
        return {
          action: actions[r.indices[0]],
          elapsedMs: performance.now() - start,
          terminal: 0,
        };
      },
      close: () => worker.close(),
    };
  }
  const treeConfig = /^guided(2|4|8|16|32)(?:x([1-9]\d*))?$/.exec(profile);
  const config: [string, string[]] | undefined = treeConfig
    ? [
        search,
        [
          "search",
          "1.4142135623730951",
          "0",
          treeConfig[1],
          "1",
          treeConfig[2] ?? String(budget),
          "1",
        ],
      ]
    : profiles[profile];
  if (!config) throw Error("Unknown profile " + profile);
  const nativeWorker = spawn(config[0], config[1], {
    stdio: ["pipe", "pipe", "inherit"],
  });
  const budgeted = config[1][0] === "search-budgeted";
  let pending: ((x: any) => void) | undefined;
  const lines = createInterface({ input: nativeWorker.stdout });
  lines.on("line", (line) => {
    const callback = pending;
    pending = undefined;
    callback?.(JSON.parse(line));
  });
  nativeWorker.on("exit", (code) => {
    if (pending) throw Error("Native worker exited " + code);
  });
  return {
    ready: Promise.resolve(),
    async choose(
      o: Observation,
      remainingMs = budget,
      _context?: MatchContext,
    ) {
      const x = encodeObservation(
        o,
        profile !== "old" && profile !== "guidedLegacy",
      );
      const promise = new Promise<any>((resolve) => (pending = resolve));
      nativeWorker.stdin.write(
        String(fixedIterations || 100000) +
          " " +
          x.length +
          " " +
          (budgeted
            ? fixedIterations
              ? "0 "
              : Math.max(1, remainingMs).toFixed(3) + " "
            : "") +
          Array.from(x).join(" ") +
          "\n",
      );
      const result = await promise;
      return {
        ...result,
        action: decodeAction(Int32Array.from(result.action), o),
      };
    },
    close() {
      nativeWorker.stdin.end();
    },
  };
}
const clients = [client(candidate), client(baseline)];
const wins = [0, 0],
  times = [0, 0],
  wallTimes = [0, 0],
  observeTimes = [0, 0],
  maxObserveTimes = [0, 0],
  maxTimes = [0, 0],
  maxWallTimes = [0, 0],
  moves = [0, 0],
  sales: Record<number, number>[] = [{}, {}];
const terminals = [0, 0];
const slowDecisions: object[] = [];
try {
  await Promise.all(clients.map((c) => c.ready));
  for (let seed = start; seed < start + pairs; seed++)
    for (let seat = 0; seat < 2; seat++) {
      let s = newGame(seed),
        turns = 0;
      const events: Event[] = [];
      if (verbose)
        console.error(
          `[开局] 种子 ${seed}，候选座位 ${seat}；已完成胜场 ${wins[0]}:${wins[1]}`,
        );
      while (s.phase !== "finished" && turns++ < 700) {
        if (s.phase === "roundEnd") {
          events.push({ type: "next" });
          s = nextRound(s);
          continue;
        }
        const side = s.current === seat ? 0 : 1;
        const profile = side === 0 ? candidate : baseline;
        const belief =
          profile === "old" || profile === "guidedLegacy"
            ? false
            : profile === "guidedBehavior" ||
                profile === "dmc" ||
                profile.startsWith("dmcMcts") ||
                profile === "factored" ||
                profile === "tactical" ||
                profile === "guidedStratified" ||
                profile === "guidedCloseRisk" ||
                profile === "beliefRoot" ||
                profile.startsWith("observable")
              ? 0.75
              : true;
        const decisionStart = performance.now();
        const observation = observe(s, events, belief);
        const observeMs = performance.now() - decisionStart;
        observeTimes[side] += observeMs;
        maxObserveTimes[side] = Math.max(maxObserveTimes[side], observeMs);
        const r = await clients[side].choose(
          observation,
          budget - observeMs - 5,
          {
            ownSeals: s.seals[s.current],
            opponentSeals: s.seals[1 - s.current],
            round: s.round,
          },
        );
        const wallMs = performance.now() - decisionStart;
        wallTimes[side] += wallMs;
        maxWallTimes[side] = Math.max(maxWallTimes[side], wallMs);
        if (fixedIterations && r.simulations !== fixedIterations * 8)
          throw Error(
            `Search count mismatch: ${profile} ran ${r.simulations}, expected ${fixedIterations * 8}`,
          );
        if (
          !fixedIterations &&
          wallMs > budget + 50 &&
          slowDecisions.length < 10
        )
          slowDecisions.push({
            seed,
            seat,
            turns,
            profile,
            observeMs,
            searchMs: r.elapsedMs,
            wallMs,
          });
        const error = actionError(s, r.action);
        if (error)
          throw Error(
            JSON.stringify({ seed, seat, turns, error, action: r.action }),
          );
        moves[side]++;
        times[side] += r.elapsedMs;
        maxTimes[side] = Math.max(maxTimes[side], r.elapsedMs);
        terminals[side] += r.terminal ?? 0;
        if (r.action.type === "sell")
          sales[side][r.action.count] = (sales[side][r.action.count] ?? 0) + 1;
        s = applyAction(s, r.action);
        events.push(r.action);
        if (verbose && (turns % 10 === 0 || s.phase !== "playing")) {
          const points = s.players.map(
            (p) =>
              p.goods.reduce((total, n) => total + n, 0) +
              p.bonuses.reduce((total, n) => total + n, 0),
          );
          const roundResult = s.results.at(-1);
          const settled = s.phase !== "playing" && roundResult;
          const candidatePoints = settled
            ? settled.scores[seat]
            : points[seat];
          const baselinePoints = settled
            ? settled.scores[1 - seat]
            : points[1 - seat];
          console.error(
            `[进展] 种子 ${seed} 座位 ${seat} 第 ${s.round} 轮 第 ${turns} 手` +
              ` | 印章 ${s.seals[seat]}:${s.seals[1 - seat]}` +
              ` | ${settled ? "本轮结算" : "本轮已得筹码"} ${candidatePoints}:${baselinePoints}` +
              ` | 阶段 ${s.phase}`,
          );
        }
        if (progressPath && (turns % 20 === 0 || s.phase !== "playing"))
          writeFileSync(
            progressPath,
            JSON.stringify({
              seed,
              seat,
              round: s.round,
              turns,
              phase: s.phase,
              wins,
            }),
          );
      }
      if (s.phase !== "finished") throw Error("Match exceeded 700 actions");
      const winner = s.seals[seat] > s.seals[1 - seat] ? 0 : 1;
      wins[winner]++;
      if (verbose)
        console.error(
          `[完赛] 种子 ${seed} 座位 ${seat} ${winner === 0 ? "候选胜" : "基线胜"}` +
            ` | 已完成胜场 ${wins[0]}:${wins[1]}`,
        );
      console.log(
        JSON.stringify({
          seed,
          seat,
          winner: winner === 0 ? candidate : baseline,
          scores: s.results.map((r) => r.scores),
        }),
      );
      if (logPath)
        appendFileSync(
          logPath,
          JSON.stringify({
            candidate,
            baseline,
            budget,
            fixedIterationsPerTree: fixedIterations || null,
            seed,
            seat,
            winner,
            events,
          }) + "\n",
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
        comparison: fixedIterations ? "equal-search-count" : "equal-time",
        fixedIterationsPerTree: fixedIterations || null,
        simulationsPerDecision: fixedIterations ? fixedIterations * 8 : null,
        searchCountVerifiedEveryDecision: !!fixedIterations,
        timeLimitMs: fixedIterations ? null : budget,
        wins,
        meanMs: times.map((x, i) => x / moves[i]),
        meanWallMs: wallTimes.map((x, i) => x / moves[i]),
        meanObserveMs: observeTimes.map((x, i) => x / moves[i]),
        maxObserveMs: maxObserveTimes,
        maxMs: maxTimes,
        maxWallMs: maxWallTimes,
        slowDecisions,
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

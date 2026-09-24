import {
  readFileSync,
  writeFileSync,
  appendFileSync,
  mkdirSync,
} from "node:fs";
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
import { chooseAction, observe } from "../src/game/ai.ts";
import { encodeObservation, decodeAction } from "../src/game/ai-wasm.ts";
import { playerView, publicEvent } from "../src/game/information.ts";
import type { PublicEvent } from "../src/game/information.ts";
import type { Event, State } from "../src/game/types.ts";
import { InformationNetwork } from "../src/game/information-network.ts";
import { dmcClient } from "./dmc-client.ts";
import { dmcActions, dmcAction, dmcState } from "../src/game/dmc.ts";
import { informationSearch } from "../src/game/information-search.ts";
const [
    directory,
    output,
    candidate = "policy",
    baseline = "normal",
    seedText = "51001",
    pairsText = "32",
  ] = process.argv.slice(2),
  start = Number(seedText),
  pairs = Number(pairsText);
if (
  !directory ||
  !output ||
  !Number.isInteger(start) ||
  !Number.isInteger(pairs) ||
  pairs < 1
)
  throw Error("directory output candidate baseline seed pairs");
for (const p of [candidate, baseline])
  if (
    ![
      "policy",
      "referencePolicy",
      "normal",
      "guidedBehavior",
      "search1",
      "search4",
      "dmc",
    ].includes(p)
  )
    throw Error("Unknown profile");
mkdirSync(output, { recursive: true });
const log = `${output}/${candidate}-${baseline}-games.jsonl`;
try {
  if (readFileSync(log, "utf8").length)
    throw Error("Refusing to overwrite games");
} catch (e) {
  if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
}
const network = new InformationNetwork(
  JSON.parse(readFileSync(`${directory}/model.json`, "utf8")),
);
const reference = [candidate, baseline].includes("referencePolicy")
  ? new InformationNetwork(
      JSON.parse(
        readFileSync(
          process.env.JAIPUR_REFERENCE_MODEL ??
            "analysis/information-pilot-2026-09-24/ppo/model.json",
          "utf8",
        ),
      ),
    )
  : null;
const dmc = [candidate, baseline].includes("dmc")
  ? dmcClient(
      join(tmpdir(), "jaipur-information-dmc-eval"),
      "analysis/dmc-resume-fast-2026-09-24/model-738.pt",
    )
  : null;
if (dmc) await dmc.call({ op: "ready" });
let rng = 987654321;
const random = () => {
  rng = (Math.imul(1664525, rng) + 1013904223) >>> 0;
  return rng / 4294967296;
};
const native = [candidate, baseline].includes("guidedBehavior")
  ? spawn(
      join(tmpdir(), "jaipur-ai-research/search"),
      ["search-budgeted", "1.4142135623730951", "0", "8", "1", "1000", "1"],
      { stdio: ["pipe", "pipe", "inherit"] },
    )
  : null;
let pending:
  { resolve: (x: any) => void; reject: (e: Error) => void } | undefined;
if (native) {
  createInterface({ input: native.stdout! }).on("line", (line) => {
    const p = pending;
    pending = undefined;
    try {
      p?.resolve(JSON.parse(line));
    } catch (e) {
      p?.reject(e as Error);
    }
  });
  native.on("error", (e) => pending?.reject(e));
  native.on("exit", (code) => pending?.reject(Error("Native exited " + code)));
}
async function decide(
  profile: string,
  s: State,
  h: PublicEvent[],
  events: Event[],
) {
  const t = performance.now(),
    v = playerView(s, s.current, h);
  if (profile === "dmc") {
    const o = observe(s, events, 0.75),
      actions = dmcActions(o);
    const r = await dmc!.call({
      op: "act",
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
      epsilon: 0,
    });
    return {
      action: actions[r.indices[0]],
      stats: { elapsedMs: performance.now() - t },
    };
  }
  if (profile === "normal")
    return {
      action: chooseAction(v.observation, "normal"),
      stats: { elapsedMs: performance.now() - t },
    };
  if (profile === "guidedBehavior") {
    const o = observe(s, events, 0.75),
      x = encodeObservation(o, true),
      remaining = Math.max(1, 1000 - (performance.now() - t));
    const r = await new Promise<any>((resolve, reject) => {
      pending = { resolve, reject };
      native!.stdin!.write(
        `100000 ${x.length} ${remaining.toFixed(3)} ${Array.from(x).join(" ")}\n`,
      );
    });
    return {
      action: decodeAction(Int32Array.from(r.action), o),
      stats: { elapsedMs: performance.now() - t },
    };
  }
  if (profile === "policy" || profile === "referencePolicy") {
    const p = (profile === "referencePolicy" ? reference! : network).predict(v);
    return {
      action: p.actions[p.logits.indexOf(Math.max(...p.logits))],
      stats: { elapsedMs: performance.now() - t },
    };
  }
  const r = informationSearch(v, network, {
    budgetMs: Math.max(1, 1000 - (performance.now() - t)),
    depth: profile === "search4" ? 4 : 1,
    random,
  });
  return { ...r, stats: { ...r.stats, elapsedMs: performance.now() - t } };
}
const wins = [0, 0],
  games = [];
try {
  for (let seed = start; seed < start + pairs; seed++)
    for (const seat of [0, 1]) {
      let s = newGame(seed),
        h: PublicEvent[] = [],
        events: Event[] = [],
        moves = 0;
      const timings: number[][] = [[], []],
        searchStats: object[] = [];
      console.log(
        `[开局] ${candidate} vs ${baseline} seed=${seed} 候选座位=${seat}`,
      );
      while (s.phase !== "finished") {
        if (moves > 1500) throw Error("Match exceeded 1500 actions");
        if (s.phase === "roundEnd") {
          const next = nextRound(s),
            a = { type: "next" } as const;
          h = [...h, publicEvent(s, next, a)];
          events = [...events, a];
          s = next;
          continue;
        }
        const who = s.current === seat ? 0 : 1,
          profile = who === 0 ? candidate : baseline,
          r = await decide(profile, s, h, events),
          error = actionError(s, r.action);
        if (error) throw Error(error);
        timings[who].push(r.stats.elapsedMs);
        if ("completed" in r.stats)
          searchStats.push({ player: who, ...r.stats });
        const next = applyAction(s, r.action);
        h = [...h, publicEvent(s, next, r.action)];
        events = [...events, r.action];
        s = next;
        moves++;
        if (moves % 10 === 0) {
          const scores = s.players.map(
            (p) =>
              p.goods.reduce((a, b) => a + b, 0) +
              p.bonuses.reduce((a, b) => a + b, 0),
          );
          console.log(
            `[对局进度] ${candidate}/${baseline} seed=${seed} 座位=${seat} 第${moves}手 第${s.round}轮 当前筹码分(未计骆驼) ${scores[seat]}:${scores[1 - seat]} 印章 ${s.seals[seat]}:${s.seals[1 - seat]}`,
          );
          console.log(
            JSON.stringify({
              type: "moves",
              seed,
              seat,
              moves,
              round: s.round,
              candidate_score: scores[seat],
              baseline_score: scores[1 - seat],
              candidate_seals: s.seals[seat],
              baseline_seals: s.seals[1 - seat],
            }),
          );
        }
      }
      const winner = s.seals[seat] >= 2 ? 0 : 1;
      wins[winner]++;
      const game = {
        candidate,
        baseline,
        seed,
        seat,
        winner,
        events,
        timings,
        searchStats,
      };
      appendFileSync(log, JSON.stringify(game) + "\n");
      games.push(game);
      console.log(
        JSON.stringify({
          type: "game",
          seed,
          seat,
          winner,
          completed: games.length,
          candidate_wins: wins[0],
          baseline_wins: wins[1],
        }),
      );
    }
} finally {
  native?.stdin?.end();
  dmc?.close();
}
const all = games.flatMap((g) => g.searchStats) as any[],
  times = games.flatMap((g) => g.timings[0]).sort((a, b) => a - b);
const summary = {
  candidate,
  baseline,
  start,
  pairs,
  wins,
  games: games.length,
  budgetMs: 1000,
  candidateMeanMs: times.reduce((a, b) => a + b, 0) / times.length,
  candidateP95Ms: times[Math.floor(times.length * 0.95)],
  candidateMaxMs: times.at(-1),
  searchDecisions: all.length,
  meanSimulations:
    all.reduce((s, r) => s + r.completed, 0) / Math.max(1, all.length),
  fallbacks: all.filter((r) => r.fallback).length,
  meanUnvisitedFraction:
    all.reduce((s, r) => s + r.unvisited / r.actions, 0) /
    Math.max(1, all.length),
};
writeFileSync(
  `${output}/${candidate}-${baseline}-summary.json`,
  JSON.stringify(summary, null, 2) + "\n",
);
console.log(JSON.stringify({ type: "summary", ...summary }));

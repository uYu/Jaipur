// Pure v147126 self-play; rule proofs observe decisions without changing actions.
// Miss = no round win within the next one/two OWN actions, irrespective of later wins.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { observe } from "../src/game/ai.ts";
import type { Observation } from "../src/game/ai.ts";
import { dmcAction, dmcActions, dmcState } from "../src/game/dmc.ts";
import { dmcHistory } from "../src/game/dmc-history.ts";
import type { DmcPublicMove } from "../src/game/dmc-history.ts";
import { DouzeroNetwork } from "../src/game/douzero-network.ts";
import { findEndgameWinningAction } from "../src/game/endgame.ts";
import { findImmediateWinningAction } from "../src/game/immediate-win.ts";
import {
  actionError,
  applyAction,
  newGame,
  nextRound,
} from "../src/game/engine.ts";
import { replay } from "../src/game/storage.ts";
import type { Action, Event, State } from "../src/game/types.ts";

const [directory, countText = "200", seedText = "3611070000", lanesText = "8"] =
  process.argv.slice(2);
const count = Number(countText),
  seedStart = Number(seedText),
  lanes = Number(lanesText);
assert.ok(
  directory &&
    Number.isSafeInteger(count) &&
    count > 0 &&
    Number.isSafeInteger(seedStart) &&
    seedStart >= 0 &&
    seedStart + count < 2 ** 32 &&
    Number.isSafeInteger(lanes) &&
    lanes > 0,
  "Usage: audit-model-endgame.ts output-directory [matches seedStart lanes]",
);
const output = resolve(directory);
mkdirSync(output);
const modelPath = new URL(
  "../src/game/models/legacy-round-147126.bin",
  import.meta.url,
);
const bytes = readFileSync(modelPath);
const model = new DouzeroNetwork(
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
);
assert.equal(model.version, 147126);
const config = {
  modelVersion: model.version,
  modelSha256: createHash("sha256").update(bytes).digest("hex"),
  matches: count,
  targetSeals: 2,
  seedStart,
  lanes,
  policy: "pure-browser-model-self-play",
  encoding:
    "same-as-browser; zero seals/round context; posterior takePreference=0.75",
  proofBudget: {
    maxNodes: 2000,
    maxMs: "unlimited for reproducible offline proofs",
  },
  missDefinition:
    "No round win by the end of the next horizon own actions; a later win still counts as missed",
  parity:
    "JS checks initial rows, every 100th decision, every rule opportunity and all near ties",
};
writeFileSync(join(output, "config.json"), JSON.stringify(config, null, 2));
const python = spawn(
  process.env.JAIPUR_PYTHON ?? "python3",
  ["scripts/score-browser-model.py", modelPath.pathname],
  {
    stdio: ["pipe", "pipe", "inherit"],
    env: {
      ...process.env,
      OPENBLAS_NUM_THREADS: "1",
      VECLIB_MAXIMUM_THREADS: "1",
      OMP_NUM_THREADS: "1",
    },
  },
);
let pending:
  { resolve: (r: any) => void; reject: (e: Error) => void } | undefined;
createInterface({ input: python.stdout }).on("line", (line) => {
  const p = pending;
  pending = undefined;
  if (!p) return;
  try {
    const r = JSON.parse(line);
    if (r.error) p.reject(Error(r.error));
    else p.resolve(r);
  } catch (error) {
    p.reject(error as Error);
  }
});
python.on("error", (e) => pending?.reject(e));
python.on("exit", (code) => pending?.reject(Error(`Scorer exited ${code}`)));
function call(r: object): Promise<any> {
  assert.equal(pending, undefined);
  return new Promise((resolve, reject) => {
    pending = { resolve, reject };
    python.stdin.write(JSON.stringify(r) + "\n");
  });
}
const argmax = (scores: ArrayLike<number>) => {
  let best = 0;
  for (let i = 1; i < scores.length; i++)
    if (scores[i] > scores[best]) best = i;
  return best;
};
type Case = {
  id: string;
  seed: number;
  actor: number;
  round: number;
  turn: number;
  eventIndex: number;
  horizon: 1 | 2;
  deadline: number;
  ruleAction: Action;
  modelAction: Action;
  modelValue: number;
  ruleValue: number;
  firstActionMatchesRule: boolean;
  observation: Observation;
  searchMs: number;
  resolved: boolean;
  missed?: boolean;
  resolvedAtEvent?: number;
  ownMovesAtResolution?: number;
  roundWinner?: number | null;
  roundScores?: number[];
  matchWinner?: number;
};
type Episode = {
  seed: number;
  state: State;
  events: Event[];
  moves: DmcPublicMove[];
  ownMoves: number[];
  cases: Case[];
  turns: number;
};
let launched = 0,
  completed = 0,
  decisions = 0,
  parityChecks = 0,
  parityArgmaxDifferences = 0;
let nearTieChecks = 0,
  maximumScoreError = 0,
  rounds = 0,
  lastProgress = 0;
const active: Episode[] = [];
const allCases: Case[] = [];
const started = performance.now();

function summarize() {
  const byHorizon = [1, 2].map((horizon) => {
    const cases = allCases.filter((c) => c.horizon === horizon);
    const missed = cases.filter((c) => c.missed);
    return {
      horizon,
      opportunities: cases.length,
      realized: cases.length - missed.length,
      missed: missed.length,
      missRate: cases.length ? missed.length / cases.length : 0,
      gamesWithMisses: new Set(missed.map((c) => c.seed)).size,
      roundsWithMisses: new Set(missed.map((c) => `${c.seed}:${c.round}`)).size,
      firstActionMatchedButMissed: missed.filter(
        (c) => c.firstActionMatchesRule,
      ).length,
      missedThenLostRound: missed.filter(
        (c) => c.roundWinner !== null && c.roundWinner !== c.actor,
      ).length,
      missedButWonRoundLater: missed.filter((c) => c.roundWinner === c.actor)
        .length,
    };
  });
  return {
    ...config,
    completed,
    rounds,
    decisions,
    byHorizon,
    gamesWithAnyMiss: new Set(
      allCases.filter((c) => c.missed).map((c) => c.seed),
    ).size,
    parityChecks,
    nearTieChecks,
    parityArgmaxDifferences,
    maximumScoreError,
    elapsedSeconds: (performance.now() - started) / 1000,
    allActionsLegal: true,
    allCompletedMatchesReplayed: true,
  };
}

try {
  assert.equal((await call({ op: "ready" })).version, model.version);
  while (completed < count) {
    while (active.length < lanes && launched < count) {
      const seed = seedStart + launched++;
      active.push({
        seed,
        state: newGame(seed),
        events: [],
        moves: [],
        ownMoves: [0, 0],
        cases: [],
        turns: 0,
      });
    }
    const prepared = active.map((e) => {
      if (e.state.phase === "roundEnd") {
        e.state = nextRound(e.state);
        e.events.push({ type: "next" });
        e.moves = [];
        e.ownMoves = [0, 0];
      }
      const observation = observe(e.state, e.events, 0.75);
      const actions = dmcActions(observation);
      const row = {
        history: dmcHistory(e.moves, e.state.current),
        state: dmcState(observation, {
          ownSeals: 0,
          opponentSeals: 0,
          round: 0,
        }),
        actions: actions.map((a) => dmcAction(observation, a)),
      };
      const t = performance.now();
      const one = findImmediateWinningAction(observation);
      const proof =
        one ??
        findEndgameWinningAction(observation, {
          maxNodes: 2000,
          maxMs: Infinity,
        });
      return {
        observation,
        actions,
        row,
        proof,
        horizon: one ? (1 as const) : (2 as const),
        searchMs: performance.now() - t,
      };
    });
    const answer = await call({
      op: "score",
      rows: prepared.map((p) => p.row),
    });
    assert.equal(answer.scores.length, active.length);
    for (let i = active.length - 1; i >= 0; i--) {
      const e = active[i],
        p = prepared[i];
      let scores: ArrayLike<number> = answer.scores[i];
      let best = argmax(scores);
      const ordered = Array.from(scores).sort((a, b) => b - a);
      const nearTie = ordered.length > 1 && ordered[0] - ordered[1] < 0.00002;
      if (decisions < 40 || decisions % 100 === 0 || p.proof || nearTie) {
        const reference = model.score(
          p.row.history,
          p.row.state,
          p.row.actions,
        );
        parityChecks++;
        if (nearTie) nearTieChecks++;
        for (let j = 0; j < reference.length; j++)
          maximumScoreError = Math.max(
            maximumScoreError,
            Math.abs(reference[j] - scores[j]),
          );
        assert.ok(
          maximumScoreError < 0.00001,
          `Backend parity error ${maximumScoreError}`,
        );
        if (argmax(reference) !== best) parityArgmaxDifferences++;
        scores = reference;
        best = argmax(reference); // Browser behavior wins any numerical tie.
      }
      const action = p.actions[best],
        actor = e.state.current;
      assert.equal(actionError(e.state, action), null);
      if (p.proof) {
        const key = JSON.stringify(dmcAction(p.observation, p.proof));
        const ruleIndex = p.row.actions.findIndex(
          (a) => JSON.stringify(a) === key,
        );
        assert.ok(ruleIndex >= 0);
        e.cases.push({
          id: `${e.seed}:${e.events.length}`,
          seed: e.seed,
          actor,
          round: e.state.round,
          turn: e.state.turn,
          eventIndex: e.events.length,
          horizon: p.horizon,
          deadline: e.ownMoves[actor] + p.horizon,
          ruleAction: p.proof,
          modelAction: action,
          modelValue: scores[best],
          ruleValue: scores[ruleIndex],
          firstActionMatchesRule: JSON.stringify(p.row.actions[best]) === key,
          observation: {
            ...p.observation,
            opponentHandDistribution: undefined,
          },
          searchMs: p.searchMs,
          resolved: false,
        });
      }
      e.moves.push({ actor, action: p.row.actions[best] });
      e.state = applyAction(e.state, action);
      e.events.push(action);
      e.turns++;
      decisions++;
      e.ownMoves[actor]++;
      const result =
        e.state.phase === "playing" ? undefined : e.state.results.at(-1)!;
      for (const c of e.cases) {
        if (c.round !== e.state.round) continue;
        if (!c.resolved && (result || e.ownMoves[c.actor] >= c.deadline)) {
          c.resolved = true;
          c.missed =
            !result ||
            result.winner !== c.actor ||
            e.ownMoves[c.actor] > c.deadline;
          c.resolvedAtEvent = e.events.length - 1;
          c.ownMovesAtResolution = e.ownMoves[c.actor];
        }
        if (result) {
          c.roundWinner = result.winner;
          c.roundScores = result.scores;
        }
      }
      if (result) rounds++;
      if (e.state.phase === "finished") {
        const winner = e.state.seals[0] > e.state.seals[1] ? 0 : 1;
        assert.ok(e.cases.every((c) => c.resolved));
        for (const c of e.cases) c.matchWinner = winner;
        assert.deepEqual(
          replay({
            version: 1,
            seed: e.seed,
            difficulty: "hard",
            events: e.events,
          }),
          e.state,
        );
        allCases.push(...e.cases);
        appendFileSync(
          join(output, "cases.jsonl"),
          e.cases.map((c) => JSON.stringify(c)).join("\n") +
            (e.cases.length ? "\n" : ""),
        );
        appendFileSync(
          join(output, "games.jsonl"),
          JSON.stringify({
            seed: e.seed,
            difficulty: "hard",
            version: 1,
            events: e.events,
            winner,
            results: e.state.results,
            turns: e.turns,
            opportunities: e.cases.length,
            misses: e.cases.filter((c) => c.missed).length,
          }) + "\n",
        );
        active.splice(i, 1);
        completed++;
        assert.ok(e.turns <= 1000);
      } else if (e.turns >= 1000)
        throw Error(`Match exceeded 1000 actions: ${e.seed}`);
    }
    if (performance.now() - lastProgress > 5000 || completed === count) {
      lastProgress = performance.now();
      const progress = {
        ...summarize(),
        activeMatches: active.length,
        activeTurns: active.map((e) => e.turns),
        activeOpportunities: active.reduce((s, e) => s + e.cases.length, 0),
      };
      writeFileSync(
        join(output, "progress.json"),
        JSON.stringify(progress, null, 2),
      );
      console.log(
        JSON.stringify({
          completed,
          decisions,
          rounds,
          opportunities: allCases.length,
          misses: allCases.filter((c) => c.missed).length,
          elapsedSeconds: progress.elapsedSeconds,
        }),
      );
    }
  }
  const summary = summarize();
  writeFileSync(join(output, "summary.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
} finally {
  python.stdin.end();
}

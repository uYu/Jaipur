/** Collect on-policy search targets and match outcomes for a small AlphaZero-like loop. */
import { spawn } from "node:child_process";
import { appendFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { actionError, applyAction, newGame, nextRound } from "../src/game/engine.ts";
import { observe } from "../src/game/ai.ts";
import { decodeAction, encodeObservation } from "../src/game/ai-wasm.ts";
import type { Action, Event } from "../src/game/types.ts";

const [output, binary, startText, gamesText, iterationsText,
  mixText = "0.5", priorText = "1"] = process.argv.slice(2);
const start = Number(startText), games = Number(gamesText);
const iterations = Number(iterationsText);
const rootPolicyMix = Number(mixText);
if (!output || !binary || !Number.isSafeInteger(start) || start < 0 ||
    !Number.isSafeInteger(games) || games < 1 ||
    !Number.isSafeInteger(iterations) || iterations < 1 ||
    start + games > 0x100000000 || !Number.isFinite(rootPolicyMix) ||
    rootPolicyMix < 0 || rootPolicyMix > 1 || !["0", "1"].includes(priorText)) {
  throw Error("Usage: selfplay-belief-zero.ts output.jsonl search-belief startSeed games iterationsPerTree [rootPolicyMix] [enableModelPrior:0|1]");
}

const worker = spawn(binary,
  ["teacher", "1.4142135623730951", "0", "8", "1", "0", "1",
    "0", "0", "0", "0", "0", priorText, "0", "0", "0",
    String(rootPolicyMix)],
  { stdio: ["pipe", "pipe", "inherit"] });
let pending: { resolve: (row: any) => void; reject: (error: Error) => void } | undefined;
let failure: Error | undefined;
const fail = (error: Error) => {
  failure = error;
  pending?.reject(error);
  pending = undefined;
};
worker.on("error", fail);
worker.on("exit", (code) => fail(Error(`Search worker exited ${code}`)));
worker.stdin.on("error", fail);
createInterface({ input: worker.stdout }).on("line", (line) => {
  const request = pending;
  pending = undefined;
  try { request?.resolve(JSON.parse(line)); }
  catch (error) { request?.reject(error as Error); }
});

function random(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

async function search(encoded: Int32Array) {
  if (failure) throw failure;
  if (pending) throw Error("Concurrent search request");
  const response = new Promise<any>((resolve, reject) => { pending = { resolve, reject }; });
  worker.stdin.write(`${iterations} ${encoded.length} ${Array.from(encoded).join(" ")}\n`);
  const row = await response;
  if (row.simulations !== 8 * iterations || !Array.isArray(row.actions) ||
      row.actions.length === 0 || row.features?.length !== 142) {
    throw Error("Invalid search target or simulation count");
  }
  const mass = row.actions.reduce((sum: number, a: any) => sum + a.policy, 0);
  if (!Number.isFinite(mass) || Math.abs(mass - 1) > 1e-4) {
    throw Error(`Invalid root visit mass: ${mass}`);
  }
  return row;
}

writeFileSync(output, "");
let totalPositions = 0;
let completed = 0, truncated = 0;
try {
  for (let seed = start; seed < start + games; seed++) {
    let state = newGame(seed);
    const events: Event[] = [];
    const rows: any[] = [];
    const nextRandom = random(seed ^ 0x9e3779b9);
    let decisions = 0;
    while (state.phase !== "finished" && decisions < 700) {
      if (state.phase === "roundEnd") {
        state = nextRound(state);
        events.push({ type: "next" });
        continue;
      }
      const observation = observe(state, events, 0.75);
      const row = await search(encodeObservation(observation, true));
      const stochastic = state.turn < 10;
      let selected: any;
      if (stochastic) {
        const target = nextRandom();
        let cumulative = 0;
        selected = row.actions.at(-1);
        for (const item of row.actions) {
          cumulative += item.policy;
          if (target < cumulative) { selected = item; break; }
        }
      } else {
        selected = row.actions.reduce((best: any, item: any) =>
          item.policy > best.policy ? item : best);
      }
      const action: Action = decodeAction(Int32Array.from(selected.action), observation);
      const error = actionError(state, action);
      if (error) throw Error(`Seed ${seed}, turn ${state.turn}: ${error}`);
      row.seed = seed;
      row.actor = state.current;
      row.round = state.round;
      row.turn = state.turn;
      // The policy sees the standard 142 observable features. Match value also
      // needs the seal score; replace three count features already summarized
      // by goods scores in a separate value-only input.
      row.valueFeatures = [
        ...row.features.slice(0, -3),
        state.round / 3,
        state.seals[state.current] / 2,
        state.seals[1 - state.current] / 2,
      ];
      row.seals = [...state.seals];
      row.sampled = stochastic;
      row.teacherSimulations = row.simulations;
      delete row.simulations;
      rows.push(row);
      state = applyAction(state, action);
      events.push(action);
      decisions++;
    }
    if (state.phase !== "finished") {
      truncated++;
      console.error(JSON.stringify({ seed, truncated: true, decisions }));
      continue;
    }
    const winner = state.seals[0] > state.seals[1] ? 0 : 1;
    for (const row of rows) {
      row.outcome = Number(row.actor === winner);
      appendFileSync(output, JSON.stringify(row) + "\n");
    }
    totalPositions += rows.length;
    completed++;
    console.error(JSON.stringify({ seed, matchWinner: winner, positions: rows.length,
      cumulativePositions: totalPositions }));
  }
} finally {
  worker.stdin.end();
}
if (!completed || truncated > Math.max(1, Math.ceil(games * 0.05)))
  throw Error(`Too many incomplete matches: ${completed}/${games} completed`);
console.error(JSON.stringify({ output, games, positions: totalPositions,
  completed, truncated,
  teacherSimulationsPerPosition: iterations * 8 }));

// Compare DouZero's legal-action ranking with an unmodified MCTS root search
// on held-out, replayable evaluation positions. No training occurs here.
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { newGame, nextRound, applyAction, actionError } from "../src/game/engine.ts";
import { observe } from "../src/game/ai.ts";
import { encodeObservation, decodeAction } from "../src/game/ai-wasm.ts";
import { dmcActions, dmcAction, dmcState } from "../src/game/dmc.ts";
import { dmcHistory } from "../src/game/dmc-history.ts";
import { dmcClient } from "./dmc-client.ts";
import type { Event, Action } from "../src/game/types.ts";
import type { DmcPublicMove } from "../src/game/dmc-history.ts";

const [sourcesText, output, sampleText, iterationText, ...checkpoints] =
  process.argv.slice(2);
const sampleCount = Number(sampleText), iterations = Number(iterationText);
if (!sourcesText || !output || !checkpoints.length ||
    !Number.isSafeInteger(sampleCount) || sampleCount < 1 ||
    !Number.isSafeInteger(iterations) || iterations < 1)
  throw Error("Usage: audit-douzero-prior.ts input1[,input2] output.json 128 512 checkpoint...");

type Snapshot = {
  seed: number; seat: number; turn: number; observation: ReturnType<typeof observe>;
  history: number[][]; context: { ownSeals: number; opponentSeals: number; round: number };
};
const snapshots: Snapshot[] = [];
for (const source of sourcesText.split(",")) {
  for (const line of readFileSync(source, "utf8").trim().split("\n")) {
    if (!line) continue;
    const game = JSON.parse(line);
    let state = newGame(game.seed);
    const events: Event[] = [];
    let moves: DmcPublicMove[] = [], turn = 0;
    for (const action of game.events as Event[]) {
      if (action.type === "next") {
        state = nextRound(state);
        events.push(action);
        moves = [];
        continue;
      }
      if (state.phase !== "playing") throw Error(`Unexpected phase in ${source}`);
      const observation = observe(state, events, 0.75);
      snapshots.push({
        seed: game.seed, seat: game.seat, turn: turn++, observation,
        history: dmcHistory(moves, state.current),
        context: { ownSeals: state.seals[state.current],
          opponentSeals: state.seals[1 - state.current], round: state.round },
      });
      const error = actionError(state, action as Action);
      if (error) throw Error(`Invalid replay action: ${error}`);
      moves.push({ actor: state.current, action: dmcAction(observation, action as Action) });
      state = applyAction(state, action as Action);
      events.push(action);
    }
  }
}
// Deterministic spread over multiple matches, independent of model scores.
const take = Math.min(sampleCount, snapshots.length);
const selected = Array.from({ length: take }, (_, i) =>
  snapshots[Math.floor((i + 0.5) * snapshots.length / take)]);
const native = spawn(join(process.env.JAIPUR_AI_BIN_DIR ?? join(tmpdir(), "jaipur-ai-research"), "search"),
  ["audit-search", "1.4142135623730951", "0", "8", "1", "0", "1"],
  { stdio: ["pipe", "pipe", "inherit"] });
let pending: { resolve: (x: any) => void; reject: (e: Error) => void } | undefined;
createInterface({ input: native.stdout }).on("line", (line) => {
  const call = pending; pending = undefined;
  try { call?.resolve(JSON.parse(line)); } catch (error) { call?.reject(error as Error); }
});
native.on("error", (error) => pending?.reject(error));
native.on("exit", (code) => pending?.reject(Error(`Native search exited ${code}`)));
function search(observation: Snapshot["observation"]) {
  const encoded = encodeObservation(observation, true);
  return new Promise<any>((resolve, reject) => {
    if (pending) throw Error("Concurrent native request");
    pending = { resolve, reject };
    native.stdin.write(`${iterations} ${encoded.length} ${Array.from(encoded).join(" ")}\n`);
  });
}
const models = checkpoints.map((checkpoint, i) => ({
  checkpoint,
  client: dmcClient(join(tmpdir(), `jaipur-douzero-prior-audit-${process.pid}-${i}`),
    checkpoint, "scripts/douzero-learner.py",
    ["--device", "cpu", "--scorer-only", "--full-sale-only"]),
}));
const signature = (observation: Snapshot["observation"], action: Action) =>
  JSON.stringify(dmcAction(observation, action));
const rows: any[] = [];
try {
  await Promise.all(models.map((m) => m.client.call({ op: "ready" })));
  for (const snapshot of selected) {
    const { observation, context, history } = snapshot;
    const all = dmcActions(observation), full = dmcActions(observation, true);
    const result = await search(observation);
    if (result.simulations !== iterations * 8)
      throw Error(`Unexpected search count: ${result.simulations}`);
    const mass = new Map<string, number>();
    for (const item of result.root) {
      const action = decodeAction(Int32Array.from(item.action), observation);
      mass.set(signature(observation, action), item.visitMass);
    }
    if (mass.size !== all.length) throw Error(`Root action mismatch: ${mass.size}/${all.length}`);
    const fullKeys = new Set(full.map((action) => signature(observation, action)));
    const partialSaleMass = result.root.reduce((sum: number, item: any) => {
      const action = decodeAction(Int32Array.from(item.action), observation);
      return sum + (fullKeys.has(signature(observation, action)) ? 0 : item.visitMass);
    }, 0);
    const fullVisits = full.map((action) => mass.get(signature(observation, action)) ?? 0);
    const bestFull = fullVisits.indexOf(Math.max(...fullVisits));
    const chosen = decodeAction(Int32Array.from(result.action), observation);
    const scores: Record<string, any> = {};
    for (const model of models) {
      const answer = await model.client.call({ op: "score", rows: [{
        state: dmcState(observation, context), history,
        actions: full.map((action) => dmcAction(observation, action)),
      }] });
      const q: number[] = answer.scores;
      if (q.length !== full.length || q.some((value) => !Number.isFinite(value)))
        throw Error("Invalid model scores");
      const bestModel = q.indexOf(Math.max(...q));
      scores[model.checkpoint] = {
        top1MatchesFullMcts: bestModel === bestFull,
        mctsMassAtModelTop1: fullVisits[bestModel],
        mctsMassAtFullTop1: fullVisits[bestFull],
        mctsTop1ModelRank: 1 + q.filter((value) => value > q[bestFull]).length,
        modelKind: full[bestModel].type,
      };
    }
    rows.push({ seed: snapshot.seed, seat: snapshot.seat, turn: snapshot.turn,
      allActions: all.length, fullActions: full.length,
      uniformTop1Expected: 1 / full.length,
      uniformMctsMassExpected: fullVisits.reduce((sum, value) => sum + value, 0) / full.length,
      mctsKind: chosen.type, fullMctsKind: full[bestFull].type,
      mctsTop1IsPartialSale: !fullKeys.has(signature(observation, chosen)),
      partialSaleMass, scores });
  }
} finally {
  native.stdin.end();
  models.forEach((model) => model.client.close());
}
const summary = {
  sources: sourcesText.split(","), checkpoints, sampled: rows.length,
  available: snapshots.length, simulationsPerDecision: iterations * 8,
  partialSaleTop1Rate: rows.filter((row) => row.mctsTop1IsPartialSale).length / rows.length,
  meanPartialSaleMass: rows.reduce((sum, row) => sum + row.partialSaleMass, 0) / rows.length,
  uniformTop1Expected: rows.reduce((sum, row) => sum + row.uniformTop1Expected, 0) / rows.length,
  uniformMctsMassExpected: rows.reduce((sum, row) => sum + row.uniformMctsMassExpected, 0) / rows.length,
  models: Object.fromEntries(checkpoints.map((checkpoint) => {
    const results = rows.map((row) => row.scores[checkpoint]);
    return [checkpoint, {
      top1Agreement: results.filter((r) => r.top1MatchesFullMcts).length / rows.length,
      meanMctsMassAtModelTop1: results.reduce((s, r) => s + r.mctsMassAtModelTop1, 0) / rows.length,
      meanMctsMassAtFullTop1: results.reduce((s, r) => s + r.mctsMassAtFullTop1, 0) / rows.length,
      meanMctsTop1ModelRank: results.reduce((s, r) => s + r.mctsTop1ModelRank, 0) / rows.length,
      byMctsKind: Object.fromEntries(["take", "camels", "sell", "exchange"].map((kind) => {
        const subset = rows.filter((row) => row.fullMctsKind === kind);
        return [kind, { n: subset.length,
          top1Agreement: subset.length ? subset.filter((row) =>
            row.scores[checkpoint].top1MatchesFullMcts).length / subset.length : null }];
      })),
    }];
  })),
  rows,
};
writeFileSync(output, JSON.stringify(summary, null, 2) + "\n");
console.log(JSON.stringify({ output, sampled: rows.length,
  partialSaleTop1Rate: summary.partialSaleTop1Rate,
  meanPartialSaleMass: summary.meanPartialSaleMass, models: summary.models }));

import assert from "node:assert/strict";
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { chooseOriginalWasmAction } from "../src/game/ai-wasm.ts";
import { observe } from "../src/game/ai.ts";
import { dmcAction } from "../src/game/dmc.ts";
import { dmcHistory } from "../src/game/dmc-history.ts";
import type { DmcPublicMove } from "../src/game/dmc-history.ts";
import { chooseDouzeroActionFromModel } from "../src/game/douzero-browser.ts";
import { DouzeroNetwork } from "../src/game/douzero-network.ts";
import { actionError, applyAction, newGame, nextRound } from "../src/game/engine.ts";
import { replay } from "../src/game/storage.ts";
import type { Event } from "../src/game/types.ts";

const [directory, seedText = "3905000000", pairsText = "25"] = process.argv.slice(2);
const start = Number(seedText);
const pairs = Number(pairsText);
assert.ok(directory && Number.isInteger(start) && start >= 0 &&
  Number.isInteger(pairs) && pairs >= 1 && pairs <= 100 &&
  start + pairs <= 2 ** 32,
  "Usage: evaluate-browser-policy.ts output-directory [start-seed pairs]");
const output = resolve(directory);
mkdirSync(output);
const bytes = readFileSync(new URL("../src/game/models/legacy-round-075182.bin", import.meta.url));
const model = new DouzeroNetwork(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
const config = {
  candidate: "browser-legacy-round-v" + model.version,
  baseline: "normal-wasm",
  opponentDifficulty: "重度 · 资深商人",
  episodeUnit: "match",
  seedStart: start,
  pairs,
  budget: 0,
  pairedSeats: true,
};
writeFileSync(join(output, "config.json"), JSON.stringify(config, null, 2) + "\n");
const started = performance.now();
let wins = 0;
let roundWins = 0;
let roundLosses = 0;
let roundDraws = 0;
let candidateScore = 0;
let baselineScore = 0;
for (let seed = start; seed < start + pairs; seed++)
  for (const seat of [0, 1]) {
    let state = newGame(seed);
    const events: Event[] = [];
    let moves: DmcPublicMove[] = [];
    while (state.phase !== "finished" && events.length < 700) {
      if (state.phase === "roundEnd") {
        state = nextRound(state);
        events.push({ type: "next" });
        moves = [];
      }
      const observation = observe(state, events, state.current === seat ? 0.75 : false);
      const action = state.current === seat
        ? chooseDouzeroActionFromModel(model, observation, dmcHistory(moves, seat))
        : await chooseOriginalWasmAction(observation);
      assert.equal(actionError(state, action), null);
      moves.push({ actor: state.current, action: dmcAction(observation, action) });
      state = applyAction(state, action);
      events.push(action);
    }
    assert.equal(state.phase, "finished", "Match exceeded 700 events");
    assert.deepEqual(replay({ version: 1, seed, difficulty: "experimental", events }), state);
    const won = state.seals[seat] > state.seals[1 - seat];
    wins += Number(won);
    const rounds = state.results.map((round) => {
      const modelScore = round.scores[seat];
      const opponentScore = round.scores[1 - seat];
      candidateScore += modelScore;
      baselineScore += opponentScore;
      if (round.winner === null) roundDraws++;
      else if (round.winner === seat) roundWins++;
      else roundLosses++;
      return { round: round.round, modelScore, opponentScore,
        modelWin: round.winner === null ? null : round.winner === seat };
    });
    const result = {
      ...config, seed, seat, winner: won ? "candidate" : "baseline",
      turns: events.filter((event) => event.type !== "next").length,
      seals: [state.seals[seat], state.seals[1 - seat]], rounds, events,
    };
    appendFileSync(join(output, "games.jsonl"), JSON.stringify(result) + "\n");
    console.log(JSON.stringify({ completed: (seed - start) * 2 + seat + 1,
      wins, seed, seat, seals: result.seals, scores: rounds.map((r) => [r.modelScore, r.opponentScore]) }));
  }
const rounds = roundWins + roundLosses + roundDraws;
const summary = {
  ...config, matches: pairs * 2, wins, losses: pairs * 2 - wins,
  winRate: wins / (pairs * 2), rounds, roundWins, roundLosses, roundDraws,
  roundWinRate: roundWins / rounds,
  meanModelRoundScore: candidateScore / rounds,
  meanOpponentRoundScore: baselineScore / rounds,
  meanRoundMargin: (candidateScore - baselineScore) / rounds,
  allActionsLegal: true, allGamesReplayed: true,
  elapsedSeconds: (performance.now() - started) / 1000,
};
writeFileSync(join(output, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
console.log(JSON.stringify(summary));

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { applyAction, newGame, nextRound } from "../src/game/engine.ts";
import { observe } from "../src/game/ai.ts";
import { decodeAction, encodeObservation } from "../src/game/ai-wasm.ts";
import {
  nextSaleCloseProbability,
  publicHandDistribution,
} from "../src/game/hand-belief.ts";
import type { Event } from "../src/game/types.ts";

const takePreference = Number(process.argv[2] ?? 0);
for (const [name, index, good, count] of [
  ["1004", 29, "diamond", 3],
  ["1308", 45, "gold", 5],
] as const) {
  const save = JSON.parse(
    readFileSync(
      `analysis/ai-eval-2026-09-23/case-${name}-guided-missed-win.json`,
      "utf8",
    ),
  );
  let state = newGame(save.seed);
  const events: Event[] = [];
  for (const event of save.events.slice(0, index) as Event[]) {
    state =
      event.type === "next" ? nextRound(state) : applyAction(state, event);
    events.push(event);
  }
  const observation = observe(state, events, true);
  const behavioralObservation = observe(state, events, 0.75);
  const input = encodeObservation(behavioralObservation, true);
  const bin = join(
    process.env.JAIPUR_AI_BIN_DIR ?? join(tmpdir(), "jaipur-ai-research"),
    "search",
  );
  const search = (stratified: boolean, closeRisk = false, belief = false) => {
    const args = [
      "search",
      "1.4142135623730951",
      "0",
      "8",
      "1",
      "1000",
      "1",
      "0",
      "0",
      "0",
      stratified ? "1" : "0",
      closeRisk ? "1" : "0",
      belief ? "1" : "0",
    ];
    const line = `100000 ${input.length} ${Array.from(input).join(" ")}\n`;
    const result = JSON.parse(
      execFileSync(belief ? bin + "-belief" : bin, args, {
        input: line,
        encoding: "utf8",
      }).trim(),
    );
    return {
      action: decodeAction(
        Int32Array.from(result.action),
        behavioralObservation,
      ),
      elapsedMs: result.elapsedMs,
    };
  };
  const worlds = takePreference
    ? publicHandDistribution(state, events, state.current, takePreference)
    : (observation.opponentHandDistribution ?? []);
  const goodIndex = [
    "diamond",
    "gold",
    "silver",
    "cloth",
    "spice",
    "leather",
  ].indexOf(good);
  const threat = worlds.reduce(
    (sum, world) =>
      sum + (world.hand[goodIndex] >= count ? world.probability : 0),
    0,
  );
  console.log(
    JSON.stringify({
      case: name,
      actionIndex: index,
      worlds: worlds.length,
      nextSaleClose: nextSaleCloseProbability(worlds, state),
      lethalSetProbability: threat,
      actualOpponentCount: state.players[1 - state.current].hand.filter(
        (card) => card === good,
      ).length,
      baselineDecision: search(false),
      stratifiedDecision: search(true),
      closeRiskDecision: search(false, true),
      beliefDecision:
        process.env.JAIPUR_RECHECK_BELIEF === "1"
          ? search(false, false, true)
          : undefined,
    }),
  );
}

// Independently replay saved matches, verify rule alternatives against the
// engine's legal reply set, and recompute each one/two-own-action deadline.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { observe } from "../src/game/ai.ts";
import {
  actionError,
  applyAction,
  legalActions,
  newGame,
  nextRound,
} from "../src/game/engine.ts";
import { findImmediateWinningAction } from "../src/game/immediate-win.ts";
import type { Action, Event, RoundResult, State } from "../src/game/types.ts";

const directory = resolve(process.argv[2]);
const readLines = (name: string) =>
  readFileSync(join(directory, name), "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
const summary = JSON.parse(
  readFileSync(join(directory, "summary.json"), "utf8"),
);
const games = readLines("games.jsonl") as {
  seed: number;
  events: Event[];
  results: RoundResult[];
}[];
type Case = {
  id: string;
  seed: number;
  actor: number;
  round: number;
  turn: number;
  eventIndex: number;
  horizon: number;
  ruleAction: Action;
  modelAction: Action;
  missed: boolean;
  firstActionMatchesRule: boolean;
};
const cases = readLines("cases.jsonl") as Case[];
assert.equal(games.length, summary.matches);
let directProofs = 0,
  twoMoveProofs = 0,
  opposingReplies = 0,
  deadlines = 0;
const examples: object[] = [];

function verifyProof(state: State, c: Case) {
  assert.equal(c.actor, state.current);
  assert.equal(c.round, state.round);
  assert.equal(c.turn, state.turn);
  assert.equal(actionError(state, c.ruleAction), null);
  const next = applyAction(state, c.ruleAction);
  if (c.horizon === 1 || next.phase !== "playing") {
    assert.notEqual(next.phase, "playing");
    assert.equal(next.results.at(-1)!.winner, c.actor);
    directProofs++;
    return;
  }
  twoMoveProofs++;
  for (const reply of legalActions(next)) {
    opposingReplies++;
    const after = applyAction(next, reply);
    if (after.phase !== "playing") {
      assert.equal(after.results.at(-1)!.winner, c.actor);
    } else {
      const last = findImmediateWinningAction(observe(after));
      assert.ok(
        last,
        `Missing last move for ${c.id}: ${JSON.stringify(reply)}`,
      );
      const end = applyAction(after, last);
      assert.notEqual(end.phase, "playing");
      assert.equal(end.results.at(-1)!.winner, c.actor);
    }
  }
}

for (const game of games) {
  const relevant = cases.filter((c) => c.seed === game.seed);
  const byIndex = new Map(relevant.map((c) => [c.eventIndex, c]));
  const traces = new Map<
    number,
    {
      actions: { index: number; actor: number; action: Action }[];
      endIndex?: number;
      result?: RoundResult;
    }
  >();
  let state = newGame(game.seed);
  for (let index = 0; index < game.events.length; index++) {
    const event = game.events[index];
    if (event.type === "next") {
      state = nextRound(state);
      continue;
    }
    const c = byIndex.get(index);
    if (c) {
      assert.deepEqual(event, c.modelAction);
      verifyProof(state, c);
    }
    const trace = traces.get(state.round) ?? { actions: [] };
    traces.set(state.round, trace);
    trace.actions.push({ index, actor: state.current, action: event });
    state = applyAction(state, event);
    if (state.phase !== "playing") {
      trace.endIndex = index;
      trace.result = state.results.at(-1)!;
    }
  }
  assert.equal(state.phase, "finished");
  assert.deepEqual(state.results, game.results);
  for (const c of relevant) {
    const trace = traces.get(c.round)!;
    const future = trace.actions.filter((a) => a.index >= c.eventIndex);
    const own = future.filter((a) => a.actor === c.actor);
    const deadlineIndex = own[c.horizon - 1]?.index ?? Infinity;
    const expectedMiss =
      trace.result!.winner !== c.actor || trace.endIndex! > deadlineIndex;
    assert.equal(c.missed, expectedMiss, `Wrong deadline verdict: ${c.id}`);
    deadlines++;
    if (
      c.missed &&
      !examples.some(
        (e: any) =>
          e.horizon === c.horizon &&
          e.firstActionMatchesRule === c.firstActionMatchesRule,
      )
    ) {
      const example = {
        ...c,
        ruleAction: c.ruleAction,
        modelAction: c.modelAction,
        actualOwnMovesUntilRoundEnd: own.length,
        window: future.filter((a) => a.index <= deadlineIndex),
        actualRoundResult: trace.result,
      };
      examples.push(example);
      writeFileSync(
        join(
          directory,
          `example-${c.horizon}-step-${c.firstActionMatchesRule ? "follow-up" : "different-action"}.json`,
        ),
        JSON.stringify(
          {
            version: 1,
            seed: game.seed,
            difficulty: "hard",
            events: game.events.slice(0, c.eventIndex),
          },
          null,
          2,
        ),
      );
    }
  }
}
const result = {
  matchesReplayed: games.length,
  casesVerified: cases.length,
  directProofs,
  twoMoveProofs,
  opposingRepliesVerified: opposingReplies,
  deadlineVerdictsRecomputed: deadlines,
  allRecordedProofsWinAgainstEveryLegalReplyInActualStates: true,
  note: "Public uncertainty was covered by the original exhaustive proof; this replay independently checks actual states and all legal replies.",
  examples,
};
writeFileSync(
  join(directory, "verification.json"),
  JSON.stringify(result, null, 2),
);
console.log(
  JSON.stringify(
    {
      ...result,
      examples: examples.map((e: any) => ({
        id: e.id,
        horizon: e.horizon,
        ruleAction: e.ruleAction,
        modelAction: e.modelAction,
        actualOwnMovesUntilRoundEnd: e.actualOwnMovesUntilRoundEnd,
      })),
    },
    null,
    2,
  ),
);

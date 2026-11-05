import test from "node:test";
import assert from "node:assert/strict";
import {
  applyAction,
  legalActions,
  newGame,
  nextRound,
} from "../src/game/engine.ts";
import { parseSave, replay } from "../src/game/storage.ts";
import type { Save } from "../src/game/types.ts";

test("single round matches finish after the first win for either player", () => {
  for (const winner of [0, 1]) {
    const state = newGame(3, 1);
    state.current = 0;
    state.players[winner].goods = [100];
    state.deck = [];
    state.market = ["cloth"];
    const next = applyAction(state, { type: "take", index: 0 });
    assert.equal(next.phase, "finished");
    assert.equal(next.seals[winner], 1);
    assert.equal(legalActions(next).length, 0);
    assert.throws(() => nextRound(next));
  }
});

test("exact ties allow another round under either match format", () => {
  for (const targetSeals of [1, 2] as const) {
    const state = newGame(3, targetSeals);
    state.current = 0;
    state.players.forEach((p) => {
      p.camels = 0;
      p.goods = [];
      p.bonuses = [];
    });
    state.deck = [];
    state.market = ["cloth"];
    const next = applyAction(state, { type: "take", index: 0 });
    assert.equal(next.phase, "roundEnd");
    assert.deepEqual(next.seals, [0, 0]);
    assert.equal(nextRound(next).targetSeals, targetSeals);
  }
});

test("save import and replay retain the format; legacy saves stay best of three", () => {
  const legacy: Save = { version: 1, seed: 3, difficulty: "easy", events: [] };
  assert.equal(replay(parseSave(JSON.stringify(legacy))).targetSeals, 2);
  const quick = { ...legacy, targetSeals: 1 as const };
  let state = replay(quick);
  while (state.phase === "playing") {
    // Prefer sales so the game ends without creating a massive exchange tree.
    const actions = legalActions(state);
    const action = actions.find((a) => a.type === "sell") ?? actions[0];
    quick.events.push(action);
    state = applyAction(state, action);
  }
  assert.equal(state.phase, "finished");
  assert.deepEqual(replay(parseSave(JSON.stringify(quick))), state);
  for (const invalid of [0, 3, "1", null]) {
    assert.throws(() =>
      parseSave(JSON.stringify({ ...legacy, targetSeals: invalid })),
    );
  }
});

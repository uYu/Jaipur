import test from "node:test";
import assert from "node:assert/strict";
import { newGame, legalActions } from "../src/game/engine.ts";
import { advance } from "../src/game/storage.ts";
import {
  actionSummaries,
  lastActionOrder,
  saleReceipts,
} from "../src/game/receipts.ts";
import { presentAction } from "../src/game/presentation.ts";
import { chooseAction, observe } from "../src/game/ai.ts";
import type { Save } from "../src/game/types.ts";
test("last sale denominations survive reload and are scoped to replay position and round", () => {
  const save: Save = { version: 1, seed: 7, difficulty: "normal", events: [] };
  let s = newGame(7);
  while (s.phase === "playing") {
    const event = chooseAction(observe(s), "normal");
    save.events.push(event);
    s = advance(s, event);
  }
  const r = saleReceipts(save);
  assert.ok(r.some(Boolean));
  assert.deepEqual(saleReceipts(JSON.parse(JSON.stringify(save))), r);
  assert.deepEqual(saleReceipts(save, 0), [null, null]);
  for (const receipt of r)
    if (receipt) {
      assert.ok(receipt.coins.length > 0);
      if (receipt.actor === 1)
        assert.ok(receipt.bonus === null || receipt.bonus === "hidden");
    }
  save.events.push({ type: "next" });
  assert.deepEqual(saleReceipts(save), [null, null]);
  assert.ok(legalActions(advance(s, { type: "next" })).length > 0);
});

test("last actions follow each actor and the replay position, and reset at the next round", () => {
  const save: Save = { version: 1, seed: 7, difficulty: "easy", events: [] };
  let state = newGame(save.seed);
  const expected: ReturnType<typeof actionSummaries>["lastActions"] = [
    null,
    null,
  ];
  for (let turn = 0; state.phase === "playing" && turn < 200; turn++) {
    const actions = legalActions(state);
    const action = actions.find((a) => a.type === "sell") ?? actions[0];
    const next = advance(state, action);
    save.events.push(action);
    expected[state.current] = presentAction(state, action, next);
    const actor = state.current;
    state = next;
    if (turn < 4) {
      const summaries = actionSummaries(save);
      assert.deepEqual(summaries.lastActions, expected);
      assert.equal(summaries.latestActor, actor);
      assert.equal(summaries.lastTurns[actor], turn + 1);
      assert.deepEqual(lastActionOrder(summaries.latestActor), [
        1 - actor,
        actor,
      ]);
      assert.equal(summaries.history.at(-1)?.action.actor, actor);
      assert.equal(summaries.history.at(-1)?.turn, turn + 1);
      assert.equal(summaries.history.length, turn + 1);
    }
  }
  assert.equal(state.phase, "roundEnd");
  assert.deepEqual(actionSummaries(save, 0).lastActions, [null, null]);
  save.events.push({ type: "next" });
  const summaries = actionSummaries(save);
  assert.deepEqual(summaries.receipts, [null, null]);
  assert.deepEqual(summaries.lastActions, [null, null]);
  assert.deepEqual(summaries.lastTurns, [null, null]);
  assert.equal(summaries.latestActor, null);
  assert.equal(summaries.history.length, save.events.length - 1);
  assert.equal(actionSummaries(save, 2).history.length, 2);
  assert.deepEqual(actionSummaries(null).history, []);
});

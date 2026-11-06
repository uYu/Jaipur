import test from "node:test";
import assert from "node:assert/strict";
import { applyAction, newGame } from "../src/game/engine.ts";
import {
  boardFeedback,
  saleFeedbackText,
} from "../src/game/action-feedback.ts";
import { presentAction } from "../src/game/presentation.ts";
import { nextMarketSlots } from "../src/game/market-layout.ts";
import { createTutorialSave, TUTORIAL_ACTIONS } from "../src/game/tutorial.ts";
import { replay } from "../src/game/storage.ts";
import type { Action } from "../src/game/types.ts";

const slots = [4, 2, 0, 3, 1];
function table(actor = 0) {
  const state = newGame(3);
  state.current = actor;
  state.market = ["gold", "cloth", "camel", "leather", "camel"];
  state.players[actor].hand = ["silver", "spice", "spice"];
  state.players[actor].camels = 2;
  return state;
}

test("taking marks the real refill slot even if the new card has the same face", () => {
  for (const actor of [0, 1]) {
    const before = table(actor);
    before.deck[before.deck.length - 1] = "cloth";
    const action: Action = { type: "take", index: 1 };
    const after = applyAction(before, action);
    const feedback = boardFeedback(before, action, after, slots);
    assert.deepEqual(feedback.departures, [
      { anchor: "market-2", label: actor ? "米拉拿取" : "你拿取" },
    ]);
    assert.deepEqual(feedback.addedSlots, [2]);
    assert.equal(feedback.addedLabel, "补充");
    assert.deepEqual(feedback.handArrivals, actor ? [] : [3]);
    assert.equal(feedback.turn, after.turn);
  }
});

test("camel removal preserves untouched slots and marks only actual refills at round end", () => {
  const before = table();
  before.deck = ["gold"];
  const action: Action = { type: "camels" };
  const after = applyAction(before, action);
  const feedback = boardFeedback(before, action, after, slots);
  assert.deepEqual(
    feedback.departures.map((item) => item.anchor),
    ["market-0", "market-1"],
  );
  assert.deepEqual(feedback.addedSlots, [0]);
  assert.deepEqual(feedback.handArrivals, []);
  assert.notEqual(after.phase, "playing");
});

test("mixed exchange marks both directions and the new hand indices after compaction", () => {
  for (const actor of [0, 1]) {
    const before = table(actor);
    const action: Action = {
      type: "exchange",
      market: [0, 1],
      hand: [1],
      camels: 1,
    };
    const feedback = boardFeedback(
      before,
      action,
      applyAction(before, action),
      slots,
    );
    assert.deepEqual(
      feedback.departures.map((item) => item.anchor),
      actor ? ["market-4", "market-2"] : ["market-4", "market-2", "hand-1"],
    );
    assert.deepEqual(feedback.addedSlots, [2, 4]);
    assert.equal(feedback.addedLabel, actor ? "米拉付出" : "你付出");
    assert.deepEqual(feedback.handArrivals, actor ? [] : [2, 3]);
  }
});

test("sale feedback fades only sold own cards and keeps opponent rewards private", () => {
  for (const actor of [0, 1]) {
    const before = table(actor);
    before.players[actor].hand = [
      "leather",
      "spice",
      "leather",
      "leather",
      "cloth",
    ];
    const action: Action = { type: "sell", good: "leather", count: 3 };
    const after = applyAction(before, action);
    const feedback = boardFeedback(before, action, after, slots);
    assert.deepEqual(
      feedback.departures.map((item) => item.anchor),
      actor ? [] : ["hand-0", "hand-2", "hand-3"],
    );
    assert.deepEqual(feedback.addedSlots, []);
    const presentation = presentAction(before, action, after);
    const text = saleFeedbackText(presentation);
    if (actor) {
      assert.equal(presentation.bonus, "hidden");
      assert.equal(text.detail, "另获 1 枚奖励 · 面值保密");
      assert.equal(
        text.income,
        `货物 +${presentation.coins.reduce((a, b) => a + b, 0)} 卢比`,
      );
    } else {
      assert.equal(
        text.income,
        `收入 +${after.players[0].goods.reduce((a, b) => a + b, 0) + after.players[0].bonuses.at(-1)!} 卢比`,
      );
    }
  }
});

test("no-bonus sale has no invented reward and zero-valued rewards remain explicit", () => {
  const action = {
    actor: 0,
    type: "sell" as const,
    incoming: [],
    outgoing: ["leather" as const],
    coins: [1],
    bonus: null,
  };
  assert.deepEqual(saleFeedbackText(action), {
    title: "你卖出皮革 ×1",
    income: "收入 +1 卢比",
    detail: "",
  });
  assert.equal(
    saleFeedbackText({ ...action, bonus: 0 }).detail,
    "货物 1 + 奖励 0",
  );
});

test("every tutorial departure and arrival points at an actual card across all four actions", () => {
  let state = replay(createTutorialSave());
  let positions = [0, 1, 2, 3, 4];
  for (const action of TUTORIAL_ACTIONS) {
    const after = applyAction(state, action);
    const feedback = boardFeedback(state, action, after, positions);
    const next = nextMarketSlots(state, action, after, positions);
    for (const departure of feedback.departures) {
      const index = Number(departure.anchor.split("-")[1]);
      if (departure.anchor.startsWith("market-"))
        assert.ok(positions.includes(index));
      else assert.ok(index >= 0 && index < state.players[0].hand.length);
    }
    assert.ok(feedback.addedSlots.every((slot) => next.includes(slot)));
    assert.ok(
      feedback.handArrivals.every(
        (i) => i >= 0 && i < after.players[0].hand.length,
      ),
    );
    state = after;
    positions = next;
  }
});

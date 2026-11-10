import test from "node:test";
import assert from "node:assert/strict";
import { opponentHandVisibility, opponentMemory } from "../src/game/opponent-memory.ts";
import type { ActionRecord } from "../src/game/receipts.ts";
import type { Presentation } from "../src/game/presentation.ts";
import { newGame, applyAction, legalActions } from "../src/game/engine.ts";
import { actionSummaries } from "../src/game/receipts.ts";
import {
  playerCardsDisplay,
  playerScoreDisplay,
} from "../src/game/score-display.ts";
import { parseSave, replay } from "../src/game/storage.ts";
import { readPreferences, writePreferences } from "../src/game/preferences.ts";
import type { Save } from "../src/game/types.ts";
const record = (action: Partial<Presentation>, round = 1): ActionRecord => ({
  round,
  turn: 1,
  action: {
    actor: 1,
    type: "take",
    incoming: [],
    outgoing: [],
    coins: [],
    bonus: null,
    ...action,
  },
});

test("public memory keeps initial goods unknown and derives initial camels from public count", () => {
  assert.deepEqual(opponentMemory([], 1, 3), { hand: [], camels: 2, goods: 0 });
});
test("replay marks only the known number of indistinguishable cards", () => {
  assert.deepEqual(
    opponentHandVisibility(["spice", "diamond", "spice", "gold"], ["spice", "gold"]),
    ["known", "hidden", "hidden", "known"],
  );
});
test("takes and exchanges add known cards; payments and sales remove known duplicates conservatively", () => {
  const history = [
    record({ incoming: ["diamond"] }),
    record({ incoming: ["cloth"] }),
    record({
      type: "exchange",
      outgoing: ["cloth", "camel"],
      incoming: ["gold", "gold"],
    }),
    record({
      type: "sell",
      outgoing: ["gold", "gold", "gold"],
      coins: [6, 5, 5],
      bonus: "hidden",
    }),
  ];
  assert.deepEqual(opponentMemory(history, 1, 3), {
    hand: ["diamond"],
    camels: 1,
    goods: 16,
  });
  // Bonus faces never contribute, even when a replay projection supplies them.
  history[3].action.bonus = 99;
  assert.equal(opponentMemory(history, 1, 3).goods, 16);
});
test("round changes reset memory; own actions never become opponent cards or income", () => {
  const history = [
    record({ incoming: ["diamond"], coins: [7] }, 1),
    record({ actor: 0, incoming: ["silver"], coins: [5] }, 2),
    record({ type: "camels", incoming: ["camel", "camel"] }, 2),
  ];
  assert.deepEqual(opponentMemory(history, 2, 4), {
    hand: [],
    camels: 3,
    goods: 0,
  });
});
test("assisted projections reveal public facts while concealed hands, bonuses, and total stay hidden", () => {
  const state = newGame(7);
  state.players[1].hand = ["diamond", "spice", "gold"];
  state.players[1].bonuses = [9];
  const memory = { hand: ["gold"] as const, camels: 2, goods: 12 };
  const publicMemory = { ...memory, hand: [...memory.hand] };
  assert.deepEqual(playerCardsDisplay(state, 1, false, publicMemory), {
    handCount: 3,
    hand: null,
    knownHand: ["gold"],
    camels: 2,
  });
  assert.deepEqual(playerScoreDisplay(state, 1, false, publicMemory), {
    goodsTokenCount: state.players[1].goods.length,
    bonusTokenCount: 1,
    total: null,
    goods: 12,
    bonus: null,
    hidden: true,
  });
  state.players[1].hand = ["silver", "cloth", "silver"];
  state.players[1].bonuses = [1];
  state.players[1].camels = 9;
  state.players[1].goods = [99];
  assert.equal(playerScoreDisplay(state, 1, false, publicMemory).goods, 12);
  assert.deepEqual(
    playerCardsDisplay(state, 1, false, publicMemory).knownHand,
    ["gold"],
  );
  assert.equal(playerCardsDisplay(state, 1).camels, null);
  assert.equal(playerScoreDisplay(state, 1).goods, null);
});
test("a complete public history matches earned goods and camels, with no known card exceeding the actual hand", () => {
  const save: Save = {
    version: 1,
    seed: 19,
    difficulty: "easy",
    targetSeals: 1,
    informationMode: "assisted",
    events: [],
  };
  let state = replay(save);
  for (let turn = 0; turn < 80 && state.phase === "playing"; turn++) {
    const actions = legalActions(state);
    const action = actions[(turn * 13 + 7) % actions.length];
    save.events.push(action);
    state = applyAction(state, action);
    const { history } = actionSummaries(save);
    const memory = opponentMemory(
      history,
      state.round,
      state.players[1].hand.length,
    );
    assert.equal(memory.camels, state.players[1].camels);
    assert.equal(
      memory.goods,
      state.players[1].goods.reduce((a, b) => a + b, 0),
    );
    for (const good of memory.hand)
      assert.ok(
        memory.hand.filter((g) => g === good).length <=
          state.players[1].hand.filter((g) => g === good).length,
      );
  }
});
test("information mode persists in saves, validates imported values, and leaves old saves standard", () => {
  const old: Save = { version: 1, seed: 3, difficulty: "easy", events: [] };
  assert.equal(parseSave(JSON.stringify(old)).informationMode, undefined);
  for (const informationMode of ["standard", "assisted"] as const) {
    const parsed = parseSave(JSON.stringify({ ...old, informationMode }));
    assert.equal(parsed.informationMode, informationMode);
    assert.deepEqual(replay(parsed), replay(old));
  }
  assert.throws(() =>
    parseSave(JSON.stringify({ ...old, informationMode: "reveal-all" })),
  );
});
test("preferences remember assistance; missing, corrupt, and unknown modes fall back to standard", () => {
  const original = globalThis.localStorage;
  let stored = "{}";
  globalThis.localStorage = {
    getItem: () => stored,
    setItem: (_key: string, value: string) => {
      stored = value;
    },
  } as Storage;
  try {
    assert.equal(readPreferences().informationMode, "standard");
    writePreferences({
      difficulty: "normal",
      targetSeals: 1,
      informationMode: "assisted",
    });
    assert.equal(readPreferences().informationMode, "assisted");
    stored = '{"informationMode":"bad"}';
    assert.equal(readPreferences().informationMode, "standard");
    stored = "bad json";
    assert.equal(readPreferences().informationMode, "standard");
  } finally {
    globalThis.localStorage = original;
  }
});

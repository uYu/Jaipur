import test from "node:test";
import assert from "node:assert/strict";
import { newGame } from "../src/game/engine.ts";
import {
  emptySelection,
  selectCamels,
  selectHand,
  selectMarket,
  selectedAction,
} from "../src/game/selection.ts";
function table() {
  const s = newGame(1);
  s.current = 0;
  s.market = ["cloth", "leather", "gold", "camel", "camel"];
  s.players[0].hand = ["silver", "spice", "spice", "leather"];
  s.players[0].camels = 3;
  return s;
}
test("card selection infers taking, selling and exchanging without a mode", () => {
  const s = table();
  let selection = selectMarket(s, emptySelection(), 0);
  assert.deepEqual(selectedAction(s, selection), {
    action: { type: "take", index: 0 },
    error: "",
  });
  selection = selectMarket(s, selection, 2);
  assert.equal(selectedAction(s, selection).action?.type, "exchange");
  assert.ok(selectedAction(s, selection).error);
  selection = selectHand(s, selection, 1);
  selection = selectCamels(s, selection, 1);
  assert.deepEqual(selectedAction(s, selection), {
    action: { type: "exchange", market: [0, 2], hand: [1], camels: 1 },
    error: "",
  });
  selection = selectMarket(s, selection, 0);
  selection = selectMarket(s, selection, 2);
  selection = selectCamels(s, selection, 0);
  assert.deepEqual(selectedAction(s, selection), {
    action: { type: "sell", good: "spice", count: 1 },
    error: "",
  });
  selection = selectHand(s, selection, 2);
  assert.equal(selectedAction(s, selection).action?.type, "sell");
  selection = selectHand(s, selection, 1);
  selection = selectHand(s, selection, 2);
  assert.equal(selectedAction(s, selection).action, null);
});
test("hand-first and market-first exchanges preserve all selections", () => {
  const s = table();
  let a = selectHand(s, emptySelection(), 1);
  a = selectMarket(s, a, 0);
  a = selectMarket(s, a, 2);
  a = selectCamels(s, a, 1);
  let b = selectMarket(s, emptySelection(), 0);
  b = selectMarket(s, b, 2);
  b = selectHand(s, b, 1);
  b = selectCamels(s, b, 1);
  assert.deepEqual(a, b);
  assert.equal(selectedAction(s, a).error, "");
});
test("market camel click selects the entire herd and clears conflicting goods; next click clears it", () => {
  const s = table();
  let a = selectHand(s, emptySelection(), 1);
  a = selectCamels(s, a, 1);
  a = selectMarket(s, a, 3);
  assert.deepEqual(a, { market: [3, 4], hand: [], camels: 0 });
  assert.deepEqual(selectedAction(s, a), {
    action: { type: "camels" },
    error: "",
  });
  assert.deepEqual(selectMarket(s, a, 4), emptySelection());
  assert.deepEqual(selectMarket(s, a, 0), { market: [0], hand: [], camels: 0 });
  assert.deepEqual(selectHand(s, a, 1), { market: [], hand: [1], camels: 0 });
  assert.deepEqual(selectCamels(s, a, 1), { market: [], hand: [], camels: 1 });
});
test("invalid direct selections remain previews and report existing rule constraints", () => {
  const s = table();
  let a = selectHand(s, emptySelection(), 0);
  assert.ok(selectedAction(s, a).error);
  a = selectHand(s, a, 1);
  assert.equal(selectedAction(s, a).action, null);
  assert.match(selectedAction(s, a).error, /同类/);
  a = { market: [0, 1], hand: [3], camels: 1 };
  assert.match(selectedAction(s, a).error, /同一种/);
  a = { market: [0], hand: [1], camels: 0 };
  assert.match(selectedAction(s, a).error, /至少/);
  assert.equal(selectCamels(s, emptySelection(), 99).camels, 3);
  assert.equal(selectCamels(s, emptySelection(), -1).camels, 0);
});

test("choosing an action is required before cards or camel payment can change", () => {
  const s = table();
  const selection = { market: [0], hand: [1], camels: 1 };
  assert.deepEqual(selectMarket(s, selection, 2, null), selection);
  assert.deepEqual(selectHand(s, selection, 2, null), selection);
  assert.deepEqual(selectCamels(s, selection, 2, null), selection);
  assert.deepEqual(selectedAction(s, selection, null), {
    action: null,
    error: "",
  });
});

test("taking replaces the chosen good and includes collecting all market camels", () => {
  const s = table();
  let selection = selectMarket(s, emptySelection(), 0, "take");
  selection = selectMarket(s, selection, 2, "take");
  assert.deepEqual(selection, { market: [2], hand: [], camels: 0 });
  assert.deepEqual(selectHand(s, selection, 1, "take"), selection);
  assert.deepEqual(selectCamels(s, selection, 1, "take"), selection);
  assert.deepEqual(selectedAction(s, selection, "take"), {
    action: { type: "take", index: 2 },
    error: "",
  });
  assert.deepEqual(selectMarket(s, selection, 2, "take"), emptySelection());
  selection = selectMarket(s, selection, 3, "take");
  assert.deepEqual(selection, { market: [3, 4], hand: [], camels: 0 });
  assert.deepEqual(selectedAction(s, selection, "take"), {
    action: { type: "camels" },
    error: "",
  });
  assert.deepEqual(selectMarket(s, selection, 4, "take"), emptySelection());
});

test("selling groups one good and switches groups when a different good is clicked", () => {
  const s = table();
  let selection = selectHand(s, emptySelection(), 1, "sell");
  selection = selectHand(s, selection, 2, "sell");
  assert.deepEqual(selectedAction(s, selection, "sell"), {
    action: { type: "sell", good: "spice", count: 2 },
    error: "",
  });
  assert.deepEqual(selectMarket(s, selection, 0, "sell"), selection);
  assert.deepEqual(selectCamels(s, selection, 1, "sell"), selection);
  selection = selectHand(s, selection, 3, "sell");
  assert.deepEqual(selection, { market: [], hand: [3], camels: 0 });
  assert.deepEqual(selectedAction(s, selection, "sell"), {
    action: { type: "sell", good: "leather", count: 1 },
    error: "",
  });
  assert.deepEqual(selectHand(s, selection, 3, "sell"), emptySelection());
});

test("incomplete exchanges stay exchanges regardless of which side is selected first", () => {
  const s = table();
  const marketFirst = selectMarket(s, emptySelection(), 0, "exchange");
  assert.equal(
    selectedAction(s, marketFirst, "exchange").action?.type,
    "exchange",
  );
  assert.match(selectedAction(s, marketFirst, "exchange").error, /至少/);
  let selection = selectHand(s, emptySelection(), 1, "exchange");
  assert.equal(
    selectedAction(s, selection, "exchange").action?.type,
    "exchange",
  );
  assert.ok(selectedAction(s, selection, "exchange").error);
  assert.deepEqual(selectMarket(s, selection, 3, "exchange"), selection);
  selection = selectMarket(s, selection, 0, "exchange");
  selection = selectMarket(s, selection, 2, "exchange");
  selection = selectCamels(s, selection, 1, "exchange");
  assert.deepEqual(selectedAction(s, selection, "exchange"), {
    action: { type: "exchange", market: [0, 2], hand: [1], camels: 1 },
    error: "",
  });
  assert.deepEqual(selectedAction(s, emptySelection(), "exchange"), {
    action: null,
    error: "",
  });
});

test("explicit modes cannot infer a different action from stray selection fields", () => {
  const s = table();
  const selection = { market: [0], hand: [1, 2], camels: 1 };
  assert.deepEqual(selectedAction(s, selection, "take"), {
    action: { type: "take", index: 0 },
    error: "",
  });
  assert.deepEqual(selectedAction(s, selection, "sell"), {
    action: { type: "sell", good: "spice", count: 2 },
    error: "",
  });
  assert.equal(
    selectedAction(s, { market: [], hand: [1], camels: 1 }, "take").action,
    null,
  );
  assert.equal(
    selectedAction(s, { market: [0], hand: [], camels: 1 }, "sell").action,
    null,
  );
});

test("explicit modes preserve hand limits, premium sale minimum and exchange restrictions", () => {
  const s = table();
  s.players[0].hand.push("cloth", "cloth", "gold");
  assert.match(
    selectedAction(s, selectMarket(s, emptySelection(), 0, "take"), "take")
      .error,
    /7 张/,
  );
  assert.equal(
    selectedAction(s, selectMarket(s, emptySelection(), 3, "take"), "take")
      .error,
    "",
  );
  assert.match(
    selectedAction(s, selectHand(s, emptySelection(), 0, "sell"), "sell").error,
    /至少出售 2 张/,
  );
  assert.equal(
    selectedAction(s, { market: [0, 2], hand: [1, 2], camels: 0 }, "exchange")
      .error,
    "",
  );
  assert.match(
    selectedAction(s, { market: [0, 2], hand: [1], camels: 1 }, "exchange")
      .error,
    /超过 7 张/,
  );
  assert.match(
    selectedAction(s, { market: [0, 2], hand: [4, 5], camels: 0 }, "exchange")
      .error,
    /同一种/,
  );
});

test("out-of-range card clicks do not create selections", () => {
  const s = table();
  for (const index of [-1, 99, 1.5]) {
    assert.deepEqual(
      selectMarket(s, emptySelection(), index, "take"),
      emptySelection(),
    );
    assert.deepEqual(
      selectHand(s, emptySelection(), index, "sell"),
      emptySelection(),
    );
  }
});

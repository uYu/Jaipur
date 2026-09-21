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

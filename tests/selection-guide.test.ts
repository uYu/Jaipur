import test from "node:test";
import assert from "node:assert/strict";
import { newGame } from "../src/game/engine.ts";
import { emptySelection, selectMarket } from "../src/game/selection.ts";
import { selectionGuide } from "../src/game/selection-guide.ts";

function table() {
  const state = newGame(1);
  state.current = 0;
  state.market = ["cloth", "leather", "gold", "camel", "camel"];
  state.players[0].hand = ["silver", "spice", "spice", "leather"];
  state.players[0].camels = 3;
  return state;
}

test("guidance starts at the cards and a single market good previews taking", () => {
  const state = table();
  const idle = selectionGuide(state, emptySelection());
  assert.equal(idle.action, null);
  assert.match(idle.title, /拿货：.*1张市场货物.*全部骆驼/);
  assert.match(idle.hint, /卖货：.*手牌得分.*3张起有奖励\n交换：.*等量/);
  assert.match(idle.hint, /交换/);
  const taking = selectionGuide(state, { market: [0], hand: [], camels: 0 });
  assert.equal(taking.action?.type, "take");
  assert.equal(taking.error, "");
  assert.match(taking.title, /拿取.*丝绸/);
  assert.match(taking.hint, /交换/);
});

test("incomplete exchanges explain the exact missing payment without a red error", () => {
  const state = table();
  const two = selectionGuide(state, { market: [0, 2], hand: [], camels: 0 });
  assert.equal(two.action?.type, "exchange");
  assert.ok(two.error); // Confirmation must still be blocked.
  assert.equal(two.problem, false);
  assert.match(two.hint, /再选 2 张手牌或骆驼/);
  const one = selectionGuide(state, { market: [0, 2], hand: [1], camels: 0 });
  assert.match(one.hint, /再选 1 张手牌或骆驼/);
  const ready = selectionGuide(state, { market: [0, 2], hand: [1], camels: 1 });
  assert.equal(ready.error, "");
  assert.match(ready.hint, /数量已配平/);
});

test("one-card and excess-payment exchanges guide market selection", () => {
  const state = table();
  const one = selectionGuide(state, { market: [0], hand: [1], camels: 0 });
  assert.equal(one.problem, false);
  assert.match(one.hint, /再选 1 张市场货物/);
  const excess = selectionGuide(state, {
    market: [0, 2],
    hand: [1, 2],
    camels: 1,
  });
  assert.ok(excess.error);
  assert.equal(excess.problem, false);
  assert.match(excess.hint, /再选 1 张市场货物，或减少付款/);
});

test("mixed hand-first selection invites exchange without claiming it can sell", () => {
  const guide = selectionGuide(table(), {
    market: [],
    hand: [0, 1],
    camels: 0,
  });
  assert.equal(guide.action, null);
  assert.ok(guide.error);
  assert.equal(guide.problem, false);
  assert.match(guide.hint, /继续选市场货物来交换/);
});

test("premium sales ask for the second card while real rule conflicts remain errors", () => {
  const state = table();
  const premium = selectionGuide(state, { market: [], hand: [0], camels: 0 });
  assert.ok(premium.error);
  assert.equal(premium.problem, false);
  assert.match(premium.hint, /再选 1 张白银/);
  const conflict = selectionGuide(state, {
    market: [0, 1],
    hand: [3],
    camels: 1,
  });
  assert.equal(conflict.problem, true);
  assert.match(conflict.hint, /同一种/);
  state.players[0].hand.push("cloth", "cloth", "gold");
  const full = selectionGuide(state, { market: [0], hand: [], camels: 0 });
  assert.equal(full.problem, true);
  assert.match(full.hint, /7 张/);
});

test("bulk preview shows actual available income and never promises an exhausted bonus", () => {
  const state = table();
  state.players[0].hand.push("spice");
  const selection = { market: [], hand: [1, 2, 4], camels: 0 };
  const bulk = selectionGuide(state, selection);
  assert.match(bulk.title, /3 张香料 · 11 卢比/);
  assert.deepEqual(bulk.bonusPreview, { tier: 3, min: 1, max: 3 });
  state.bonus[3] = [];
  assert.equal(selectionGuide(state, selection).bonusPreview, null);
});

test("bonus previews identify the tier and public range without revealing the next token", () => {
  const state = table();
  for (const [tier, min, max] of [
    [3, 1, 3],
    [4, 4, 6],
    [5, 8, 10],
  ] as const) {
    state.players[0].hand = Array(tier).fill("spice");
    const selection = {
      market: [],
      hand: Array.from({ length: tier }, (_, i) => i),
      camels: 0,
    };
    state.bonus[tier] = [min];
    const preview = selectionGuide(state, selection).bonusPreview;
    assert.deepEqual(preview, { tier, min, max });
    state.bonus[tier] = [max];
    assert.deepEqual(selectionGuide(state, selection).bonusPreview, preview);
  }
});

test("a camel click previews the whole public herd with no payment instruction", () => {
  const state = table();
  const guide = selectionGuide(state, selectMarket(state, emptySelection(), 3));
  assert.equal(guide.action?.type, "camels");
  assert.equal(guide.error, "");
  assert.match(guide.title, /全部 2 头骆驼/);
  assert.match(guide.hint, /不占手牌/);
});

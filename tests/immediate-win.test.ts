import test from "node:test";
import assert from "node:assert/strict";
import { observe } from "../src/game/ai.ts";
import { BONUS_VALUES, makeDeck, random } from "../src/game/data.ts";
import { dmcActions } from "../src/game/dmc.ts";
import {
  chooseDouzeroAction,
  chooseDouzeroActionFromModel,
} from "../src/game/douzero-browser.ts";
import { actionError, applyAction, newGame } from "../src/game/engine.ts";
import { findImmediateWinningAction } from "../src/game/immediate-win.ts";
import type { State } from "../src/game/types.ts";

function rebuildDeck(s: State) {
  s.deck = makeDeck();
  for (const card of [
    ...s.market,
    ...s.discard,
    ...s.players.flatMap((p) => [...p.hand, ...Array(p.camels).fill("camel")]),
  ]) {
    const at = s.deck.indexOf(card);
    assert.ok(at >= 0);
    s.deck.splice(at, 1);
  }
}

function fixture() {
  const s = newGame(25, 1);
  s.current = 0;
  s.players = [
    { hand: ["diamond", "diamond"], camels: 6, goods: [], bonuses: [] },
    { hand: ["leather"], camels: 5, goods: [], bonuses: [] },
  ];
  s.market = ["cloth", "gold", "silver", "spice", "leather"];
  s.discard = [];
  s.tokens.gold = [];
  s.tokens.silver = [];
  s.tokens.diamond = [7];
  rebuildDeck(s);
  return s;
}

function leaveDeck(s: State, count: number) {
  const removed = s.deck.splice(count);
  assert.ok(removed.every((c) => c !== "camel"));
  s.discard.push(...(removed as State["discard"]));
}

function assertWin(s: State) {
  const before = structuredClone(s);
  const action = findImmediateWinningAction(observe(s));
  assert.ok(action);
  assert.equal(actionError(s, action), null);
  const after = applyAction(s, action);
  assert.notEqual(after.phase, "playing");
  assert.equal(after.results.at(-1)!.winner, s.current);
  assert.deepEqual(s, before);
  return action;
}

test("closing sale bypasses both model loading and model inference", async () => {
  const s = fixture();
  const observation = observe(s); // No hand posterior or model history is needed.
  const expected = { type: "sell", good: "diamond", count: 2 };
  assert.deepEqual(assertWin(s), expected);
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw Error("must not load the model");
  };
  try {
    assert.deepEqual(await chooseDouzeroAction(observation, []), expected);
    assert.deepEqual(
      chooseDouzeroActionFromModel(
        {
          score() {
            throw Error("must not call inference");
          },
        } as any,
        observation,
        [],
      ),
      expected,
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("a possible win with a hidden bonus is not a guaranteed win", () => {
  const s = fixture();
  s.players[1].bonuses = [1];
  s.bonus[3].pop();
  s.players[1].goods = [10];
  // Actual result is 12:11, but a hidden 3-point bonus would lose 12:13.
  assert.equal(
    applyAction(s, { type: "sell", good: "diamond", count: 2 }).results[0]
      .winner,
    0,
  );
  assert.equal(findImmediateWinningAction(observe(s)), undefined);
  s.players[1].goods = [8];
  assertWin(s);
});

test("known own bonuses are removed from the opponent's bonus upper bound", () => {
  const s = fixture();
  s.players[0].bonuses = [10, 10];
  s.players[1].bonuses = [8];
  s.bonus[5] = [8, 9];
  s.players[1].goods = [22];
  // Own 32 beats the maximum opposing 31; neither known 10 can be reused.
  assertWin(s);
});

test("new sale bonuses use their minimum possible value and respect exhaustion", () => {
  const s = fixture();
  s.players[0].hand.push("diamond");
  rebuildDeck(s);
  s.players[1].goods = [14];
  // 7 + 5 + a random 1..3 bonus is not a certain win against 14.
  assert.equal(findImmediateWinningAction(observe(s)), undefined);
  s.players[1].goods = [12];
  assert.deepEqual(assertWin(s), { type: "sell", good: "diamond", count: 3 });
  s.bonus[3] = [];
  s.players[1].bonuses = [...BONUS_VALUES[3]];
  assert.equal(findImmediateWinningAction(observe(s)), undefined);
});

test("terminal draws require an unfillable market and a legal hand size", () => {
  const s = fixture();
  s.tokens.diamond = [7, 7, 5]; // No closing sale.
  s.players[0].goods = [1];
  leaveDeck(s, 1);
  assert.equal(findImmediateWinningAction(observe(s)), undefined);
  leaveDeck(s, 0);
  assert.equal(assertWin(s).type, "take");
  s.players[0].hand.push("cloth", "cloth", "spice", "spice", "gold");
  s.discard = [];
  rebuildDeck(s);
  leaveDeck(s, 0);
  assert.equal(findImmediateWinningAction(observe(s)), undefined);
});

test("collecting camels can close the round and change the camel award", () => {
  const s = fixture();
  s.tokens.diamond = [7, 7, 5];
  s.players[0].camels = 4;
  s.players[1].camels = 5;
  s.market = ["camel", "camel", "silver", "spice", "leather"];
  rebuildDeck(s);
  leaveDeck(s, 1);
  assert.deepEqual(assertWin(s), { type: "camels" });
  s.players[0].camels = 3;
  s.players[1].camels = 6;
  assert.equal(findImmediateWinningAction(observe(s)), undefined);
});

test("equal scores follow bonus count, then goods count; draws never qualify", () => {
  const s = fixture();
  s.players[0].camels = 5;
  s.players[1].camels = 5;
  s.market[0] = "camel";
  rebuildDeck(s);
  s.players[0].bonuses = [1, 1];
  s.bonus[3] = [2, 2, 2, 3, 3];
  s.players[1].goods = [9]; // 7 + 2 = 9; more bonuses wins.
  assertWin(s);
  s.players[0].bonuses = [];
  s.bonus[3] = [...BONUS_VALUES[3]];
  s.players[0].goods = [1, 1]; // 3 goods tokens versus 1 wins the tie.
  assertWin(s);
  s.players[1].goods = [3, 3, 3];
  assert.equal(findImmediateWinningAction(observe(s)), undefined);
  s.players[1].goods = [3, 2, 2, 2];
  assert.equal(findImmediateWinningAction(observe(s)), undefined);
});

test("no proof falls through to model scoring", () => {
  const observation = observe(newGame(25), [], 0.75);
  assert.equal(findImmediateWinningAction(observation), undefined);
  const actions = dmcActions(observation);
  let calls = 0;
  const action = chooseDouzeroActionFromModel(
    {
      score() {
        calls++;
        return actions.map((_, i) => i);
      },
    } as any,
    observation,
    [],
  );
  assert.equal(calls, 1);
  assert.deepEqual(action, actions.at(-1));
});

test("every proven win in deterministic playouts wins under the real engine", () => {
  let seed = 83;
  let proofs = 0;
  for (let game = 0; game < 40; game++) {
    let s = newGame(game + 1, 1);
    for (let turn = 0; turn < 200 && s.phase === "playing"; turn++) {
      const o = observe(s);
      const action = findImmediateWinningAction(o);
      if (action) {
        assertWin(s);
        proofs++;
      }
      const actions = dmcActions(o);
      const [u, next] = random(seed);
      seed = next;
      s = applyAction(s, actions[Math.floor(u * actions.length)]);
    }
  }
  assert.ok(proofs > 0);
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  newGame,
  applyAction,
  nextRound,
  legalActions,
  actionError,
} from "../src/game/engine.ts";
import { observe } from "../src/game/ai.ts";
import {
  dmcState,
  dmcAction,
  dmcActions,
  DMC_STATE,
  DMC_ACTION,
} from "../src/game/dmc.ts";
import { random } from "../src/game/data.ts";
import { dmcHistory, DMC_HISTORY_LENGTH } from "../src/game/dmc-history.ts";
import type { Event, Good } from "../src/game/types.ts";

test("DMC actions cover exactly the independent engine legal set, without equivalent-card duplicates", () => {
  let rng = 42,
    positions = 0;
  for (let seed = 6001; seed < 6009; seed++) {
    let s = newGame(seed);
    const events: Event[] = [];
    for (let turn = 0; turn < 80 && s.phase !== "finished"; turn++) {
      if (s.phase === "roundEnd") {
        s = nextRound(s);
        events.push({ type: "next" });
      }
      const o = observe(s, events, true),
        actions = dmcActions(o);
      const fullSaleActions = dmcActions(o, true);
      assert.ok(fullSaleActions.length > 0);
      for (const action of fullSaleActions) {
        assert.equal(actionError(s, action), null);
        if (action.type === "sell")
          assert.equal(action.count, o.hand.filter((g) => g === action.good).length);
      }
      assert.deepEqual(
        fullSaleActions.filter((a) => a.type !== "sell"),
        actions.filter((a) => a.type !== "sell"),
      );
      const keys = actions.map((a) => JSON.stringify(dmcAction(o, a)));
      assert.equal(new Set(keys).size, keys.length);
      assert.deepEqual(
        new Set(keys),
        new Set(legalActions(s).map((a) => JSON.stringify(dmcAction(o, a)))),
      );
      for (const a of actions) assert.equal(actionError(s, a), null);
      const x = dmcState(o, {
        ownSeals: s.seals[s.current],
        opponentSeals: s.seals[1 - s.current],
        round: s.round,
      });
      assert.equal(x.length, DMC_STATE);
      assert.equal(dmcAction(o, actions[0]).length, DMC_ACTION);
      for (let g = 0; g < 6; g++)
        assert.ok(
          Math.abs(
            x.slice(90 + g * 8, 98 + g * 8).reduce((a, b) => a + b, 0) - 1,
          ) < 1e-8,
        );
      assert.equal(Math.round(x[145] * 11), s.players[1 - s.current].camels);
      const [r, n] = random(rng);
      rng = n;
      const a = actions[Math.floor(r * actions.length)];
      s = applyAction(s, a);
      events.push(a);
      positions++;
    }
  }
  assert.ok(positions > 300);
});

test("DMC input is invariant to hidden opponent hand, deck order and bonus values", () => {
  const a = newGame(7421),
    b = structuredClone(a),
    other = 1 - a.current;
  const i = b.deck.findIndex(
    (c) => c !== "camel" && c !== b.players[other].hand[0],
  );
  const old = b.players[other].hand[0];
  b.players[other].hand[0] = b.deck[i] as Good;
  b.deck[i] = old;
  b.deck.reverse();
  a.players[other].bonuses = [a.bonus[3].pop()!];
  b.players[other].bonuses = [b.bonus[3].shift()!];
  const context = { ownSeals: 0, opponentSeals: 0, round: 1 };
  assert.deepEqual(
    dmcState(observe(a, [], true), context),
    dmcState(observe(b, [], true), context),
  );
});

test("incremental public opponent knowledge matches a fresh replay", () => {
  let rng = 8127;
  for (let seed = 8201; seed < 8205; seed++) {
    let state = newGame(seed);
    const events: Event[] = [];
    for (let turn = 0; turn < 130 && state.phase !== "finished"; turn++) {
      if (state.phase === "roundEnd") {
        state = nextRound(state);
        events.push({ type: "next" });
      }
      const cached = observe(state, events, 0.75);
      const fresh = observe(state, events.slice(), 0.75);
      assert.deepEqual(cached.knownOpponentHand, fresh.knownOpponentHand);
      const actions = legalActions(state);
      const [r, next] = random(rng);
      rng = next;
      const action = actions[Math.floor(r * actions.length)];
      state = applyAction(state, action);
      events.push(action);
    }
  }
});

test("public knowledge cache invalidates when an event history branches", () => {
  const start = newGame(8421);
  const alternatives = legalActions(start).filter((a) => a.type === "take");
  assert.ok(alternatives.length >= 2);
  const events: Event[] = [alternatives[0]];
  observe(applyAction(start, alternatives[0]), events, 0.75);
  events[0] = alternatives[1];
  const state = applyAction(start, alternatives[1]);
  assert.deepEqual(
    observe(state, events, 0.75).knownOpponentHand,
    observe(state, events.slice(), 0.75).knownOpponentHand,
  );
});

test("DouZero history uses public actions and current-player perspective", () => {
  const action = Array(DMC_ACTION).fill(0);
  action[2] = 1;
  const moves = Array.from({ length: DMC_HISTORY_LENGTH + 1 }, (_, i) => ({
    actor: i % 2,
    action: [...action],
  }));
  const self = dmcHistory(moves, 0);
  const other = dmcHistory(moves, 1);
  assert.equal(self.length, DMC_HISTORY_LENGTH);
  assert.deepEqual(self.map((row) => row.slice(2)), other.map((row) => row.slice(2)));
  for (let i = 0; i < DMC_HISTORY_LENGTH; i++) {
    assert.deepEqual(self[i].slice(0, 2), other[i].slice(0, 2).reverse());
    assert.equal(self[i][0], (i + 1) % 2 === 0 ? 1 : 0);
  }
  assert.ok(dmcHistory([], 0).every((row) => row.every((value) => value === 0)));
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  replayTransition,
  actionTransition,
} from "../src/game/action-transition.ts";
import { createTutorialSave, TUTORIAL_ACTIONS } from "../src/game/tutorial.ts";
import { advance, replay } from "../src/game/storage.ts";
import { legalActions, newGame } from "../src/game/engine.ts";
import { marketSlotsAt } from "../src/game/opponent-turn.ts";
import { actionSummaries } from "../src/game/receipts.ts";
import { playerScoreDisplay } from "../src/game/score-display.ts";
import { presentAction } from "../src/game/presentation.ts";
import type { Action, Save } from "../src/game/types.ts";

test("opponent market selections stay visible before fading, including in reduced motion replay", () => {
  const save = { ...createTutorialSave(), events: TUTORIAL_ACTIONS };
  const checked = new Set<string>();
  for (let index = 0; index < save.events.length; index++) {
    const before = replay(save, index);
    const action = save.events[index];
    if (before.current !== 1 || action.type === "sell") continue;
    for (const reduced of [false, true]) {
      const step = replayTransition(save, index, { mobile: true, reduced })!;
      assert.ok(step.feedback!.departures.length > 0);
      assert.ok(step.departureHoldMs >= 1000);
      assert.ok(step.duration > step.departureHoldMs);
    }
    checked.add(action.type);
  }
  assert.ok(checked.has("take"));
  assert.ok(checked.has("camels"));
});

test("replay uses the same action transitions as a match for every tutorial action without changing the save", () => {
  const save = { ...createTutorialSave(), events: TUTORIAL_ACTIONS };
  const snapshot = structuredClone(save);
  for (const mobile of [true, false]) {
    for (let index = 0; index < save.events.length; index++) {
      const before = replay(save, index);
      const after = advance(before, save.events[index]);
      const options = { mobile, reduced: false, revealOpponent: true };
      const step = replayTransition(save, index, options)!;
      const live = actionTransition(
        before,
        save.events[index],
        after,
        marketSlotsAt(save, index),
        index,
        options,
      );
      assert.deepEqual(step, { ...live, replayTarget: index + 1 });
      assert.equal(step.eventLimit, index);
      assert.ok(step.duration > 0);
      if (mobile) assert.deepEqual(step.flights, []);
      else assert.ok(step.flights.length > 0);
    }
  }
  assert.deepEqual(save, snapshot);
  for (const index of [-1, 0.5, save.events.length, save.events.length + 1])
    assert.equal(
      replayTransition(save, index, { mobile: true, reduced: false }),
      null,
    );
});

test("replay round transitions deal the new round and clear the old round's action summary", () => {
  const save: Save = {
    version: 1,
    seed: 41,
    targetSeals: 2,
    difficulty: "easy",
    events: [],
  };
  let state = newGame(save.seed, 2);
  for (let i = 0; state.phase === "playing" && i < 400; i++) {
    const actions = legalActions(state);
    const action = actions.find((a) => a.type === "sell") ?? actions[0];
    save.events.push(action);
    state = advance(state, action);
  }
  assert.equal(state.phase, "roundEnd");
  const index = save.events.length;
  save.events.push({ type: "next" });
  const step = replayTransition(save, index, {
    mobile: true,
    reduced: false,
    revealOpponent: true,
  })!;
  assert.equal(step.kind, "deal");
  assert.equal(step.before.round, state.round + 1);
  assert.equal(step.before.phase, "playing");
  assert.equal(step.eventLimit, index + 1);
  assert.equal(step.replayTarget, index + 1);
  assert.deepEqual(actionSummaries(save, step.eventLimit, true).lastActions, [
    null,
    null,
  ]);
});

test("revealing replay scores does not change the live privacy projection or award camel points early", () => {
  const state = newGame(7);
  state.players[1].goods = [7, 6];
  state.players[1].bonuses = [3, 10];
  state.players[1].camels = 8;
  state.players[0].camels = 1;
  assert.equal(playerScoreDisplay(state, 1).hidden, true);
  assert.deepEqual(playerScoreDisplay(state, 1, true), {
    total: 26,
    goods: 13,
    bonus: 13,
    goodsTokenCount: 2,
    bonusTokenCount: 2,
    hidden: false,
  });
  assert.equal(playerScoreDisplay(state, 1).total, null);
});

test("opponent bonus faces are revealed in replay receipts and sale animations only when requested", () => {
  let save: Save | undefined;
  let sale: Action | undefined;
  for (let seed = 1; seed < 2000; seed++) {
    const state = newGame(seed);
    if (state.current !== 0) continue;
    const first = legalActions(state)[0];
    const next = advance(state, first);
    sale = legalActions(next).find((a) => a.type === "sell" && a.count >= 3);
    if (sale) {
      save = { version: 1, seed, difficulty: "easy", events: [first, sale] };
      break;
    }
  }
  assert.ok(save && sale);
  const before = replay(save, 1);
  const after = replay(save, 2);
  const actual = after.players[1].bonuses.at(-1)!;
  assert.equal(presentAction(before, sale, after).bonus, "hidden");
  assert.equal(actionSummaries(save).receipts[1]!.bonus, "hidden");
  assert.equal(actionSummaries(save, 2, true).receipts[1]!.bonus, actual);
  assert.equal(
    replayTransition(save, 1, {
      mobile: true,
      reduced: false,
      revealOpponent: true,
    })!.action.bonus,
    actual,
  );
  assert.equal(
    replayTransition(save, 1, { mobile: true, reduced: false })!.action.bonus,
    "hidden",
  );
});

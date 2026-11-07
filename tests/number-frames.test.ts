import test from "node:test";
import assert from "node:assert/strict";
import { numberFrames } from "../src/game/number-frames.ts";
import { actionTransition } from "../src/game/action-transition.ts";
import { createTutorialSave, TUTORIAL_ACTIONS } from "../src/game/tutorial.ts";
import { advance, replay } from "../src/game/storage.ts";
import { marketSlotsAt } from "../src/game/opponent-turn.ts";
import { newGame } from "../src/game/engine.ts";
import { playerScoreDisplay } from "../src/game/score-display.ts";

test("incremental numbers reach the engine result without replacing cards, advancing the turn or mutating the save", () => {
  const save = { ...createTutorialSave(), events: TUTORIAL_ACTIONS };
  for (let index = 0; index < save.events.length; index++) {
    const before = replay(save, index);
    const snapshot = structuredClone(before);
    const after = advance(before, save.events[index]);
    const step = actionTransition(
      before,
      save.events[index],
      after,
      marketSlotsAt(save, index),
      index,
      { mobile: true, reduced: false, revealOpponent: true },
    );
    const frames = numberFrames(step);
    for (const frame of frames) {
      assert.equal(frame.state.current, before.current);
      assert.equal(frame.state.turn, before.turn);
      assert.deepEqual(frame.state.market, before.market);
      assert.deepEqual(
        frame.state.players.map((p) => p.hand),
        before.players.map((p) => p.hand),
      );
      assert.ok(frame.at < step.duration);
    }
    const final = frames.at(-1)?.state ?? before;
    assert.equal(final.deck.length, after.deck.length);
    assert.deepEqual(final.tokens, after.tokens);
    assert.deepEqual(
      Object.values(final.bonus).map((a) => a.length),
      Object.values(after.bonus).map((a) => a.length),
    );
    for (const actor of [0, 1] as const) {
      assert.equal(final.players[actor].camels, after.players[actor].camels);
      assert.deepEqual(final.players[actor].goods, after.players[actor].goods);
      assert.deepEqual(
        final.players[actor].bonuses,
        after.players[actor].bonuses,
      );
    }
    assert.deepEqual(before, snapshot);
  }
});

test("camel and deck counts change at the respective arrivals and departures, with visible intermediate counts", () => {
  const save = { ...createTutorialSave(), events: TUTORIAL_ACTIONS };
  const before = replay(save, 4);
  const step = actionTransition(
    before,
    { type: "camels" },
    advance(before, { type: "camels" }),
    marketSlotsAt(save, 4),
    4,
    { mobile: true, reduced: false },
  );
  const frames = numberFrames(step);
  assert.deepEqual(
    [...new Set(frames.map((f) => f.state.players[0].camels))],
    [1, 2, 3, 4],
  );
  const arrivals = step.flights.filter((f) => f.to === "your-herd");
  for (const [i, arrival] of arrivals.entries()) {
    const landed = frames
      .filter((f) => f.at <= arrival.end * step.duration + 0.01)
      .at(-1)!;
    assert.equal(
      landed.state.players[0].camels,
      before.players[0].camels + i + 1,
    );
  }
  assert.equal(frames[0].state.deck.length, before.deck.length - 1);
});

test("sale inventory is deducted at takeoff, money at landing, and hidden bonus faces stay private", () => {
  const before = newGame(3);
  before.current = 1;
  before.players[1].hand = ["spice", "spice", "spice"];
  const action = { type: "sell", good: "spice", count: 3 } as const;
  const after = advance(before, action);
  const step = actionTransition(before, action, after, [0, 1, 2, 3, 4], 0, {
    mobile: true,
    reduced: false,
  });
  const frames = numberFrames(step);
  assert.equal(
    frames[0].state.tokens.spice.length,
    before.tokens.spice.length - 1,
  );
  assert.deepEqual(frames[0].state.players[1].goods, before.players[1].goods);
  const final = frames.at(-1)!.state;
  assert.equal(
    final.players[1].bonuses.length,
    after.players[1].bonuses.length,
  );
  for (const frame of frames) {
    const score = playerScoreDisplay(frame.state, 1);
    assert.equal(score.total, null);
    assert.equal(score.bonus, null);
  }
  assert.equal(final.players[1].bonuses.at(-1), 0);
});

import test from "node:test";
import assert from "node:assert/strict";
import { replayBoardIndex } from "../src/game/replay-position.ts";
import { createTutorialSave, TUTORIAL_ACTIONS } from "../src/game/tutorial.ts";
import { advance, replay } from "../src/game/storage.ts";
import { actionSummaries } from "../src/game/receipts.ts";
import { marketSlotsAt } from "../src/game/opponent-turn.ts";
import { nextMarketSlots } from "../src/game/market-layout.ts";
import { chooseAction, observe } from "../src/game/ai.ts";
import type { Save } from "../src/game/types.ts";

test("reviewing an exchange shows its original payment and market before the action, then its actual result after", () => {
  const save = { ...createTutorialSave(), events: TUTORIAL_ACTIONS };
  const selected = 7;
  const event = save.events[selected - 1];
  assert.equal(event.type, "exchange");
  const beforeIndex = replayBoardIndex(selected, "before");
  const afterIndex = replayBoardIndex(selected, "after");
  const before = replay(save, beforeIndex);
  const after = replay(save, afterIndex);
  assert.equal(beforeIndex, 6);
  assert.deepEqual(advance(before, event), after);
  assert.equal(before.players[0].camels - after.players[0].camels, 2);
  assert.deepEqual(
    marketSlotsAt(save, afterIndex),
    nextMarketSlots(
      before,
      event,
      after,
      marketSlotsAt(save, beforeIndex),
    ),
  );
  const beforeNotes = actionSummaries(save, beforeIndex, true);
  const afterNotes = actionSummaries(save, afterIndex, true);
  assert.notDeepEqual(beforeNotes.lastActions[0], afterNotes.lastActions[0]);
  assert.equal(afterNotes.lastActions[0]!.type, "exchange");
});

test("the final action's before view remains playable and the after view reveals the settlement", () => {
  const save: Save = { ...createTutorialSave(), events: [] };
  let state = replay(save);
  while (state.phase === "playing" && save.events.length < 200) {
    const event = chooseAction(observe(state), "easy");
    save.events.push(event);
    state = advance(state, event);
  }
  assert.equal(state.phase, "finished");
  assert.equal(
    replay(save, replayBoardIndex(save.events.length, "before")).phase,
    "playing",
  );
  assert.equal(
    replay(save, replayBoardIndex(save.events.length, "after")).phase,
    "finished",
  );
  // Viewing a result changes only the projection, never the stored game.
  assert.deepEqual(replay(save), state);
});

test("the opening view has no negative history index in either display mode", () => {
  assert.equal(replayBoardIndex(0, "before"), 0);
  assert.equal(replayBoardIndex(0, "after"), 0);
  assert.equal(replayBoardIndex(1, "before"), 0);
});

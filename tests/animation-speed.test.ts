import test from "node:test";
import assert from "node:assert/strict";
import { replayTransition } from "../src/game/action-transition.ts";
import { numberFrames } from "../src/game/number-frames.ts";
import { createTutorialSave, TUTORIAL_ACTIONS } from "../src/game/tutorial.ts";

const save = { ...createTutorialSave(), events: TUTORIAL_ACTIONS };

test("faster presets scale holds, travel and number checkpoints on the same clock", () => {
  for (let index = 0; index < save.events.length; index++) {
    const original = replayTransition(save, index, {
      mobile: true,
      reduced: false,
    })!;
    for (const speed of [1.1, 1.2, 1.3]) {
      const faster = replayTransition(save, index, {
        mobile: true,
        reduced: false,
        speed,
      })!;
      assert.ok(Math.abs(faster.duration * speed - original.duration) < 0.001);
      assert.ok(
        Math.abs(faster.departureHoldMs * speed - original.departureHoldMs) <
          0.001,
      );
      assert.deepEqual(faster.flights, original.flights);
      const before = numberFrames(original);
      const after = numberFrames(faster);
      assert.equal(after.length, before.length);
      after.forEach((frame, i) => {
        assert.ok(Math.abs(frame.at * speed - before[i].at) < 0.001);
        assert.deepEqual(frame.state, before[i].state);
      });
    }
  }
});

test("reduced-motion timing stays readable when a faster preset is supplied", () => {
  assert.deepEqual(
    replayTransition(save, 0, { mobile: true, reduced: true, speed: 1.3 }),
    replayTransition(save, 0, { mobile: true, reduced: true }),
  );
});

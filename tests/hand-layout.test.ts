import test from "node:test";
import assert from "node:assert/strict";
import { newGame, applyAction } from "../src/game/engine.ts";
import { actionTransition } from "../src/game/action-transition.ts";
import { retainedHandSlots } from "../src/game/hand-layout.ts";
import type { Action } from "../src/game/types.ts";

function motion(action: Action, actor: 0 | 1 = 0) {
  const before = newGame(17);
  before.current = actor;
  before.players[actor].hand = [
    "cloth",
    "spice",
    "leather",
    "spice",
    "gold",
    "leather",
    "gold",
  ];
  before.market = ["diamond", "silver", "camel", "cloth", "leather"];
  return actionTransition(
    before,
    action,
    applyAction(before, action),
    [0, 1, 2, 3, 4],
    0,
    { mobile: true, reduced: false },
  );
}

test("sale compacts the exact surviving slots, retaining duplicate goods in order", () => {
  const transition = motion({ type: "sell", good: "spice", count: 2 });
  assert.deepEqual(retainedHandSlots(transition, 0, 7), [0, 2, 4, 5, 6]);
  assert.deepEqual(retainedHandSlots(transition, 1, 4), [0, 1, 2, 3]);
});

test("exchange closes only paid hand slots before incoming goods are appended", () => {
  const transition = motion({
    type: "exchange",
    market: [0, 1],
    hand: [1, 5],
    camels: 0,
  });
  assert.deepEqual(retainedHandSlots(transition, 0, 7), [0, 2, 3, 4, 6]);
});

test("opponent compaction follows public outgoing count and generic departing backs", () => {
  const transition = motion({ type: "sell", good: "spice", count: 2 }, 1);
  assert.deepEqual(retainedHandSlots(transition, 1, 7), [2, 3, 4, 5, 6]);
  assert.deepEqual(retainedHandSlots(transition, 0, 3), [0, 1, 2]);
});

test("selling an entire hand leaves no cards to slide", () => {
  const transition = motion({ type: "sell", good: "spice", count: 2 });
  assert.deepEqual(
    retainedHandSlots(
      {
        ...transition,
        feedback: {
          ...transition.feedback!,
          departures: [
            { anchor: "hand-0", label: "出售" },
            { anchor: "hand-1", label: "出售" },
          ],
        },
      },
      0,
      2,
    ),
    [],
  );
});

test("packed hand landing reaches the final right edge while sparse cards remain left aligned", async () => {
  const { handSlotOffset } = await import("../src/game/hand-layout.ts");
  assert.equal(handSlotOffset(247, 42, 3, 0, 6), 0);
  assert.equal(handSlotOffset(247, 42, 3, 2, 6), 96);
  assert.ok(Math.abs(handSlotOffset(247, 42, 7, 6, 6) + 42 - 247) < 0.01);
});

test("opponent compaction uses identical back-only flights for different concealed hands", async () => {
  const before = newGame(17);
  before.current = 1;
  before.players[1].hand = [
    "cloth",
    "spice",
    "gold",
    "spice",
    "silver",
    "leather",
    "gold",
  ];
  const action = { type: "sell" as const, good: "spice" as const, count: 2 };
  const first = actionTransition(
    before,
    action,
    applyAction(before, action),
    [0, 1, 2, 3, 4],
    0,
    { mobile: true, reduced: false },
  );
  const changed = structuredClone(before);
  changed.players[1].hand = [
    "diamond",
    "cloth",
    "spice",
    "gold",
    "spice",
    "silver",
    "leather",
  ];
  const second = actionTransition(
    changed,
    action,
    applyAction(changed, action),
    [0, 1, 2, 3, 4],
    0,
    { mobile: true, reduced: false },
  );
  assert.deepEqual(
    first.flights.filter((f) => f.layout),
    second.flights.filter((f) => f.layout),
  );
  assert.ok(
    first.flights
      .filter((f) => f.layout)
      .every((f) => f.fromBack && f.toBack && f.good === "camel"),
  );
});

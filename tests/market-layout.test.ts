import test from "node:test";
import assert from "node:assert/strict";
import { newGame, applyAction, legalActions } from "../src/game/engine.ts";
import { actionFlights } from "../src/game/flights.ts";
import {
  initialMarketSlots,
  nextMarketSlots,
  takenMarketIndices,
} from "../src/game/market-layout.ts";

test("repeated transactions keep every untouched market card in its visual slot", () => {
  let state = newGame(3),
    slots = initialMarketSlots();
  const seen = new Set<string>();
  for (let turn = 0; turn < 80 && state.phase === "playing"; turn++) {
    const actions = legalActions(state);
    const action = actions[(turn * 17 + 3) % actions.length];
    seen.add(action.type);
    const next = applyAction(state, action);
    const nextSlots = nextMarketSlots(state, action, next, slots);
    const taken = takenMarketIndices(state, action);
    const retained = slots.filter((_, i) => !taken.includes(i));
    assert.deepEqual(nextSlots.slice(0, retained.length), retained);
    assert.equal(new Set(nextSlots).size, next.market.length);
    assert.ok(nextSlots.every((slot) => slot >= 0 && slot < 5));
    const flights = actionFlights(state, action, next, slots);
    for (const i of taken) {
      assert.ok(flights.some((f) => f.from === `market-${slots[i]}`));
    }
    assert.ok(
      !flights.some(
        (f) => f.from.startsWith("market-") && f.to.startsWith("market-"),
      ),
    );
    state = next;
    slots = nextSlots;
  }
  assert.ok(seen.size >= 3);
});

test("multiple camels refill only vacated positions, including an exhausted deck", () => {
  const state = newGame(3);
  state.market = ["camel", "gold", "camel", "cloth", "leather"];
  state.deck = ["silver"];
  const slots = [3, 1, 4, 0, 2];
  const action = { type: "camels" as const };
  const next = applyAction(state, action);
  assert.deepEqual(nextMarketSlots(state, action, next, slots), [1, 0, 2, 3]);
  const flights = actionFlights(state, action, next, slots);
  assert.deepEqual(
    flights.filter((f) => f.from === "deck").map((f) => f.to),
    ["market-3"],
  );
  assert.equal(flights.length, 3);
});

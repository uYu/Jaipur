import test from "node:test";
import assert from "node:assert/strict";
import { newGame, applyAction } from "../src/game/engine.ts";
import { settlementFlights } from "../src/game/settlement-flights.ts";

function table(actor = 0) {
  const state = newGame(3);
  state.current = actor;
  state.market = ["gold", "cloth", "camel", "leather", "camel"];
  state.players[actor].hand = ["silver", "spice", "spice"];
  state.players[actor].camels = 2;
  return state;
}

test("taking goods or camels moves only the chosen market cards to the actor", () => {
  for (const actor of [0, 1]) {
    const before = table(actor);
    const slots = [4, 2, 0, 3, 1];
    const take = { type: "take" as const, index: 1 };
    const flights = settlementFlights(
      before,
      take,
      applyAction(before, take),
      slots,
    );
    assert.equal(flights.length, 1);
    assert.equal(flights[0].from, "market-2");
    assert.equal(flights[0].to, actor === 0 ? "your-hand" : "opponent-hand");
    assert.equal(flights[0].good, "cloth");
    assert.equal(flights[0].hideSource, true);
    assert.equal(flights[0].toBack, actor === 1);

    const camels = { type: "camels" as const };
    const herd = settlementFlights(
      before,
      camels,
      applyAction(before, camels),
      slots,
    );
    assert.deepEqual(
      herd.map((flight) => flight.from),
      ["market-0", "market-1"],
    );
    assert.ok(
      herd.every(
        (flight) => flight.to === (actor === 0 ? "your-herd" : "opponent-herd"),
      ),
    );
    assert.ok(
      herd.every((flight) => flight.good === "camel" && flight.hideSource),
    );
    assert.ok(
      [...flights, ...herd].every(
        (flight) => flight.from !== "deck" && flight.coin === undefined,
      ),
    );
  }
});

test("exchange keeps traded directions and visual slots without moving unrelated hand cards", () => {
  for (const actor of [0, 1]) {
    const before = table(actor);
    const action = {
      type: "exchange" as const,
      market: [0, 1],
      hand: [1],
      camels: 1,
    };
    const slots = [4, 2, 0, 3, 1];
    const flights = settlementFlights(
      before,
      action,
      applyAction(before, action),
      slots,
    );
    assert.equal(flights.length, 4);
    const incoming = flights.filter((flight) =>
      flight.from.startsWith("market-"),
    );
    assert.deepEqual(
      incoming.map((flight) => flight.from),
      ["market-4", "market-2"],
    );
    assert.ok(
      incoming.every(
        (flight) => flight.to === (actor === 0 ? "your-hand" : "opponent-hand"),
      ),
    );
    assert.ok(
      incoming.every(
        (flight) => flight.hideSource && flight.toBack === (actor === 1),
      ),
    );
    const paid = flights.filter((flight) => flight.to.startsWith("market-"));
    assert.deepEqual(
      paid.map((flight) => [flight.from, flight.to, flight.good]),
      [
        [actor === 0 ? "hand-1" : "opponent-hand", "market-2", "spice"],
        [actor === 0 ? "your-herd" : "opponent-herd", "market-4", "camel"],
      ],
    );
    assert.ok(paid.every((flight) => flight.fromBack === (actor === 1)));
    assert.equal(paid[0].hideSource, actor === 0);
    assert.ok(!flights.some((flight) => flight.good === "silver"));
    assert.ok(
      !flights.some(
        (flight) =>
          flight.from === "hand-2" ||
          flight.from === "deck" ||
          flight.coin !== undefined,
      ),
    );
    assert.ok(
      Math.max(...incoming.map((flight) => flight.end)) <
        Math.min(...paid.map((flight) => flight.start)),
    );
  }
});

test("five-card exchange completes incoming cards before any payment starts", () => {
  const before = table();
  before.market = ["gold", "gold", "leather", "cloth", "silver"];
  before.players[0].hand = ["spice", "spice", "spice"];
  const action = {
    type: "exchange" as const,
    market: [0, 1, 2, 3, 4],
    hand: [0, 1, 2],
    camels: 2,
  };
  const flights = settlementFlights(
    before,
    action,
    applyAction(before, action),
  );
  const incoming = flights.filter((flight) =>
    flight.from.startsWith("market-"),
  );
  const outgoing = flights.filter((flight) => flight.to.startsWith("market-"));
  assert.equal(incoming.length, 5);
  assert.equal(outgoing.length, 5);
  assert.ok(
    incoming.every(
      (flight) =>
        flight.start >= 0 &&
        flight.start < flight.end &&
        flight.end <= 0.42,
    ),
  );
  assert.ok(
    outgoing.every(
      (flight) =>
        flight.start >= 0.5 &&
        flight.start < flight.end &&
        flight.end <= 0.9,
    ),
  );
  assert.ok(
    Math.max(...incoming.map((flight) => flight.end)) <
      Math.min(...outgoing.map((flight) => flight.start)),
  );
});

test("sales cover every sold card, omit retained cards and never fly payment tokens", () => {
  for (const actor of [0, 1]) {
    for (const count of [1, 3, 6, 7]) {
      const before = table(actor);
      before.players[actor].hand = Array(count).fill("spice");
      if (count < 7) before.players[actor].hand.push("diamond");
      before.tokens.spice = [3];
      const action = { type: "sell" as const, good: "spice" as const, count };
      const flights = settlementFlights(
        before,
        action,
        applyAction(before, action),
      );
      assert.equal(flights.length, count);
      assert.ok(
        flights.every(
          (flight) => flight.to === "sale" && flight.good === "spice",
        ),
      );
      assert.ok(
        flights.every(
          (flight) =>
            flight.fromBack === (actor === 1) &&
            flight.hideSource === (actor === 0),
        ),
      );
      assert.ok(
        flights.every(
          (flight) => flight.coin === undefined && !flight.hideTarget,
        ),
      );
      assert.deepEqual(
        flights.map((flight) => flight.slot),
        Array.from({ length: count }, (_, i) => i),
      );
      if (actor === 0)
        assert.deepEqual(
          flights.map((flight) => flight.from),
          Array.from({ length: count }, (_, i) => `hand-${i}`),
        );
      else
        assert.ok(flights.every((flight) => flight.from === "opponent-hand"));
      assert.ok(!JSON.stringify(flights).includes("diamond"));
    }
  }
});

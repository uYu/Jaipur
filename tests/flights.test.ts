import test from "node:test";
import assert from "node:assert/strict";
import { newGame, applyAction } from "../src/game/engine.ts";
import { actionFlights, dealFlights } from "../src/game/flights.ts";
function table(actor = 0) {
  const s = newGame(3);
  s.current = actor;
  s.market = ["gold", "cloth", "camel", "leather", "camel"];
  s.players[actor].hand = ["silver", "spice", "spice"];
  s.players[actor].camels = 2;
  return s;
}
test("take flies from market to next hand slot and refills from deck, preserving market order", () => {
  const s = table();
  const a = { type: "take" as const, index: 1 };
  const next = applyAction(s, a),
    f = actionFlights(s, a, next);
  assert.deepEqual(f.find((x) => x.from === "market-1")?.to, "your-hand");
  assert.equal(f.find((x) => x.from === "market-1")?.slot, 3);
  const refill = f.filter((x) => x.from === "deck");
  assert.equal(refill.length, 1);
  assert.equal(refill[0].to, "market-4");
  assert.equal(refill[0].good, next.market[4]);
  assert.equal(refill[0].fromBack, true);
  assert.equal(f.find((x) => x.from === "market-2")?.to, "market-1");
});
test("exchange flies both ways with no deck draw and matches engine slot order", () => {
  const s = table();
  const a = { type: "exchange" as const, market: [0, 1], hand: [1], camels: 1 };
  const f = actionFlights(s, a, applyAction(s, a));
  assert.ok(!f.some((x) => x.from === "deck"));
  assert.equal(f.find((x) => x.from === "hand-1")?.to, "market-3");
  assert.equal(f.find((x) => x.from === "your-herd")?.to, "market-4");
  assert.equal(f.find((x) => x.from === "market-0")?.slot, 2);
  assert.equal(f.find((x) => x.from === "hand-2")?.slot, 1);
});
test("sale flies only sold cards to sale area and actual coins to seller; hidden bonus remains hidden", () => {
  for (const actor of [0, 1]) {
    const s = table(actor);
    s.players[actor].hand = ["spice", "spice", "spice", "silver"];
    s.tokens.spice = [3];
    const a = { type: "sell" as const, good: "spice" as const, count: 3 };
    const f = actionFlights(s, a, applyAction(s, a));
    assert.equal(f.filter((x) => x.to === "sale").length, 3);
    assert.ok(
      f.filter((x) => x.to === "sale").every((x) => x.good === "spice"),
    );
    assert.equal(f.find((x) => x.from === "token-spice-0")?.coin, 3);
    assert.equal(
      f.find((x) => x.from === "token-spice-0")?.to,
      `payment-${actor}-0`,
    );
    if (actor) assert.equal(f.find((x) => x.from === "bonus-3")?.coin, "?");
  }
});
test("AI incoming goods flip to backs and no hidden remaining hand enters plans", () => {
  const s = table(1);
  const a = { type: "take" as const, index: 0 };
  const f = actionFlights(s, a, applyAction(s, a));
  assert.equal(f[0].to, "opponent-hand");
  assert.equal(f[0].toBack, true);
  assert.ok(!f.some((x) => x.good === "silver" || x.good === "spice"));
});

test("initial deal travels from deck to actual hand slots without revealing opponent goods", () => {
  const s = table(0);
  const f = dealFlights(s);
  assert.ok(f.every((x) => x.from === "deck"));
  assert.equal(
    f.filter((x) => x.to.startsWith("hand-")).length,
    s.players[0].hand.length,
  );
  assert.ok(
    f
      .filter((x) => x.to === "opponent-hand")
      .every((x) => x.fromBack && x.toBack),
  );
  assert.ok(f.every((x) => x.end < 1));
});

test("two silver coins keep separate sources and destinations and hold visibly after landing", () => {
  const s = table();
  s.players[0].hand = ["silver", "silver"];
  const a = { type: "sell" as const, good: "silver" as const, count: 2 };
  const f = actionFlights(s, a, applyAction(s, a)).filter(
    (x) => x.coin !== undefined,
  );
  assert.deepEqual(
    f.map((x) => x.coin),
    [5, 5],
  );
  assert.deepEqual(
    f.map((x) => x.from),
    ["token-silver-0", "token-silver-1"],
  );
  assert.deepEqual(
    f.map((x) => x.to),
    ["payment-0-0", "payment-0-1"],
  );
  assert.ok(f.every((x) => x.end <= 0.82 && x.hideSource && x.hideTarget));
});

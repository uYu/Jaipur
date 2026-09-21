import test from "node:test";
import assert from "node:assert/strict";
import { newGame, applyAction } from "../src/game/engine.ts";
import { presentAction } from "../src/game/presentation.ts";
test("exchange animation identifies incoming goods and surrendered goods/camels for both actors", () => {
  for (const actor of [0, 1]) {
    const s = newGame(2);
    s.current = actor;
    s.market = ["gold", "gold", "camel", "spice", "cloth"];
    s.players[actor].hand = ["leather", "silver"];
    s.players[actor].camels = 2;
    const action = {
      type: "exchange" as const,
      market: [0, 1],
      hand: [0],
      camels: 1,
    };
    const p = presentAction(s, action, applyAction(s, action));
    assert.deepEqual(p, {
      actor,
      type: "exchange",
      incoming: ["gold", "gold"],
      outgoing: ["leather", "camel"],
      coins: [],
      bonus: null,
    });
  }
});
test("sale animation shows actual tokens, keeps opponents bonus secret and omits unsold hand", () => {
  for (const actor of [0, 1]) {
    const s = newGame(2);
    s.current = actor;
    s.players[actor].hand = ["cloth", "cloth", "cloth", "diamond"];
    s.tokens.cloth = [2];
    const action = { type: "sell" as const, good: "cloth" as const, count: 3 };
    const n = applyAction(s, action);
    const p = presentAction(s, action, n);
    assert.deepEqual(p.outgoing, ["cloth", "cloth", "cloth"]);
    assert.deepEqual(p.coins, [2]);
    assert.equal(p.bonus, actor === 0 ? n.players[actor].bonuses[0] : "hidden");
    assert.ok(!JSON.stringify(p).includes("diamond"));
  }
});
test("take and camel animation use the previous market rather than refilled cards", () => {
  const s = newGame(2);
  s.current = 0;
  s.market = ["gold", "camel", "camel", "spice", "cloth"];
  const take = { type: "take" as const, index: 0 };
  assert.deepEqual(presentAction(s, take, applyAction(s, take)).incoming, [
    "gold",
  ]);
  const camels = { type: "camels" as const };
  assert.deepEqual(presentAction(s, camels, applyAction(s, camels)).incoming, [
    "camel",
    "camel",
  ]);
});

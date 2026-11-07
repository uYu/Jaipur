import test from "node:test";
import assert from "node:assert/strict";
import { applyAction, newGame } from "../src/game/engine.ts";
import { roundEndCause } from "../src/game/round-end-cause.ts";

test("the closing sale identifies the three depleted goods", () => {
  const before = newGame(3);
  before.current = 0;
  before.players[0].hand = ["leather"];
  before.tokens.diamond = [];
  before.tokens.gold = [];
  before.tokens.leather = [1];
  const after = applyAction(before, {
    type: "sell",
    good: "leather",
    count: 1,
  });
  assert.equal(after.results.at(-1)!.reason, "三类货物筹码售罄");
  const cause = roundEndCause(after)!;
  assert.equal(cause.kind, "tokens");
  if (cause.kind === "tokens")
    assert.deepEqual(cause.depleted, ["diamond", "gold", "leather"]);
});

test("an empty deck alone does not close the round; an unfillable market reports its actual shortfall", () => {
  const before = newGame(3);
  before.current = 0;
  before.deck = [];
  before.market = ["camel", "camel", "camel", "cloth", "gold"];
  assert.equal(roundEndCause(before), null);
  const after = applyAction(before, { type: "camels" });
  assert.equal(after.results.at(-1)!.reason, "牌堆已无法补满市场");
  assert.deepEqual(roundEndCause(after), {
    kind: "market",
    title: "牌堆无法补满市场",
    deckCount: 0,
    marketCount: 2,
  });
});

test("the notice follows engine priority when both end conditions hold", () => {
  const before = newGame(3);
  before.current = 0;
  before.deck = [];
  before.market = ["camel", "camel", "camel", "cloth", "gold"];
  before.tokens.diamond = [];
  before.tokens.gold = [];
  before.tokens.leather = [];
  assert.equal(
    roundEndCause(applyAction(before, { type: "camels" }))!.kind,
    "tokens",
  );
});

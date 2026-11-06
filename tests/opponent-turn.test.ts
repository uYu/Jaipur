import test from "node:test";
import assert from "node:assert/strict";
import { applyAction, legalActions, newGame } from "../src/game/engine.ts";
import {
  initialMarketSlots,
  nextMarketSlots,
} from "../src/game/market-layout.ts";
import {
  lastOpponentTurn,
  marketSlotsAt,
  presentOpponentTurn,
} from "../src/game/opponent-turn.ts";
import { advance } from "../src/game/storage.ts";
import type { Action, Save } from "../src/game/types.ts";

test("taking a card reports the actual refill even when it has the same face", () => {
  const before = newGame(2);
  before.current = 1;
  before.market = ["gold", "camel", "cloth", "spice", "leather"];
  before.deck = ["diamond", "gold"];
  const action: Action = { type: "take", index: 0 };
  const after = applyAction(before, action);
  const details = presentOpponentTurn(before, action, after);

  assert.deepEqual(details.market, {
    before: ["gold", "camel", "cloth", "spice", "leather"],
    after: ["camel", "cloth", "spice", "leather", "gold"],
    removed: ["gold"],
    added: ["gold"],
    beforeSlots: [0, 1, 2, 3, 4],
    afterSlots: [1, 2, 3, 4, 0],
    removedSlots: [0],
    addedSlots: [0],
  });
  assert.deepEqual(details.action.incoming, ["gold"]);
  assert.equal(details.handCount.after, details.handCount.before + 1);
  assert.deepEqual(details.goodsTokenCount, { before: 0, after: 0 });
  assert.equal(details.turn, before.turn + 1);
  assert.equal(details.round, before.round);

  details.market.before.pop();
  details.market.after.pop();
  assert.equal(before.market.length, 5);
  assert.equal(after.market.length, 5);
});

test("collecting camels shows public camel removal and real deck refill, not herd size", () => {
  const before = newGame(2);
  before.current = 1;
  before.market = ["camel", "gold", "camel", "spice", "camel"];
  before.deck = ["leather", "silver", "cloth"];
  before.players[1].camels = 87;
  const action: Action = { type: "camels" };
  const details = presentOpponentTurn(
    before,
    action,
    applyAction(before, action),
  );

  assert.deepEqual(details.market.removed, ["camel", "camel", "camel"]);
  assert.deepEqual(details.market.added, ["cloth", "silver", "leather"]);
  assert.deepEqual(details.handCount, {
    before: before.players[1].hand.length,
    after: before.players[1].hand.length,
  });
  assert.equal(details.action.incoming.length, 3);
  assert.ok(!JSON.stringify(details).includes("87"));
  assert.ok(!("camels" in details));
});

test("mixed exchanges expose only paid cards and camels, with correct market and hand changes", () => {
  const before = newGame(2);
  before.current = 1;
  before.market = ["gold", "spice", "gold", "camel", "cloth"];
  before.players[1].hand = ["diamond", "leather", "silver"];
  before.players[1].camels = 2;
  const action: Action = {
    type: "exchange",
    market: [2, 0],
    hand: [1],
    camels: 1,
  };
  const details = presentOpponentTurn(
    before,
    action,
    applyAction(before, action),
  );

  assert.deepEqual(details.action.incoming, ["gold", "gold"]);
  assert.deepEqual(details.action.outgoing, ["leather", "camel"]);
  assert.deepEqual(details.market, {
    before: before.market,
    after: ["spice", "camel", "cloth", "leather", "camel"],
    removed: ["gold", "gold"],
    added: ["leather", "camel"],
    beforeSlots: [0, 1, 2, 3, 4],
    afterSlots: [1, 3, 4, 0, 2],
    removedSlots: [2, 0],
    addedSlots: [0, 2],
  });
  assert.deepEqual(details.handCount, { before: 3, after: 4 });
  assert.ok(!JSON.stringify(details).includes("diamond"));
  assert.ok(!JSON.stringify(details).includes("silver"));
});

test("selling exposes public income and bonus count while hiding both old and new bonus faces", () => {
  const before = newGame(2);
  before.current = 1;
  before.market = ["gold", "gold", "camel", "spice", "cloth"];
  before.players[1].hand = ["leather", "leather", "leather", "diamond"];
  before.players[1].goods = [7, 5];
  before.players[1].bonuses = [76543];
  before.bonus[3] = [98765];
  const action: Action = { type: "sell", good: "leather", count: 3 };
  const details = presentOpponentTurn(
    before,
    action,
    applyAction(before, action),
  );

  assert.deepEqual(details.action.coins, [4, 3, 2]);
  assert.equal(details.action.bonus, "hidden");
  assert.deepEqual(details.handCount, { before: 4, after: 1 });
  assert.deepEqual(details.goodsScore, { before: 12, after: 21 });
  assert.deepEqual(details.goodsTokenCount, { before: 2, after: 5 });
  assert.deepEqual(details.bonusCount, { before: 1, after: 2 });
  assert.deepEqual(details.market, {
    before: before.market,
    after: before.market,
    removed: [],
    added: [],
    beforeSlots: [0, 1, 2, 3, 4],
    afterSlots: [0, 1, 2, 3, 4],
    removedSlots: [],
    addedSlots: [],
  });
  for (const secret of ["76543", "98765", "diamond", '"deck"', '"players"'])
    assert.ok(!JSON.stringify(details).includes(secret));
});

test("AI opening turn, visible replay prefix, and own turns preserve the right opponent transaction", () => {
  const save: Save = { version: 1, seed: 1000, difficulty: "easy", events: [] };
  let state = newGame(save.seed);
  let slots = initialMarketSlots();
  assert.equal(state.current, 1);
  const expected = [];
  for (let i = 0; i < 4; i++) {
    const action = legalActions(state).find((a) => a.type === "take")!;
    const next = advance(state, action);
    save.events.push(action);
    if (state.current === 1)
      expected.push(presentOpponentTurn(state, action, next, slots));
    slots = nextMarketSlots(state, action, next, slots);
    state = next;
  }

  assert.equal(lastOpponentTurn(null), null);
  assert.equal(lastOpponentTurn(save, 0), null);
  assert.equal(lastOpponentTurn(save, -1), null);
  assert.deepEqual(lastOpponentTurn(save, 1), expected[0]);
  assert.deepEqual(lastOpponentTurn(save, 2), expected[0]);
  assert.deepEqual(lastOpponentTurn(save, 3), expected[1]);
  assert.deepEqual(lastOpponentTurn(save), expected[1]);
  assert.equal(lastOpponentTurn(save, 1)?.turn, 1);
  assert.equal(lastOpponentTurn(save, 3)?.turn, 3);

  // Future events can be undisplayed, even invalid: projecting the visible
  // prefix must neither apply them nor disclose their contents.
  save.events.push({ type: "sell", good: "diamond", count: 100 });
  assert.deepEqual(lastOpponentTurn(save, 4), expected[1]);
});

test("opponent comparisons retain physical market slots after the player's previous refill", () => {
  for (const kind of ["take", "exchange"] as const) {
    const save: Save = { version: 1, seed: 7, difficulty: "easy", events: [] };
    let state = newGame(save.seed);
    assert.equal(state.current, 0);
    const playerAction: Action = { type: "camels" };
    save.events.push(playerAction);
    state = advance(state, playerAction);
    const opponentAction: Action =
      kind === "take"
        ? { type: "take", index: 0 }
        : { type: "exchange", market: [0, 1], hand: [2], camels: 1 };
    save.events.push(opponentAction);
    const details = lastOpponentTurn(save)!;

    assert.deepEqual(details.market.beforeSlots, [3, 4, 0, 1, 2]);
    assert.deepEqual(
      details.market.afterSlots,
      kind === "take" ? [4, 0, 1, 2, 3] : [0, 1, 2, 3, 4],
    );
    assert.deepEqual(
      details.market.removedSlots,
      kind === "take" ? [3] : [3, 4],
    );
    assert.deepEqual(details.market.addedSlots, details.market.removedSlots);
    for (const slot of details.market.beforeSlots) {
      if (details.market.removedSlots.includes(slot)) continue;
      assert.equal(
        details.market.after[details.market.afterSlots.indexOf(slot)],
        details.market.before[details.market.beforeSlots.indexOf(slot)],
      );
    }
  }
});

test("saved, replayed and pending markets use physical slots from only the visible event prefix", () => {
  const save: Save = {
    version: 1,
    seed: 7,
    difficulty: "easy",
    events: [
      { type: "camels" },
      { type: "take", index: 0 },
      { type: "take", index: 1 },
      { type: "take", index: 0 },
    ],
  };
  assert.deepEqual(marketSlotsAt(null), [0, 1, 2, 3, 4]);
  assert.deepEqual(marketSlotsAt(save, 0), [0, 1, 2, 3, 4]);
  assert.deepEqual(marketSlotsAt(save, -1), [0, 1, 2, 3, 4]);
  assert.deepEqual(marketSlotsAt(save, 1), [3, 4, 0, 1, 2]);
  assert.deepEqual(marketSlotsAt(save, 2), [4, 0, 1, 2, 3]);
  assert.deepEqual(marketSlotsAt(save, 3), [4, 1, 2, 3, 0]);
  assert.deepEqual(marketSlotsAt(save), [1, 2, 3, 0, 4]);
  assert.deepEqual(
    marketSlotsAt(JSON.parse(JSON.stringify(save))),
    marketSlotsAt(save),
  );
  const opponentTurn = lastOpponentTurn(save)!;
  // Event 4 may already be saved while the table still displays event 3.
  assert.deepEqual(opponentTurn.market.beforeSlots, marketSlotsAt(save, 3));
  assert.deepEqual(opponentTurn.market.afterSlots, marketSlotsAt(save));
  save.events.push({ type: "sell", good: "diamond", count: 100 });
  assert.deepEqual(marketSlotsAt(save, 3), [4, 1, 2, 3, 0]);
});

test("round transition clears the transaction exactly when its next event is displayed", () => {
  const save: Save = { version: 1, seed: 7, difficulty: "easy", events: [] };
  let state = newGame(save.seed);
  while (state.phase === "playing" && save.events.length < 200) {
    const actions = legalActions(state);
    const action = actions.find((a) => a.type === "sell") ?? actions[0];
    save.events.push(action);
    state = advance(state, action);
  }
  assert.equal(state.phase, "roundEnd");
  const previous = lastOpponentTurn(save);
  const previousSlots = marketSlotsAt(save);
  assert.ok(previous);
  save.events.push({ type: "next" });
  assert.deepEqual(lastOpponentTurn(save, save.events.length - 1), previous);
  assert.deepEqual(marketSlotsAt(save, save.events.length - 1), previousSlots);
  assert.equal(lastOpponentTurn(save), null);
  assert.deepEqual(marketSlotsAt(save), [0, 1, 2, 3, 4]);

  state = advance(state, { type: "next" });
  while (state.current === 0) {
    const action = legalActions(state)[0];
    save.events.push(action);
    state = advance(state, action);
    assert.equal(lastOpponentTurn(save), null);
  }
  const action = legalActions(state)[0];
  save.events.push(action);
  state = advance(state, action);
  assert.equal(lastOpponentTurn(save)?.round, 2);
});

test("opponent projections reject a player action", () => {
  const before = newGame(2);
  const action = legalActions(before)[0];
  assert.equal(before.current, 0);
  assert.throws(() =>
    presentOpponentTurn(before, action, applyAction(before, action)),
  );
});

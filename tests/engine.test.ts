import test from "node:test";
import assert from "node:assert/strict";
import {
  actionError,
  applyAction,
  legalActions,
  newGame,
  nextRound,
} from "../src/game/engine.ts";
import { COUNTS, makeDeck, sum } from "../src/game/data.ts";
import { GOODS } from "../src/game/types.ts";
import type { Card, Event, State } from "../src/game/types.ts";
import { chooseAction, observe } from "../src/game/ai.ts";
import {
  chooseOriginalWasmAction,
  chooseWasmAction,
  encodeObservation,
} from "../src/game/ai-wasm.ts";
import { advance, parseSave, replay } from "../src/game/storage.ts";
function fixture() {
  const s = newGame(123);
  s.current = 0;
  return s;
}
function invariant(s: State) {
  const cards: Card[] = [
    ...s.deck,
    ...s.market,
    ...s.discard,
    ...s.players.flatMap((p) => [
      ...p.hand,
      ...Array<Card>(p.camels).fill("camel"),
    ]),
  ];
  assert.equal(cards.length, 55);
  for (const c of Object.keys(COUNTS) as Card[])
    assert.equal(cards.filter((x) => x === c).length, COUNTS[c]);
  assert.equal(
    s.players.flatMap((p) => p.goods).length +
      GOODS.reduce((n, g) => n + s.tokens[g].length, 0),
    38,
  );
  assert.equal(
    s.players.flatMap((p) => p.bonuses).length +
      Object.values(s.bonus).reduce((n, a) => n + a.length, 0),
    18,
  );
  for (const p of s.players) {
    assert.ok(p.hand.length <= 7);
    assert.ok(p.camels >= 0);
  }
}
test("55-card setup, three guaranteed camels, deterministic immutable transitions", () => {
  assert.equal(makeDeck().length, 55);
  const s = newGame(8);
  invariant(s);
  assert.equal(s.deck.length, 40);
  assert.equal(s.market.length, 5);
  assert.ok(s.market.filter((c) => c === "camel").length >= 3);
  assert.deepEqual(s, newGame(8));
  const previous = JSON.stringify(s);
  applyAction(s, legalActions(s)[0]);
  assert.equal(JSON.stringify(s), previous);
});
test("taking a good refills market and changes turn", () => {
  const s = fixture();
  s.market = ["gold", "camel", "camel", "cloth", "silver"];
  const n = applyAction(s, { type: "take", index: 0 });
  assert.equal(n.deck.length, s.deck.length - 1);
  assert.equal(n.market.length, 5);
  assert.equal(n.players[0].hand.length, s.players[0].hand.length + 1);
  assert.equal(n.current, 1);
});
test("taking camels takes all, even at full hand capacity", () => {
  const s = fixture();
  s.players[0].hand = Array(7).fill("spice");
  s.market = ["camel", "gold", "camel", "camel", "silver"];
  assert.ok(actionError(s, { type: "take", index: 1 }));
  const n = applyAction(s, { type: "camels" });
  assert.equal(n.players[0].camels, s.players[0].camels + 3);
  assert.equal(n.players[0].hand.length, 7);
  assert.equal(n.deck.length, s.deck.length - 3);
});
test("exchange rejects same-type returns, one-for-one, bad indices, counts and hand overflow", () => {
  const s = fixture();
  s.market = ["gold", "gold", "spice", "camel", "cloth"];
  s.players[0].hand = [
    "gold",
    "silver",
    "silver",
    "leather",
    "leather",
    "cloth",
  ];
  s.players[0].camels = 4;
  for (const a of [
    { type: "exchange", market: [0], hand: [], camels: 1 },
    { type: "exchange", market: [0, 1], hand: [0, 1], camels: 0 },
    { type: "exchange", market: [0, 0], hand: [1, 2], camels: 0 },
    { type: "exchange", market: [0, 1], hand: [], camels: 2 },
    { type: "exchange", market: [0, 3], hand: [1, 2], camels: 0 },
    { type: "exchange", market: [0, 1], hand: [1], camels: 0 },
  ] as const)
    assert.throws(() => applyAction(s, structuredClone(a) as never));
  const n = applyAction(s, {
    type: "exchange",
    market: [0, 1],
    hand: [1],
    camels: 1,
  });
  assert.equal(n.players[0].hand.length, 7);
  assert.equal(n.players[0].camels, 3);
  assert.equal(n.deck.length, s.deck.length);
  assert.equal(n.market.length, 5);
});
test("precious goods require two even with one token remaining", () => {
  for (const good of ["gold", "silver", "diamond"] as const) {
    const s = fixture();
    s.players[0].hand = [good, good];
    s.tokens[good] = [5];
    assert.throws(() => applyAction(s, { type: "sell", good, count: 1 }));
    const n = applyAction(s, { type: "sell", good, count: 2 });
    assert.deepEqual(n.players[0].goods, [5]);
    assert.equal(n.players[0].hand.length, 0);
  }
});
test("sales use actual card count for bonuses and support selling into depleted tokens", () => {
  const s = fixture();
  s.players[0].hand = Array(6).fill("leather");
  s.tokens.leather = [1];
  const bonus = s.bonus[5].at(-1);
  const n = applyAction(s, { type: "sell", good: "leather", count: 6 });
  assert.deepEqual(n.players[0].goods, [1]);
  assert.deepEqual(n.players[0].bonuses, [bonus]);
  assert.equal(n.discard.length, 6);
  s.tokens.leather = [];
  assert.equal(
    applyAction(s, { type: "sell", good: "leather", count: 6 }).players[0]
      .bonuses.length,
    1,
  );
  s.bonus[5] = [];
  assert.equal(
    applyAction(s, { type: "sell", good: "leather", count: 6 }).players[0]
      .bonuses.length,
    0,
  );
});
test("empty deck ends only when market cannot be refilled", () => {
  const s = fixture();
  s.deck = ["gold"];
  s.market = ["cloth", "gold", "silver", "leather", "spice"];
  const n = applyAction(s, { type: "take", index: 0 });
  assert.equal(n.phase, "playing");
  assert.equal(n.deck.length, 0);
  assert.equal(applyAction(n, { type: "take", index: 0 }).phase, "roundEnd");
});
test("three depleted stacks end round; camel majority gives 5; loser starts", () => {
  const s = fixture();
  s.tokens.gold = [];
  s.tokens.silver = [];
  s.tokens.diamond = [7];
  s.players[0].hand = ["diamond", "diamond"];
  s.players[0].camels = 4;
  s.players[1].camels = 2;
  const n = applyAction(s, { type: "sell", good: "diamond", count: 2 });
  assert.equal(n.phase, "roundEnd");
  assert.deepEqual(n.results[0].scores, [12, 0]);
  assert.equal(n.seals[0], 1);
  const next = nextRound(n);
  assert.equal(next.current, 1);
  assert.equal(next.round, 2);
  invariant(next);
});
test("equal camels award neither; scoring tie-breakers and exact tie", () => {
  for (const tie of ["bonus", "goods", "all"]) {
    const s = fixture();
    s.deck = [];
    s.market = ["cloth"];
    s.players[0].camels = 2;
    s.players[1].camels = 2;
    if (tie === "bonus") {
      s.players[0].bonuses = [2];
      s.players[1].goods = [2];
    }
    if (tie === "goods") {
      s.players[0].goods = [1, 1];
      s.players[1].goods = [2];
    }
    const n = applyAction(s, { type: "take", index: 0 });
    assert.equal(n.results[0].camel, null);
    assert.equal(n.results[0].winner, tie === "all" ? null : 0);
    assert.equal(n.seals[0], tie === "all" ? 0 : 1);
  }
});
test("two seals end match and prevent future actions", () => {
  const s = fixture();
  s.seals = [1, 0];
  s.players[0].goods = [100];
  s.deck = [];
  s.market = ["cloth"];
  const n = applyAction(s, { type: "take", index: 0 });
  assert.equal(n.phase, "finished");
  assert.throws(() => nextRound(n));
  assert.equal(legalActions(n).length, 0);
});
test("AI observation excludes hidden hands, deck order, opponent bonus values and random seed", () => {
  const s = fixture();
  const before = observe(s);
  s.players[1].hand = s.players[1].hand.map(() => "diamond");
  s.players[1].bonuses = [100];
  s.players[1].camels = 100;
  s.seed = 432;
  s.rng = 222;
  s.deck.reverse();
  s.bonus[3].reverse();
  assert.deepEqual(observe(s), before);
  for (const d of ["easy", "normal", "hard"] as const)
    assert.deepEqual(chooseAction(before, d), chooseAction(observe(s), d));
});
test("AI remembers only opponent cards revealed by public actions", () => {
  let s = newGame(41);
  const events: Event[] = [];
  const ownAction = legalActions(s).find((action) => action.type === "take")!;
  events.push(ownAction);
  s = applyAction(s, ownAction);
  const opponentAction = legalActions(s).find(
    (action) => action.type === "take",
  )!;
  const revealed = s.market[opponentAction.index];
  assert.notEqual(revealed, "camel");
  events.push(opponentAction);
  s = applyAction(s, opponentAction);
  assert.deepEqual(observe(s, events).knownOpponentHand, [revealed]);
  assert.deepEqual(observe(s).knownOpponentHand, []);
});
test("replay-validated saves reject tampering and malformed events", () => {
  const s = newGame(3);
  const events = [legalActions(s)[0]];
  const save = {
    version: 1 as const,
    seed: 3,
    difficulty: "normal" as const,
    events,
  };
  assert.deepEqual(
    replay(parseSave(JSON.stringify(save))),
    applyAction(s, events[0]),
  );
  for (const events of [
    [{ type: "take", index: 999 }],
    [{ type: "next" }],
    [null],
    [{ type: "exchange" }],
    [{ type: "hack" }],
  ])
    assert.throws(() => parseSave(JSON.stringify({ ...save, events })));
  assert.throws(() => parseSave("bad json"));
  assert.throws(() => parseSave(JSON.stringify({ ...save, version: 2 })));
});
test("C++/Wasm search and original-hard policies return legal deterministic actions", async () => {
  const s = newGame(9);
  const observation = observe(s);
  const encoded = encodeObservation(observation);
  assert.equal(encoded[0], 0x4a4149);
  assert.equal(encoded[1], 1);
  const first = await chooseWasmAction(observation);
  const second = await chooseWasmAction(observation);
  assert.equal(actionError(s, first), null);
  assert.deepEqual(second, first);
  const original = await chooseOriginalWasmAction(observation);
  assert.equal(actionError(s, original), null);
  assert.deepEqual(await chooseOriginalWasmAction(observation), original);
});
test("complete AI matches across all difficulties conserve cards and tokens and replay identically", async () => {
  for (const difficulty of ["easy", "normal", "hard"] as const)
    for (let seed = 1; seed <= 12; seed++) {
      let s = newGame(seed);
      const events = [];
      let turns = 0;
      while (s.phase !== "finished" && turns++ < 700) {
        invariant(s);
        const e =
          s.phase === "roundEnd"
            ? { type: "next" as const }
            : difficulty === "hard"
              ? await chooseWasmAction(observe(s, events), 2_000)
              : chooseAction(observe(s, events), difficulty);
        if (s.phase === "playing")
          assert.equal(
            actionError(s, e),
            null,
            `${difficulty} seed ${seed} turn ${turns}`,
          );
        events.push(e);
        s = advance(s, e);
      }
      assert.equal(
        s.phase,
        "finished",
        `${difficulty} seed ${seed} failed to end`,
      );
      invariant(s);
      assert.ok(s.seals.some((n) => n === 2));
      assert.ok(sum(s.seals) <= 3);
      assert.deepEqual(replay({ version: 1, seed, difficulty, events }), s);
    }
});

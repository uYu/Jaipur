import test from "node:test";
import assert from "node:assert/strict";
import { observe } from "../src/game/ai.ts";
import { makeDeck, random } from "../src/game/data.ts";
import { dmcActions } from "../src/game/dmc.ts";
import {
  chooseDouzeroAction,
  chooseDouzeroActionFromModel,
} from "../src/game/douzero-browser.ts";
import { findEndgameWinningAction } from "../src/game/endgame.ts";
import {
  actionError,
  applyAction,
  legalActions,
  newGame,
} from "../src/game/engine.ts";
import { findImmediateWinningAction } from "../src/game/immediate-win.ts";
import type { Action, Card, State } from "../src/game/types.ts";

const thorough = { maxNodes: 100_000, maxMs: 5_000 };

function allocateCards(s: State, deck: Card[]) {
  const remaining = makeDeck();
  for (const card of [
    ...s.market,
    ...deck,
    ...s.players.flatMap((p) => [
      ...p.hand,
      ...Array<Card>(p.camels).fill("camel"),
    ]),
  ]) {
    const at = remaining.indexOf(card);
    assert.ok(at >= 0);
    remaining.splice(at, 1);
  }
  assert.ok(!remaining.includes("camel"));
  s.deck = [...deck];
  s.discard = remaining as State["discard"];
}

function fixture() {
  const s = newGame(47, 1);
  s.current = 0;
  s.players = [
    {
      hand: ["diamond", "diamond", "cloth"],
      camels: 6,
      goods: [],
      bonuses: [],
    },
    { hand: [], camels: 5, goods: [7, 7], bonuses: [] },
  ];
  s.market = ["cloth", "gold", "silver", "leather", "spice"];
  s.tokens.gold = [];
  s.tokens.silver = [];
  s.tokens.diamond = [7];
  allocateCards(s, ["spice"]);
  return s;
}

// Independent engine enumeration verifies the promised result for every reply,
// including exchanges and opponents who deliberately end the round immediately.
function verifyAgainstReplies(s: State, action: Action) {
  const actor = s.current;
  assert.equal(actionError(s, action), null);
  const next = applyAction(s, action);
  if (next.phase !== "playing") {
    assert.equal(next.results.at(-1)!.winner, actor);
    return;
  }
  for (const reply of legalActions(next)) {
    const after = applyAction(next, reply);
    if (after.phase !== "playing") {
      assert.equal(after.results.at(-1)!.winner, actor);
    } else {
      const last = findImmediateWinningAction(observe(after));
      assert.ok(last, JSON.stringify({ action, reply }));
      const end = applyAction(after, last);
      assert.notEqual(end.phase, "playing");
      assert.equal(end.results.at(-1)!.winner, actor);
    }
  }
}

test("cash out cloth before the final diamond sale, surviving every reply", () => {
  const s = fixture();
  const before = structuredClone(s);
  assert.equal(findImmediateWinningAction(observe(s)), undefined);
  const action = findEndgameWinningAction(observe(s));
  assert.deepEqual(action, { type: "sell", good: "cloth", count: 1 });
  assert.equal(applyAction(s, action!).phase, "playing");
  verifyAgainstReplies(s, action!);
  assert.deepEqual(s, before);
});

test("a two-move proof bypasses model fetch and scoring", async () => {
  const o = observe(fixture());
  const expected = { type: "sell", good: "cloth", count: 1 };
  const previous = globalThis.fetch;
  globalThis.fetch = async () => {
    throw Error("model should not load");
  };
  try {
    assert.deepEqual(await chooseDouzeroAction(o, []), expected);
    assert.deepEqual(
      chooseDouzeroActionFromModel(
        {
          score() {
            throw Error("model should not run");
          },
        } as any,
        o,
        [],
      ),
      expected,
    );
  } finally {
    globalThis.fetch = previous;
  }
});

test("the opponent can spoil a plan by cashing out before our last move", () => {
  const s = fixture();
  s.players[1].hand = ["diamond", "diamond"];
  allocateCards(s, ["spice"]);
  const o = observe(s);
  assert.equal(findEndgameWinningAction(o, thorough), undefined);
  const next = applyAction(s, { type: "sell", good: "cloth", count: 1 });
  const end = applyAction(next, { type: "sell", good: "diamond", count: 2 });
  assert.equal(end.results.at(-1)!.winner, 1);

  // Swapping a hidden hand card with the deck leaves the public view unchanged.
  s.players[1].hand = ["diamond", "spice"];
  allocateCards(s, ["diamond"]);
  assert.deepEqual(observe(s), o);
  assert.equal(findEndgameWinningAction(observe(s), thorough), undefined);
});

test("taking the last deck card can force a win on the following own turn", () => {
  const s = fixture();
  s.players[0].hand = ["diamond"];
  s.players[1].goods = [];
  allocateCards(s, ["spice"]);
  assert.equal(findImmediateWinningAction(observe(s)), undefined);
  const action = findEndgameWinningAction(observe(s));
  assert.equal(action?.type, "take");
  verifyAgainstReplies(s, action!);
});

test("an exchange can prepare the last sale while preserving the refill card", () => {
  const s = fixture();
  s.players[0].hand = ["diamond", "leather", "leather"];
  s.players[1].goods = [10];
  s.tokens.leather = [1, 1, 1];
  s.market[0] = "diamond";
  allocateCards(s, ["spice"]);
  assert.equal(findImmediateWinningAction(observe(s)), undefined);
  const action = findEndgameWinningAction(observe(s), thorough);
  assert.equal(action?.type, "exchange");
  verifyAgainstReplies(s, action!);
});

test("a proof covers every possible hidden hand and both player seats", () => {
  const s = fixture();
  s.players[1].hand = ["leather"];
  s.tokens.leather = [1, 1];
  s.tokens.spice = [1, 1];
  allocateCards(s, ["spice"]);
  const o = observe(s);
  const action = findEndgameWinningAction(o, thorough);
  assert.deepEqual(action, { type: "sell", good: "cloth", count: 1 });
  verifyAgainstReplies(s, action!);
  s.players[1].hand = ["spice"];
  allocateCards(s, ["leather"]);
  assert.deepEqual(observe(s), o);
  verifyAgainstReplies(s, action!);

  s.players.reverse();
  s.current = 1;
  assert.deepEqual(observe(s), o);
  assert.deepEqual(findEndgameWinningAction(observe(s), thorough), action);
  verifyAgainstReplies(s, action!);
});

test("all refill outcomes matter, including a camel that lets the opponent overtake", () => {
  const s = fixture();
  s.players[0].hand = ["diamond"];
  s.players[0].goods = [1];
  s.players[0].camels = 5;
  s.players[1].goods = [4];
  s.market[0] = "diamond";
  allocateCards(s, ["camel", "spice"]);
  const o = observe(s);
  // This actual draw order looks winning after taking the second diamond.
  verifyAgainstReplies(s, { type: "take", index: 0 });
  // But a camel drawn first lets the opponent take the majority and block it.
  s.deck.reverse();
  const next = applyAction(s, { type: "take", index: 0 });
  const after = applyAction(next, { type: "camels" });
  assert.equal(findImmediateWinningAction(observe(after)), undefined);
  assert.deepEqual(observe(s), o);
  assert.equal(findEndgameWinningAction(o, thorough), undefined);
});

test("a favorable first sale bonus is not sufficient to prove the plan", () => {
  const s = fixture();
  s.players[0].hand.push("cloth", "cloth");
  s.players[1].goods = [25];
  s.tokens.cloth = [5, 3, 3, 2];
  allocateCards(s, ["spice"]);
  const o = observe(s);
  s.bonus[3] = [1, 1, 2, 2, 2, 3, 3];
  verifyAgainstReplies(s, { type: "sell", good: "cloth", count: 3 });
  assert.equal(findEndgameWinningAction(o, thorough), undefined);
  s.bonus[3].reverse();
  const next = applyAction(s, { type: "sell", good: "cloth", count: 3 });
  const reply = legalActions(next).find((a) => a.type === "take")!;
  assert.equal(
    findImmediateWinningAction(observe(applyAction(next, reply))),
    undefined,
  );
  assert.deepEqual(observe(s), o);
});

test("an unfinished proof yields no action and immediate wins keep priority", () => {
  const s = fixture();
  const o = observe(s);
  assert.equal(findEndgameWinningAction(o, { maxNodes: 0 }), undefined);
  assert.equal(findEndgameWinningAction(o, { maxMs: 0 }), undefined);
  s.players[1].goods = [];
  assert.deepEqual(
    findEndgameWinningAction(observe(s), { maxNodes: 0 }),
    findImmediateWinningAction(observe(s)),
  );
});

test("ordinary positions still use model scores", () => {
  const o = observe(newGame(47), [], 0.75);
  const actions = dmcActions(o);
  let calls = 0;
  const action = chooseDouzeroActionFromModel(
    {
      score() {
        calls++;
        return actions.map((_, i) => i);
      },
    } as any,
    o,
    [],
  );
  assert.equal(calls, 1);
  assert.deepEqual(action, actions.at(-1));
});

test("proofs from deterministic public playouts survive independent legal replies", () => {
  let rng = 163;
  let checked = 0;
  for (let seed = 1; seed <= 6; seed++) {
    let s = newGame(seed, 1);
    for (let turn = 0; turn < 150 && s.phase === "playing"; turn++) {
      const o = observe(s);
      const action = findEndgameWinningAction(o);
      if (action) {
        verifyAgainstReplies(s, action);
        checked++;
      }
      const actions = dmcActions(o);
      const [u, next] = random(rng);
      rng = next;
      s = applyAction(s, actions[Math.floor(u * actions.length)]);
    }
  }
  assert.ok(checked > 0);
});

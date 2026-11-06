import test from "node:test";
import assert from "node:assert/strict";
import { applyAction, newGame } from "../src/game/engine.ts";
import {
  playerCardsDisplay,
  playerScoreDisplay,
} from "../src/game/score-display.ts";

test("playing opponents expose token counts but no accumulated score or bonus values", () => {
  const state = newGame(7);
  state.players[1].goods = [7, 6, 5];
  state.players[1].bonuses = [9, 3];
  assert.deepEqual(playerScoreDisplay(state, 1), {
    goodsTokenCount: 3,
    bonusTokenCount: 2,
    total: null,
    goods: null,
    bonus: null,
    hidden: true,
  });

  state.players[1].hand = ["diamond", "gold"];
  state.players[1].goods = [1, 1, 1];
  state.players[1].bonuses = [1, 1];
  state.players[1].camels = 100;
  assert.deepEqual(playerScoreDisplay(state, 1), {
    goodsTokenCount: 3,
    bonusTokenCount: 2,
    total: null,
    goods: null,
    bonus: null,
    hidden: true,
  });
});

test("own playing score includes goods and bonuses but not the unawarded camel token", () => {
  const state = newGame(7);
  state.players[0].goods = [7, 5];
  state.players[0].bonuses = [3, 8];
  state.players[0].camels = 4;
  state.players[1].camels = 1;
  assert.deepEqual(playerScoreDisplay(state, 0), {
    goodsTokenCount: 2,
    bonusTokenCount: 2,
    total: 23,
    goods: 12,
    bonus: 11,
    hidden: false,
  });
});

test("round and match settlement reveal both scores including the camel award and correct margin", () => {
  for (const targetSeals of [1, 2] as const) {
    const state = newGame(7, targetSeals);
    state.current = 0;
    state.players[0] = {
      hand: ["leather"],
      goods: [7],
      bonuses: [3],
      camels: 2,
    };
    state.players[1] = {
      hand: [],
      goods: [5, 5],
      bonuses: [1],
      camels: 3,
    };
    state.tokens.gold = [];
    state.tokens.silver = [];
    state.tokens.cloth = [];
    const after = applyAction(state, {
      type: "sell",
      good: "leather",
      count: 1,
    });
    assert.equal(after.phase, targetSeals === 1 ? "finished" : "roundEnd");
    const own = playerScoreDisplay(after, 0);
    const opponent = playerScoreDisplay(after, 1);
    assert.equal(own.hidden, false);
    assert.equal(opponent.hidden, false);
    assert.deepEqual([own.total, opponent.total], after.results.at(-1)!.scores);
    assert.equal(own.total, 14);
    assert.equal(opponent.total, 16);
    assert.equal(opponent.total! - own.total!, 2);
    assert.equal(opponent.goods, 10);
    assert.equal(opponent.bonus, 1);
    assert.equal(opponent.total! - opponent.goods! - opponent.bonus!, 5);

    // An authoritative round result remains the source of the settled score.
    after.players[1].camels = 0;
    assert.equal(playerScoreDisplay(after, 1).total, 16);
  }
});

test("only the current round result is used, and fallback settlement awards no camel token on a tie", () => {
  const state = newGame(7);
  state.round = 2;
  state.phase = "roundEnd";
  state.players[0].goods = [7];
  state.players[0].bonuses = [2];
  state.players[0].camels = 3;
  state.players[1].goods = [5];
  state.players[1].bonuses = [1];
  state.players[1].camels = 3;
  state.results = [
    {
      round: 1,
      scores: [30, 20],
      goods: [25, 18],
      bonuses: [5, 2],
      camel: null,
      winner: 0,
      reason: "上一轮",
    },
  ];
  assert.equal(playerScoreDisplay(state, 0).total, 9);
  assert.equal(playerScoreDisplay(state, 1).total, 6);
  state.players[1].camels = 4;
  assert.equal(playerScoreDisplay(state, 1).total, 11);
});

test("live details show own cards while opponent faces and herd stay private", () => {
  const state = newGame(7);
  state.players[0].hand = ["cloth", "gold"];
  state.players[0].camels = 2;
  state.players[1].hand = ["diamond", "spice", "spice"];
  state.players[1].camels = 4;
  assert.deepEqual(playerCardsDisplay(state, 0), {
    handCount: 2,
    hand: ["cloth", "gold"],
    camels: 2,
  });
  assert.deepEqual(playerCardsDisplay(state, 1), {
    handCount: 3,
    hand: null,
    camels: null,
  });
  const revealed = playerCardsDisplay(state, 1, true);
  assert.deepEqual(revealed, {
    handCount: 3,
    hand: ["diamond", "spice", "spice"],
    camels: 4,
  });
  revealed.hand!.pop();
  assert.deepEqual(state.players[1].hand, ["diamond", "spice", "spice"]);
  assert.deepEqual(playerCardsDisplay(state, 1), {
    handCount: 3,
    hand: null,
    camels: null,
  });
});

test("an empty revealed hand is distinct from a private hand, including at settlement", () => {
  const state = newGame(7);
  state.players[1].hand = [];
  state.players[1].camels = 0;
  assert.deepEqual(playerCardsDisplay(state, 1), {
    handCount: 0,
    hand: null,
    camels: null,
  });
  assert.deepEqual(playerCardsDisplay(state, 1, true), {
    handCount: 0,
    hand: [],
    camels: 0,
  });
  state.phase = "roundEnd";
  assert.deepEqual(playerCardsDisplay(state, 1), {
    handCount: 0,
    hand: null,
    camels: 0,
  });
});

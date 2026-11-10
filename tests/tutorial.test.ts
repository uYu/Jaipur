import test from "node:test";
import assert from "node:assert/strict";
import { applyAction, legalActions, newGame } from "../src/game/engine.ts";
import { replay } from "../src/game/storage.ts";
import { roundEndCause } from "../src/game/round-end-cause.ts";
import { chooseAction, observe } from "../src/game/ai.ts";
import {
  emptySelection,
  selectCamels,
  selectHand,
  selectMarket,
  selectedAction,
} from "../src/game/selection.ts";
import {
  createTutorialSave,
  TUTORIAL_EXCHANGE_PAYMENTS,
  TUTORIAL_LESSONS,
  tutorialAccepts,
  tutorialTapTarget,
} from "../src/game/tutorial.ts";

test("each practice starts with a legal move of the requested type", () => {
  for (const [index, lesson] of TUTORIAL_LESSONS.entries()) {
    const save = createTutorialSave(index);
    const state = replay(save);
    if (!save.events.length) assert.deepEqual(state, newGame(lesson.seed, 1));
    assert.equal(state.current, 0);
    assert.equal(state.phase, "playing");
    const moves = legalActions(state).filter((action) =>
      tutorialAccepts(lesson, action),
    );
    assert.ok(moves.length > 0, lesson.title);
    assert.equal(applyAction(state, moves[0]).turn, state.turn + 1);
  }
});

test("the suggested take and exchange set up real sale opportunities", () => {
  const take = replay(createTutorialSave(0));
  const spice = { type: "take", index: take.market.indexOf("spice") } as const;
  const afterTake = applyAction(take, spice);
  assert.equal(
    afterTake.players[0].hand.filter((g) => g === "spice").length,
    3,
  );

  const exchange = replay(createTutorialSave(3));
  const lesson = TUTORIAL_LESSONS[3];
  for (const { camels } of TUTORIAL_EXCHANGE_PAYMENTS) {
    let selection = emptySelection();
    const payment =
      camels === 0
        ? ["hand", "hand"]
        : camels === 2
          ? ["camel", "camel"]
          : ["hand", "camel"];
    for (const area of ["market", "market", ...payment]) {
      const tap = tutorialTapTarget(lesson, exchange, selection, camels);
      assert.ok(tap && tap.area !== "confirm" && tap.area !== "clear");
      assert.equal(tap.area, area);
      selection =
        tap.area === "camel"
          ? selectCamels(exchange, selection, selection.camels + 1)
          : tap.area === "market"
            ? selectMarket(exchange, selection, tap.index)
            : selectHand(exchange, selection, tap.index);
    }
    assert.deepEqual(tutorialTapTarget(lesson, exchange, selection, camels), {
      area: "confirm",
    });
    const { action: swap, error } = selectedAction(exchange, selection);
    assert.ok(swap?.type === "exchange" && !error);
    assert.equal(swap.camels, camels);
    for (const other of TUTORIAL_EXCHANGE_PAYMENTS) {
      assert.equal(
        tutorialAccepts(lesson, swap, other.camels),
        camels === other.camels,
      );
      if (camels !== other.camels) {
        assert.deepEqual(
          tutorialTapTarget(lesson, exchange, selection, other.camels),
          {
            area: "clear",
          },
        );
      }
    }
    const afterExchange = applyAction(exchange, swap);
    assert.equal(
      afterExchange.players[0].hand.filter((g) => g === "diamond").length,
      3,
    );
    assert.deepEqual(afterExchange.tokens.diamond.slice(0, 3), [7, 7, 5]);
    assert.equal(afterExchange.current, 1);
    const afterReply = applyAction(
      afterExchange,
      chooseAction(observe(afterExchange), "easy"),
    );
    assert.equal(afterReply.current, 0);
  }
  assert.deepEqual(exchange.tokens.leather.slice(0, 2), [1, 1]);
});

test("the closing exercise depletes the third stack and settles the match", () => {
  const lesson = TUTORIAL_LESSONS.at(-1)!;
  const state = replay(createTutorialSave(TUTORIAL_LESSONS.length - 1));
  assert.deepEqual(state.tokens.gold, []);
  assert.deepEqual(state.tokens.silver, []);
  assert.equal(state.tokens.diamond.length, 1);
  const finishingMoves = legalActions(state).filter((action) =>
    tutorialAccepts(lesson, action),
  );
  assert.equal(finishingMoves.length, 1);
  const after = applyAction(state, finishingMoves[0]);
  assert.equal(after.phase, "finished");
  assert.deepEqual(roundEndCause(after), {
    kind: "tokens",
    title: "三类货物筹码已售罄",
    depleted: ["diamond", "gold", "silver"],
  });
  assert.deepEqual(after.results[0].scores, [65, 53]);
});

test("the practice cue points to confirmation once the guided trade is ready", () => {
  for (const index of [0, 1, 2, 4]) {
    const lesson = TUTORIAL_LESSONS[index];
    const state = replay(createTutorialSave(index));
    let selection = emptySelection();
    const taps = lesson.action === "sell" ? (lesson.closingGood ? 2 : 3) : 1;
    for (let i = 0; i < taps; i++) {
      const target = tutorialTapTarget(lesson, state, selection);
      assert.ok(target && (target.area === "market" || target.area === "hand"));
      selection =
        target.area === "market"
          ? selectMarket(state, selection, target.index)
          : selectHand(state, selection, target.index);
    }
    assert.deepEqual(tutorialTapTarget(lesson, state, selection), {
      area: "confirm",
    });
  }
});

test("practice offers two goods to take, a bulk sale and three exchange payment options", () => {
  const [take, sell, , exchange] = TUTORIAL_LESSONS.map((_, index) =>
    legalActions(replay(createTutorialSave(index))),
  );
  assert.equal(take.filter((action) => action.type === "take").length, 2);
  assert.ok(sell.some((action) => action.type === "sell" && action.count >= 3));
  const payments = exchange.flatMap((action) =>
    action.type === "exchange" ? [action.camels] : [],
  );
  assert.deepEqual(new Set(payments), new Set([0, 1, 2]));
});

import test from "node:test";
import assert from "node:assert/strict";
import { applyAction, actionError, newGame } from "../src/game/engine.ts";
import {
  emptySelection,
  selectMarket,
  selectHand,
  selectCamels,
  selectedAction,
} from "../src/game/selection.ts";
import type { ActionMode } from "../src/game/selection.ts";
import { replay } from "../src/game/storage.ts";
import {
  createTutorialSave,
  createTutorialState,
  TUTORIAL_ACTIONS,
  TUTORIAL_SEED,
  TUTORIAL_STEPS,
  tutorialAccepts,
  tutorialSelectionReady,
  tutorialStepAfterSelection,
  tutorialStepAfterNext,
  normalizeTutorialSelection,
} from "../src/game/tutorial.ts";

const step = (id: string) => TUTORIAL_STEPS.findIndex((s) => s.id === id);

function assertConservation(state: ReturnType<typeof newGame>) {
  const cards =
    state.deck.length +
    state.market.length +
    state.discard.length +
    state.players.reduce((n, p) => n + p.hand.length + p.camels, 0);
  assert.equal(cards, 55);
  assert.ok(state.players.every((p) => p.hand.length <= 7));
  assert.equal(
    Object.values(state.tokens).flat().length +
      state.players.reduce((n, p) => n + p.goods.length, 0),
    38,
  );
}

test("fixed tutorial deal and alternating script cover all four legal actions with normal conservation and replay", () => {
  let state = createTutorialState();
  const save = createTutorialSave();
  assert.deepEqual(state, newGame(TUTORIAL_SEED, 1));
  assert.equal(state.current, 0);
  for (const [index, action] of TUTORIAL_ACTIONS.entries()) {
    assert.equal(state.current, index % 2);
    if (index % 2 === 0)
      assert.ok(
        tutorialAccepts(index / 2, action, state.market, state.players[0].hand),
      );
    assert.equal(actionError(state, action), null);
    state = applyAction(state, action);
    save.events.push(action);
    assertConservation(state);
    assert.deepEqual(replay(save), state);
  }
  assert.deepEqual(state.players[0].hand, [
    "diamond",
    "silver",
    "leather",
    "cloth",
    "cloth",
  ]);
  assert.deepEqual(state.players[0].goods, [5, 3, 3]);
  assert.deepEqual(state.players[0].bonuses, [2]);
  assert.deepEqual(state.players[1].goods, [6, 6, 5, 2]);
  assert.equal(state.players[0].camels, 1);
  assert.equal(state.players[1].camels, 3);
  assert.equal(state.current, 0);
  assert.equal(state.phase, "playing");
});

test("real card selection, cancellation and camel +/- controls advance the guided exercises", () => {
  let state = createTutorialState();
  let selection = selectMarket(
    state,
    emptySelection(),
    state.market.indexOf("spice"),
  );
  assert.ok(tutorialSelectionReady(step("take-select"), selection, state));
  selection = selectMarket(state, selection, selection.market[0]);
  assert.ok(tutorialSelectionReady(step("take-cancel"), selection, state));
  selection = selectMarket(state, selection, state.market.indexOf("spice"));
  assert.ok(tutorialSelectionReady(step("take-reselect"), selection, state));
  for (const action of TUTORIAL_ACTIONS.slice(0, 2))
    state = applyAction(state, action);
  selection = emptySelection();
  state.players[0].hand.forEach((good, i) => {
    if (good === "spice") selection = selectHand(state, selection, i);
  });
  assert.ok(tutorialSelectionReady(step("sell-select"), selection, state));
  assert.deepEqual(
    selectedAction(state, selection).action,
    TUTORIAL_ACTIONS[2],
  );
  for (const action of TUTORIAL_ACTIONS.slice(2, 4))
    state = applyAction(state, action);
  selection = selectMarket(
    state,
    emptySelection(),
    state.market.indexOf("camel"),
  );
  assert.ok(tutorialSelectionReady(step("camel-select"), selection, state));
  for (const action of TUTORIAL_ACTIONS.slice(4, 6))
    state = applyAction(state, action);
  selection = emptySelection();
  state.market.forEach((good, i) => {
    if (good === "cloth") selection = selectMarket(state, selection, i);
  });
  assert.ok(
    tutorialSelectionReady(step("camel-exchange-select"), selection, state),
  );
  assert.ok(selectedAction(state, selection).error);
  selection = selectCamels(state, selection, 1);
  assert.equal(
    tutorialSelectionReady(step("camel-exchange-pay"), selection, state),
    false,
  );
  selection = selectCamels(state, selection, 2);
  assert.ok(
    tutorialSelectionReady(step("camel-exchange-pay"), selection, state),
  );
  assert.equal(selectedAction(state, selection).error, "");
  assert.ok(
    tutorialAccepts(3, selectedAction(state, selection).action!, state.market),
  );
  selection = selectCamels(state, selection, 1);
  assert.ok(selectedAction(state, selection).error);
});

test("every player confirmation is followed by one scripted opponent move and a paused explanation", () => {
  const confirmations = TUTORIAL_STEPS.flatMap((step, i) =>
    step.kind === "confirm" ? [i] : [],
  );
  assert.equal(confirmations.length, 6);
  for (const index of confirmations) {
    assert.equal(TUTORIAL_STEPS[index + 1].kind, "opponent");
    assert.equal(TUTORIAL_STEPS[index + 2].kind, "opponent-result");
  }
  assert.equal(TUTORIAL_STEPS.at(-1)!.kind, "finish");
});

test("each lesson requires its action choice and waits for Next before selecting cards", () => {
  const state = createTutorialState();
  const expected: [string, ActionMode][] = [
    ["take", "take"],
    ["sell", "sell"],
    ["camel", "take"],
    ["camel-exchange", "exchange"],
    ["goods-exchange", "exchange"],
    ["mixed-exchange", "exchange"],
  ];
  assert.equal(
    TUTORIAL_STEPS.filter((guide) => guide.kind === "mode").length,
    6,
  );
  for (const [lesson, mode] of expected) {
    const index = step(`${lesson}-mode`);
    const guide = TUTORIAL_STEPS[index];
    assert.equal(guide.kind, "mode");
    assert.equal(guide.mode, mode);
    assert.equal(guide.target, `.action-mode-${mode}`);
    assert.equal(index + 1, step(`${lesson}-select`));
    for (const choice of [
      undefined,
      null,
      "take",
      "sell",
      "exchange",
    ] as const) {
      assert.equal(
        tutorialStepAfterNext(index, emptySelection(), state, choice),
        choice === mode ? index + 1 : index,
      );
    }
    assert.equal(
      tutorialStepAfterSelection(
        index,
        { market: [0, 1], hand: [0], camels: 1 },
        state,
      ),
      index,
    );
  }
});

test("bulk sale lesson pauses on the real bonus and beats selling the same cards singly", () => {
  let before = createTutorialState();
  for (const action of TUTORIAL_ACTIONS.slice(0, 2))
    before = applyAction(before, action);
  let bulk = before;
  for (const action of TUTORIAL_ACTIONS.slice(2, 4))
    bulk = applyAction(bulk, action);
  let singles = before;
  for (let i = 0; i < 3; i++) {
    singles = applyAction(singles, { type: "sell", good: "spice", count: 1 });
    if (i < 2)
      singles = applyAction(singles, {
        type: "take",
        index: singles.market.findIndex((good) => good !== "camel"),
      });
  }
  assert.deepEqual(singles.players[0].goods, bulk.players[0].goods);
  assert.deepEqual(singles.players[0].bonuses, []);
  assert.deepEqual(bulk.players[0].bonuses, [2]);
  assert.equal(
    bulk.players[0].goods.reduce((a, b) => a + b, 0),
    11,
  );
  assert.equal(step("bulk-bonus"), step("history-2") + 1);
  assert.equal(
    tutorialStepAfterSelection(step("bulk-bonus"), emptySelection(), bulk),
    step("bulk-bonus"),
  );
  assert.equal(
    tutorialStepAfterNext(step("bulk-bonus"), emptySelection(), bulk),
    step("camel-mode"),
  );
});

test("completed selections wait for Next and incomplete selections cannot advance", () => {
  let state = createTutorialState();
  const take = selectMarket(
    state,
    emptySelection(),
    state.market.indexOf("spice"),
  );
  assert.equal(
    tutorialStepAfterSelection(step("take-select"), take, state),
    step("take-select"),
  );
  assert.equal(
    tutorialStepAfterNext(step("take-select"), take, state),
    step("take-cancel"),
  );
  assert.equal(
    tutorialStepAfterNext(step("take-cancel"), take, state),
    step("take-cancel"),
  );
  assert.equal(
    tutorialStepAfterNext(step("take-cancel"), emptySelection(), state),
    step("take-reselect"),
  );

  for (const action of TUTORIAL_ACTIONS.slice(0, 2))
    state = applyAction(state, action);
  let selection = emptySelection();
  const spices = state.players[0].hand.flatMap((good, i) =>
    good === "spice" ? [i] : [],
  );
  for (const [n, i] of spices.entries()) {
    selection = selectHand(state, selection, i);
    assert.equal(
      tutorialStepAfterSelection(step("sell-select"), selection, state),
      step("sell-select"),
    );
    assert.equal(
      tutorialStepAfterNext(step("sell-select"), selection, state),
      n === 2 ? step("sell-confirm") : step("sell-select"),
    );
  }
  assert.equal(
    tutorialStepAfterNext(step("sell-confirm"), selection, state),
    step("sell-confirm"),
  );
  assert.equal(
    tutorialStepAfterNext(step("history-1"), emptySelection(), state),
    step("sell-mode"),
  );
});

test("clearing or changing exchange payment returns the guide to the missing input", () => {
  let state = createTutorialState();
  for (const action of TUTORIAL_ACTIONS.slice(0, 6))
    state = applyAction(state, action);
  assert.equal(
    tutorialStepAfterSelection(
      step("camel-exchange-confirm"),
      emptySelection(),
      state,
    ),
    step("camel-exchange-select"),
  );
  const selection = { market: [0, 1], hand: [], camels: 1 };
  assert.equal(
    tutorialStepAfterSelection(
      step("camel-exchange-confirm"),
      selection,
      state,
    ),
    step("camel-exchange-pay"),
  );
  const withWrongGood = { market: [], hand: [0, 1, 2, 4], camels: 0 };
  const opening = applyAction(
    applyAction(createTutorialState(), TUTORIAL_ACTIONS[0]),
    TUTORIAL_ACTIONS[1],
  );
  const clean = normalizeTutorialSelection(
    step("sell-select"),
    withWrongGood,
    opening,
  );
  assert.deepEqual(clean.hand, [0, 1, 4]);
  assert.ok(tutorialSelectionReady(step("sell-select"), clean, opening));
});

test("player completes goods-only and mixed exchanges through the actual selection controls", () => {
  let state = createTutorialState();
  for (const action of TUTORIAL_ACTIONS.slice(0, 8))
    state = applyAction(state, action);
  let selection = selectMarket(
    state,
    selectMarket(state, emptySelection(), 0),
    1,
  );
  assert.ok(
    tutorialSelectionReady(step("goods-exchange-select"), selection, state),
  );
  selection = selectHand(state, selectHand(state, selection, 2), 3);
  assert.ok(
    tutorialSelectionReady(step("goods-exchange-pay"), selection, state),
  );
  assert.ok(
    tutorialAccepts(
      4,
      selectedAction(state, selection).action!,
      state.market,
      state.players[0].hand,
    ),
  );
  state = applyAction(state, selectedAction(state, selection).action!);
  state = applyAction(state, TUTORIAL_ACTIONS[9]);
  selection = selectMarket(state, selectMarket(state, emptySelection(), 2), 3);
  selection = selectHand(state, selection, 2);
  assert.ok(
    tutorialSelectionReady(step("mixed-exchange-hand"), selection, state),
  );
  assert.ok(selectedAction(state, selection).error);
  selection = selectCamels(state, selection, 1);
  assert.ok(
    tutorialSelectionReady(step("mixed-exchange-camel"), selection, state),
  );
  assert.ok(
    tutorialAccepts(
      5,
      selectedAction(state, selection).action!,
      state.market,
      state.players[0].hand,
    ),
  );
  assert.equal(selectedAction(state, selection).error, "");
});

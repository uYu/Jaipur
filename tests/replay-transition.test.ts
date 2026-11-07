import test from "node:test";
import assert from "node:assert/strict";
import {
  replayTransition,
  actionTransition,
} from "../src/game/action-transition.ts";
import { createTutorialSave, TUTORIAL_ACTIONS } from "../src/game/tutorial.ts";
import { advance, replay } from "../src/game/storage.ts";
import { legalActions, newGame } from "../src/game/engine.ts";
import { marketSlotsAt } from "../src/game/opponent-turn.ts";
import {
  nextMarketSlots,
  takenMarketIndices,
} from "../src/game/market-layout.ts";
import { actionSummaries } from "../src/game/receipts.ts";
import { playerScoreDisplay } from "../src/game/score-display.ts";
import { presentAction } from "../src/game/presentation.ts";
import type { Action, Save } from "../src/game/types.ts";

test("opponent market selections stay visible before fading, including in reduced motion replay", () => {
  const save = { ...createTutorialSave(), events: TUTORIAL_ACTIONS };
  const checked = new Set<string>();
  for (let index = 0; index < save.events.length; index++) {
    const before = replay(save, index);
    const action = save.events[index];
    if (before.current !== 1 || action.type === "sell") continue;
    for (const reduced of [false, true]) {
      const step = replayTransition(save, index, { mobile: true, reduced })!;
      assert.ok(step.feedback!.departures.length > 0);
      assert.ok(step.departureHoldMs >= 1000);
      assert.ok(step.duration > step.departureHoldMs);
    }
    checked.add(action.type);
  }
  assert.ok(checked.has("take"));
  assert.ok(checked.has("camels"));
});

test("replay uses the same action transitions as a match for every tutorial action without changing the save", () => {
  const save = { ...createTutorialSave(), events: TUTORIAL_ACTIONS };
  const snapshot = structuredClone(save);
  for (const mobile of [true, false]) {
    for (let index = 0; index < save.events.length; index++) {
      const before = replay(save, index);
      const after = advance(before, save.events[index]);
      const options = { mobile, reduced: false, revealOpponent: true };
      const step = replayTransition(save, index, options)!;
      const live = actionTransition(
        before,
        save.events[index],
        after,
        marketSlotsAt(save, index),
        index,
        options,
      );
      assert.deepEqual(step, { ...live, replayTarget: index + 1 });
      assert.equal(step.eventLimit, index);
      assert.ok(step.duration > 0);
      assert.ok(step.flights.length > 0);
    }
  }
  assert.deepEqual(save, snapshot);
  for (const index of [-1, 0.5, save.events.length, save.events.length + 1])
    assert.equal(
      replayTransition(save, index, { mobile: true, reduced: false }),
      null,
    );
});

test("mobile taking and camel collection finish selected cards before refilling actual public market slots", () => {
  const slots = [4, 2, 0, 3, 1];
  for (const actor of [0, 1]) {
    for (const reduced of [false, true]) {
      const before = newGame(3);
      before.current = actor;
      before.market = ["gold", "cloth", "camel", "leather", "camel"];
      before.players[actor].hand = ["diamond"];
      before.deck = ["diamond", "gold", "silver", "spice", "leather"];
      for (const action of [
        { type: "take", index: 1 },
        { type: "camels" },
      ] satisfies Action[]) {
        const after = advance(before, action);
        const step = actionTransition(before, action, after, slots, 0, {
          mobile: true,
          reduced,
        });
        const destination =
          action.type === "camels"
            ? actor === 0
              ? "your-herd"
              : "opponent-herd"
            : actor === 0
              ? "your-hand"
              : "opponent-hand";
        const departures = step.flights.filter(
          (flight) => flight.from !== "deck" && !flight.layout,
        );
        const refills = step.flights.filter((flight) => flight.from === "deck");
        assert.deepEqual(
          departures.map((flight) => flight.from),
          action.type === "camels" ? ["market-0", "market-1"] : ["market-2"],
        );
        assert.ok(
          departures.every(
            (flight) => flight.to === destination && flight.hideSource,
          ),
        );
        assert.ok(step.flights.every((flight) => flight.coin === undefined));
        assert.ok(
          departures.every(
            (flight) =>
              Math.abs(
                (flight.end - flight.start) * step.duration -
                  (reduced ? 150 : 1000),
              ) < 0.01,
          ),
        );
        const retained =
          before.market.length - takenMarketIndices(before, action).length;
        const nextSlots = nextMarketSlots(before, action, after, slots);
        assert.deepEqual(
          refills.map((flight) => [flight.to, flight.good]),
          after.market
            .slice(retained)
            .map((good, index) => [
              `market-${nextSlots[retained + index]}`,
              good,
            ]),
        );
        assert.ok(
          refills.every(
            (flight) =>
              flight.fromBack &&
              !flight.toBack &&
              !flight.hideSource &&
              !flight.hideTarget,
          ),
        );
        assert.ok(
          Math.max(...departures.map((flight) => flight.end)) <
            Math.min(...refills.map((flight) => flight.start)),
        );
        assert.ok(
          refills.every(
            (flight) =>
              Math.abs(
                (flight.end - flight.start) * step.duration -
                  (reduced ? 180 : 900),
              ) < 0.01,
          ),
        );
        assert.ok(
          step.flights.every(
            (flight) =>
              flight.start * step.duration >= step.departureHoldMs - 0.01,
          ),
        );
        assert.ok(
          !JSON.stringify(
            step.flights.filter((flight) => actor === 1 || !flight.layout),
          ).includes("diamond"),
        );
        if (actor === 1) assert.equal(step.departureHoldMs, 1200);
        if (!reduced) assert.ok(step.duration >= 2380 && step.duration <= 3560);
      }
    }
  }
});

test("mobile short-deck collection flies only available refill cards into surviving visual slots", () => {
  const slots = [4, 2, 0, 3, 1];
  for (const actor of [0, 1]) {
    for (const reduced of [false, true]) {
      for (const available of [0, 1, 2]) {
        const before = newGame(3);
        before.current = actor;
        before.market = ["camel", "cloth", "camel", "gold", "camel"];
        before.deck = ["silver", "leather"].slice(
          0,
          available,
        ) as typeof before.deck;
        const action: Action = { type: "camels" };
        const after = advance(before, action);
        const step = actionTransition(before, action, after, slots, 0, {
          mobile: true,
          reduced,
        });
        const refills = step.flights.filter((flight) => flight.from === "deck");
        assert.notEqual(after.phase, "playing");
        assert.equal(refills.length, available);
        assert.deepEqual(
          refills.map((flight) => flight.to),
          ["market-0", "market-1"].slice(0, available),
        );
        assert.deepEqual(
          refills.map((flight) => flight.good),
          after.market.slice(2),
        );
        assert.ok(
          step.flights.every(
            (flight) => flight.start < flight.end && flight.end < 1,
          ),
        );
        assert.ok(!step.flights.some((flight) => flight.to === "market-4"));
        const desktop = actionTransition(before, action, after, slots, 0, {
          mobile: false,
          reduced,
        });
        assert.ok(!desktop.flights.some((flight) => flight.from === "deck"));
      }
    }
  }
});

test("mobile exchanges start payment first and smoothly overlap receiving and hand compaction", () => {
  for (const actor of [0, 1]) {
    for (const reduced of [false, true]) {
      const before = newGame(3);
      before.current = actor;
      before.market = ["gold", "cloth", "camel", "leather", "camel"];
      before.players[actor].hand = ["diamond", "spice", "spice"];
      before.players[actor].camels = 2;
      const action: Action = {
        type: "exchange",
        market: [0, 1],
        hand: [1],
        camels: 1,
      };
      const step = actionTransition(
        before,
        action,
        advance(before, action),
        [4, 2, 0, 3, 1],
        0,
        { mobile: true, reduced },
      );
      const incoming = step.flights.filter((flight) =>
        flight.from.startsWith("market-"),
      );
      const outgoing = step.flights.filter((flight) =>
        flight.to.startsWith("market-"),
      );
      assert.equal(incoming.length, 2);
      assert.deepEqual(
        outgoing.map((flight) => [flight.from, flight.to, flight.good]),
        [
          [actor === 0 ? "hand-1" : "opponent-hand", "market-2", "spice"],
          [actor === 0 ? "your-herd" : "opponent-herd", "market-4", "camel"],
        ],
      );
      assert.ok(
        Math.min(...outgoing.map((flight) => flight.start)) <
          Math.min(...incoming.map((flight) => flight.start)),
      );
      assert.ok(
        Math.min(...incoming.map((flight) => flight.start)) <
          Math.max(...outgoing.map((flight) => flight.end)),
      );
      assert.ok(
        step.flights.every(
          (flight) => flight.end < 1 && flight.start < flight.end,
        ),
      );
      assert.ok(
        !JSON.stringify(
          step.flights.filter((flight) => actor === 1 || !flight.layout),
        ).includes("diamond"),
      );
      assert.ok(
        !step.flights.some(
          (flight) => flight.from === "deck" || flight.coin !== undefined,
        ),
      );
      assert.ok(
        outgoing
          .filter((flight) => flight.from.endsWith("-herd"))
          .every((flight) => !flight.hideSource),
      );
      if (!reduced) assert.ok(step.duration >= 1800 && step.duration <= 2700);
      if (actor === 1) assert.equal(step.departureHoldMs, 1200);
    }
  }
});

test("mobile sales land sold cards before income coins travel to the actor's money pile", () => {
  for (const actor of [0, 1]) {
    for (const count of [1, 3, 7]) {
      const before = newGame(3);
      before.current = actor;
      before.players[actor].hand = Array(count).fill("spice");
      if (count < 7) before.players[actor].hand.push("diamond");
      const action: Action = { type: "sell", good: "spice", count };
      const after = advance(before, action);
      const snapshot = structuredClone(before);
      const step = actionTransition(before, action, after, [0, 1, 2, 3, 4], 0, {
        mobile: true,
        reduced: false,
      });
      assert.equal(step.before, before);
      assert.deepEqual(before, snapshot);
      assert.equal(step.departureHoldMs, 500);
      assert.ok(step.duration >= 2570 && step.duration <= 3880);
      const cards = step.flights.filter((flight) => flight.to === "sale");
      const income = step.flights.filter((flight) => flight.coin !== undefined);
      assert.equal(cards.length, count);
      assert.equal(
        income.length,
        step.action.coins.length + (step.action.bonus === null ? 0 : 1),
      );
      cards.forEach((flight, index) => {
        assert.equal(flight.good, "spice");
        assert.equal(flight.to, "sale");
        assert.equal(flight.fromBack, actor === 1);
        assert.equal(
          flight.from,
          actor === 0 ? `hand-${index}` : "opponent-hand",
        );
        assert.equal(flight.coin, undefined);
        assert.ok(
          Math.abs(flight.start * step.duration - (500 + index * 90)) < 0.01,
        );
        assert.ok(
          Math.abs((flight.end - flight.start) * step.duration - 1050) < 0.01,
        );
      });
      assert.deepEqual(
        income.map((flight) => flight.coin),
        [
          ...step.action.coins,
          ...(step.action.bonus === null
            ? []
            : [step.action.bonus === "hidden" ? "?" : step.action.bonus]),
        ],
      );
      assert.ok(
        Math.max(...cards.map((flight) => flight.end)) <
          Math.min(...income.map((flight) => flight.start)),
      );
      income.forEach((flight, index) => {
        assert.equal(flight.to, `money-${actor}`);
        assert.equal(
          flight.from,
          index < step.action.coins.length
            ? "stock-spice"
            : `bonus-face-${Math.min(count, 5)}`,
        );
        assert.equal(flight.hideSource, false);
        assert.equal(flight.hideTarget, false);
        assert.ok(
          Math.abs((flight.end - flight.start) * step.duration - 650) < 0.01,
        );
        if (index > 0)
          assert.ok(
            Math.abs(
              (flight.start - income[index - 1].start) * step.duration - 110,
            ) < 0.01,
          );
      });
      assert.ok(
        Math.abs(step.duration - income.at(-1)!.end * step.duration - 220) <
          0.01,
      );
      assert.ok(
        !JSON.stringify(
          step.flights.filter((flight) => actor === 1 || !flight.layout),
        ).includes("diamond"),
      );
      if (actor === 1 && count >= 3) assert.equal(step.action.bonus, "hidden");
    }
  }
});

test("reduced-motion mobile sales retain a readable hold and static arrival without a long travel", () => {
  const before = newGame(3);
  before.current = 0;
  before.players[0].hand = Array(7).fill("spice");
  const action: Action = { type: "sell", good: "spice", count: 7 };
  const step = actionTransition(
    before,
    action,
    advance(before, action),
    [0, 1, 2, 3, 4],
    0,
    { mobile: true, reduced: true },
  );
  assert.equal(step.duration, 1030);
  assert.equal(step.departureHoldMs, 400);
  const cards = step.flights.filter((flight) => flight.to === "sale");
  const income = step.flights.filter((flight) => flight.coin !== undefined);
  assert.equal(cards.length, 7);
  assert.equal(income.length, 8);
  assert.ok(cards.every((flight) => flight.start === 400 / 1030));
  assert.ok(cards.every((flight) => flight.end === 550 / 1030));
  assert.ok(income.every((flight) => flight.start === 650 / 1030));
  assert.ok(income.every((flight) => flight.end === 830 / 1030));
});

test("mobile income includes only actually available sale tokens and never invents an exhausted bonus", () => {
  for (const actor of [0, 1]) {
    for (const available of [0, 1]) {
      const before = newGame(3);
      before.current = actor;
      before.players[actor].hand = ["spice", "spice", "spice", "diamond"];
      before.tokens.spice = available ? [2] : [];
      before.bonus[3] = [];
      const action: Action = { type: "sell", good: "spice", count: 3 };
      const after = advance(before, action);
      const step = actionTransition(before, action, after, [0, 1, 2, 3, 4], 0, {
        mobile: true,
        reduced: false,
      });
      const income = step.flights.filter((flight) => flight.coin !== undefined);
      assert.deepEqual(
        income.map((flight) => [flight.from, flight.to, flight.coin]),
        available ? [["stock-spice", `money-${actor}`, 2]] : [],
      );
      assert.equal(step.action.bonus, null);
      assert.equal(
        step.flights.filter((flight) => flight.to === "sale").length,
        3,
      );
      assert.ok(
        !JSON.stringify(
          step.flights.filter((flight) => actor === 1 || !flight.layout),
        ).includes("diamond"),
      );
    }
  }
});

test("replay round transitions deal the new round and clear the old round's action summary", () => {
  const save: Save = {
    version: 1,
    seed: 41,
    targetSeals: 2,
    difficulty: "easy",
    events: [],
  };
  let state = newGame(save.seed, 2);
  for (let i = 0; state.phase === "playing" && i < 400; i++) {
    const actions = legalActions(state);
    const action = actions.find((a) => a.type === "sell") ?? actions[0];
    save.events.push(action);
    state = advance(state, action);
  }
  assert.equal(state.phase, "roundEnd");
  const index = save.events.length;
  save.events.push({ type: "next" });
  const step = replayTransition(save, index, {
    mobile: true,
    reduced: false,
    revealOpponent: true,
  })!;
  assert.equal(step.kind, "deal");
  assert.equal(step.before.round, state.round + 1);
  assert.equal(step.before.phase, "playing");
  assert.equal(step.eventLimit, index + 1);
  assert.equal(step.replayTarget, index + 1);
  assert.deepEqual(actionSummaries(save, step.eventLimit, true).lastActions, [
    null,
    null,
  ]);
});

test("revealing replay scores does not change the live privacy projection or award camel points early", () => {
  const state = newGame(7);
  state.players[1].goods = [7, 6];
  state.players[1].bonuses = [3, 10];
  state.players[1].camels = 8;
  state.players[0].camels = 1;
  assert.equal(playerScoreDisplay(state, 1).hidden, true);
  assert.deepEqual(playerScoreDisplay(state, 1, true), {
    total: 26,
    goods: 13,
    bonus: 13,
    goodsTokenCount: 2,
    bonusTokenCount: 2,
    hidden: false,
  });
  assert.equal(playerScoreDisplay(state, 1).total, null);
});

test("opponent bonus faces are revealed in replay receipts and sale animations only when requested", () => {
  let save: Save | undefined;
  let sale: Action | undefined;
  for (let seed = 1; seed < 2000; seed++) {
    const state = newGame(seed);
    if (state.current !== 0) continue;
    const first = legalActions(state)[0];
    const next = advance(state, first);
    sale = legalActions(next).find((a) => a.type === "sell" && a.count >= 3);
    if (sale) {
      save = { version: 1, seed, difficulty: "easy", events: [first, sale] };
      break;
    }
  }
  assert.ok(save && sale);
  const before = replay(save, 1);
  const after = replay(save, 2);
  const actual = after.players[1].bonuses.at(-1)!;
  assert.equal(presentAction(before, sale, after).bonus, "hidden");
  assert.equal(actionSummaries(save).receipts[1]!.bonus, "hidden");
  assert.equal(actionSummaries(save, 2, true).receipts[1]!.bonus, actual);
  assert.equal(
    replayTransition(save, 1, {
      mobile: true,
      reduced: false,
      revealOpponent: true,
    })!.action.bonus,
    actual,
  );
  assert.equal(
    replayTransition(save, 1, { mobile: true, reduced: false })!.action.bonus,
    "hidden",
  );
  for (const revealOpponent of [false, true]) {
    const step = replayTransition(save, 1, {
      mobile: true,
      reduced: false,
      revealOpponent,
    })!;
    const bonus = step.flights.find((flight) =>
      flight.from.startsWith("bonus-face-"),
    )!;
    assert.equal(bonus.to, "money-1");
    assert.equal(bonus.coin, revealOpponent ? actual : "?");
  }
});

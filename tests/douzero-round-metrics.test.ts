import test from "node:test";
import assert from "node:assert/strict";
import { completedGameRoundMetrics } from "../scripts/douzero-round-metrics.ts";
import type { Event, RoundResult } from "../src/game/types.ts";

test("counts completed player-rounds, sale actions, and cards sold", () => {
  const events: Event[] = [
    { type: "take", index: 0 },
    { type: "sell", good: "leather", count: 1 },
    { type: "next" },
    { type: "camels" },
    { type: "exchange", market: [0, 1], hand: [0], camels: 1 },
    { type: "sell", good: "gold", count: 2 },
  ];
  const samples = [0, 1, 1, 0, 1].map((actor) => ({ actor }));
  const results: RoundResult[] = [
    { round: 1, scores: [70, 65], goods: [60, 55], bonuses: [10, 10],
      camel: null, winner: 0, reason: "test" },
    { round: 2, scores: [90, 80], goods: [80, 70], bonuses: [10, 10],
      camel: null, winner: 0, reason: "test" },
  ];
  assert.deepEqual(completedGameRoundMetrics(events, samples, results), {
    playerRounds: 4,
    scoreSum: 305,
    goodsSold: 3,
    actionCounts: {
      take_goods: 1, take_camels: 1, trade: 1, sell_actions: 2,
    },
  });
});

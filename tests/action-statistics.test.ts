import test from "node:test";
import assert from "node:assert/strict";
import { actionStatistics } from "../src/game/action-statistics.ts";
import { actionSummaries } from "../src/game/receipts.ts";
import { createTutorialSave, TUTORIAL_ACTIONS } from "../src/game/tutorial.ts";

const save = { ...createTutorialSave(), events: TUTORIAL_ACTIONS };
const { history } = actionSummaries(save);

test("action counts include batch sales and camel herds once per turn, including the last turn", () => {
  assert.deepEqual(actionStatistics(history), [
    { sell: 1, camels: 1, take: 1, exchange: 3 },
    { sell: 3, camels: 1, take: 2, exchange: 0 },
  ]);
  assert.deepEqual(actionStatistics(actionSummaries(save, 7).history), [
    { sell: 1, camels: 1, take: 1, exchange: 1 },
    { sell: 2, camels: 0, take: 1, exchange: 0 },
  ]);
});

test("round statistics use the recorded actor when the starting player changes; match statistics combine rounds", () => {
  const secondRound = history.map((record) => ({
    ...record,
    round: 2,
    action: { ...record.action, actor: 1 - record.action.actor },
  }));
  const combined = [...history, ...secondRound];
  assert.deepEqual(actionStatistics(combined, 1), actionStatistics(history));
  assert.deepEqual(actionStatistics(combined, 2), [
    { sell: 3, camels: 1, take: 2, exchange: 0 },
    { sell: 1, camels: 1, take: 1, exchange: 3 },
  ]);
  assert.deepEqual(actionStatistics(combined), [
    { sell: 4, camels: 2, take: 3, exchange: 3 },
    { sell: 4, camels: 2, take: 3, exchange: 3 },
  ]);
});

test("empty histories and absent rounds report zero for all four actions", () => {
  const zeros = [
    { sell: 0, camels: 0, take: 0, exchange: 0 },
    { sell: 0, camels: 0, take: 0, exchange: 0 },
  ];
  assert.deepEqual(actionStatistics([]), zeros);
  assert.deepEqual(actionStatistics(history, 3), zeros);
});

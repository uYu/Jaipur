import type { Event, RoundResult } from "../src/game/types.ts";

export const ROUND_ACTIONS = [
  "take_goods", "take_camels", "trade", "sell_actions",
] as const;
export type RoundAction = (typeof ROUND_ACTIONS)[number];
export type RoundMetrics = {
  playerRounds: number;
  scoreSum: number;
  goodsSold: number;
  actionCounts: Record<RoundAction, number>;
};

export const emptyRoundMetrics = (): RoundMetrics => ({
  playerRounds: 0,
  scoreSum: 0,
  goodsSold: 0,
  actionCounts: {
    take_goods: 0, take_camels: 0, trade: 0, sell_actions: 0,
  },
});

export function addRoundMetrics(target: RoundMetrics, source: RoundMetrics) {
  target.playerRounds += source.playerRounds;
  target.scoreSum += source.scoreSum;
  target.goodsSold += source.goodsSold;
  for (const action of ROUND_ACTIONS)
    target.actionCounts[action] += source.actionCounts[action];
}

/** One observation for each seat in each completed round of a finished match. */
export function completedGameRoundMetrics(
  events: readonly Event[],
  samples: readonly { actor: number }[],
  results: readonly RoundResult[],
): RoundMetrics {
  const metrics = emptyRoundMetrics();
  let round = 0;
  let actionIndex = 0;
  const finishRound = () => {
    const result = results[round++];
    if (!result || result.scores.length !== 2 ||
        result.scores.some((score) => !Number.isFinite(score)))
      throw Error("Missing completed round score");
    metrics.playerRounds += 2;
    metrics.scoreSum += result.scores[0] + result.scores[1];
  };
  for (const event of events) {
    if (event.type === "next") {
      finishRound();
      continue;
    }
    const sample = samples[actionIndex++];
    if (!sample || (sample.actor !== 0 && sample.actor !== 1))
      throw Error("Action history and samples differ");
    const category: RoundAction =
      event.type === "take" ? "take_goods" :
      event.type === "camels" ? "take_camels" :
      event.type === "exchange" ? "trade" :
      "sell_actions";
    metrics.actionCounts[category]++;
    if (event.type === "sell") metrics.goodsSold += event.count;
  }
  finishRound();
  if (round !== results.length || actionIndex !== samples.length)
    throw Error("Completed game round and action counts disagree");
  return metrics;
}

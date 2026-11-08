import type { Action } from "./types.ts";
import type { ActionRecord } from "./receipts.ts";

export const ACTION_STATISTIC_ROWS = [
  { type: "sell", label: "卖牌" },
  { type: "camels", label: "拿骆驼" },
  { type: "take", label: "拿货" },
  { type: "exchange", label: "换货" },
] as const;

type Counts = Record<Action["type"], number>;

/** Count committed turns, rather than the cards moved by each turn. */
export function actionStatistics(
  history: readonly ActionRecord[],
  round?: number,
): [Counts, Counts] {
  const counts: [Counts, Counts] = [
    { sell: 0, camels: 0, take: 0, exchange: 0 },
    { sell: 0, camels: 0, take: 0, exchange: 0 },
  ];
  for (const record of history) {
    if (round !== undefined && record.round !== round) continue;
    counts[record.action.actor === 0 ? 0 : 1][record.action.type]++;
  }
  return counts;
}

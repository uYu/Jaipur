import type { Action, State } from "./types.ts";
import { LABEL, sum } from "./data.ts";
import { nextMarketSlots, takenMarketIndices } from "./market-layout.ts";
import type { Presentation } from "./presentation.ts";

export type CardDeparture = { anchor: string; label: string };
export type BoardFeedback = {
  round: number;
  turn: number;
  departures: CardDeparture[];
  addedSlots: number[];
  addedLabel: string;
  handArrivals: number[];
  handLabel: string;
};

// Only table positions and public actions reach the animation layer.
export function boardFeedback(
  before: State,
  action: Action,
  after: State,
  slots: number[],
): BoardFeedback {
  const actor = before.current === 0 ? "你" : "米拉";
  const taken = takenMarketIndices(before, action);
  const nextSlots = nextMarketSlots(before, action, after, slots);
  const paidHand =
    action.type === "exchange"
      ? action.hand
      : action.type === "sell"
        ? before.players[before.current].hand
            .flatMap((good, i) => (good === action.good ? [i] : []))
            .slice(0, action.count)
        : [];
  const marketLabel =
    action.type === "camels"
      ? `${actor}收驼`
      : action.type === "exchange"
        ? `${actor}换入`
        : `${actor}拿取`;
  const retainedHand = before.players[0].hand.length - paidHand.length;
  return {
    round: before.round,
    turn: before.turn + 1,
    departures: [
      ...taken.map((i) => ({
        anchor: `market-${slots[i]}`,
        label: marketLabel,
      })),
      ...(before.current === 0
        ? paidHand.map((i) => ({
            anchor: `hand-${i}`,
            label: action.type === "sell" ? "出售" : "付出",
          }))
        : []),
    ],
    addedSlots: nextSlots.slice(before.market.length - taken.length),
    addedLabel: action.type === "exchange" ? `${actor}付出` : "补充",
    handArrivals:
      before.current === 0 &&
      (action.type === "take" || action.type === "exchange")
        ? Array.from({ length: taken.length }, (_, i) => retainedHand + i)
        : [],
    handLabel: action.type === "exchange" ? "换入" : "拿入",
  };
}

export function saleFeedbackText(action: Presentation) {
  const goods = sum(action.coins);
  const bonus = typeof action.bonus === "number" ? action.bonus : 0;
  return {
    title: `${action.actor === 0 ? "你" : "米拉"}卖出${LABEL[action.outgoing[0]]} ×${action.outgoing.length}`,
    income:
      action.bonus === "hidden"
        ? `货物 +${goods} 卢比`
        : `收入 +${goods + bonus} 卢比`,
    detail:
      action.bonus === "hidden"
        ? "另获 1 枚奖励 · 面值保密"
        : action.bonus !== null
          ? `货物 ${goods} + 奖励 ${bonus}`
          : "",
  };
}

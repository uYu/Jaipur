import type { Action, State } from "./types.ts";
import { actionError } from "./engine.ts";
export type Selection = { market: number[]; hand: number[]; camels: number };
export const emptySelection = (): Selection => ({
  market: [],
  hand: [],
  camels: 0,
});
const toggle = (items: number[], i: number) =>
  items.includes(i) ? items.filter((n) => n !== i) : [...items, i];
export function selectMarket(
  s: State,
  selection: Selection,
  index: number,
): Selection {
  if (s.market[index] === "camel")
    return {
      ...emptySelection(),
      market: selection.market.includes(index)
        ? []
        : s.market.flatMap((c, i) => (c === "camel" ? [i] : [])),
    };
  return {
    ...selection,
    market: toggle(
      selection.market.filter((i) => s.market[i] !== "camel"),
      index,
    ),
  };
}
export function selectHand(
  s: State,
  selection: Selection,
  index: number,
): Selection {
  return {
    ...selection,
    market: selection.market.filter((i) => s.market[i] !== "camel"),
    hand: toggle(selection.hand, index),
  };
}
export function selectCamels(
  s: State,
  selection: Selection,
  count: number,
): Selection {
  return {
    ...selection,
    market: selection.market.filter((i) => s.market[i] !== "camel"),
    camels: Math.max(0, Math.min(s.players[s.current].camels, count)),
  };
}
export function selectedAction(
  s: State,
  selection: Selection,
): { action: Action | null; error: string } {
  const { market, hand, camels } = selection;
  let action: Action | null = null;
  if (market.some((i) => s.market[i] === "camel")) action = { type: "camels" };
  else if (
    market.length > 1 ||
    camels > 0 ||
    (market.length > 0 && hand.length > 0)
  )
    action = { type: "exchange", market, hand, camels };
  else if (market.length === 1) action = { type: "take", index: market[0] };
  else if (hand.length) {
    const good = s.players[s.current].hand[hand[0]];
    if (hand.some((i) => s.players[s.current].hand[i] !== good))
      return {
        action: null,
        error: "出售请选择同类手牌；要交换，请继续选择市场货物",
      };
    action = { type: "sell", good, count: hand.length };
  }
  return { action, error: action ? (actionError(s, action) ?? "") : "" };
}

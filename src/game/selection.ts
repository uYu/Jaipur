import type { Action, State } from "./types.ts";
import { actionError } from "./engine.ts";
export type Selection = { market: number[]; hand: number[]; camels: number };
export type ActionMode = "take" | "sell" | "exchange";
export const emptySelection = (): Selection => ({
  market: [],
  hand: [],
  camels: 0,
});
const toggle = (items: number[], i: number) =>
  items.includes(i) ? items.filter((n) => n !== i) : [...items, i];
const validIndex = (index: number, length: number) =>
  Number.isInteger(index) && index >= 0 && index < length;
export function selectMarket(
  s: State,
  selection: Selection,
  index: number,
  mode?: ActionMode | null,
): Selection {
  if (
    mode === null ||
    mode === "sell" ||
    !validIndex(index, s.market.length) ||
    (mode === "exchange" && s.market[index] === "camel")
  )
    return selection;
  if (s.market[index] === "camel")
    return {
      ...emptySelection(),
      market: selection.market.includes(index)
        ? []
        : s.market.flatMap((c, i) => (c === "camel" ? [i] : [])),
    };
  if (mode === "take")
    return {
      ...emptySelection(),
      market: selection.market.includes(index) ? [] : [index],
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
  mode?: ActionMode | null,
): Selection {
  const hand = s.players[s.current].hand;
  if (mode === null || mode === "take" || !validIndex(index, hand.length))
    return selection;
  if (mode === "sell")
    return {
      ...emptySelection(),
      hand: selection.hand.every((i) => hand[i] === hand[index])
        ? toggle(selection.hand, index)
        : [index],
    };
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
  mode?: ActionMode | null,
): Selection {
  if (mode === null || mode === "take" || mode === "sell") return selection;
  return {
    ...selection,
    market: selection.market.filter((i) => s.market[i] !== "camel"),
    camels: Math.max(0, Math.min(s.players[s.current].camels, count)),
  };
}
export function selectedAction(
  s: State,
  selection: Selection,
  mode?: ActionMode | null,
): { action: Action | null; error: string } {
  const { market, hand, camels } = selection;
  let action: Action | null = null;
  if (mode === null) return { action, error: "" };
  if (mode !== undefined) {
    if (mode === "exchange") {
      if (market.length || hand.length || camels)
        action = { type: "exchange", market, hand, camels };
    } else if (mode === "take") {
      if (market.some((i) => !validIndex(i, s.market.length)))
        return { action: null, error: "请选择市场里的卡牌" };
      if (market.some((i) => s.market[i] === "camel")) {
        if (market.some((i) => s.market[i] !== "camel"))
          return { action: null, error: "骆驼和货物不能一起拿取" };
        action = { type: "camels" };
      } else if (market.length > 1)
        return { action: null, error: "拿取每次只能选择 1 张货物" };
      else if (market.length === 1) action = { type: "take", index: market[0] };
    } else if (hand.length) {
      const playerHand = s.players[s.current].hand;
      if (hand.some((i) => !validIndex(i, playerHand.length)))
        return { action: null, error: "请选择自己的手牌" };
      const good = playerHand[hand[0]];
      if (hand.some((i) => playerHand[i] !== good))
        return { action: null, error: "出售请选择同类手牌" };
      action = { type: "sell", good, count: hand.length };
    }
    return { action, error: action ? (actionError(s, action) ?? "") : "" };
  }
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

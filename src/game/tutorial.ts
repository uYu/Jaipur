import type { Action, Card, Good, Save, State } from "./types.ts";
import { selectedAction, type Selection } from "./selection.ts";

export const GAME_GOAL = "收市时，总分高的一方赢下本轮。";
export const TUTORIAL_EXCHANGE_PAYMENTS = [
  { camels: 0, label: "手牌" },
  { camels: 2, label: "骆驼" },
  { camels: 1, label: "手牌＋骆驼" },
] as const;
export type TutorialPayment =
  (typeof TUTORIAL_EXCHANGE_PAYMENTS)[number]["camels"];

export const TUTORIAL_SEED = 66980;
type TutorialLesson = {
  action: Action["type"];
  title: string;
  text: string;
  seed: number;
  example: Card;
  exchangePayment?: Good;
  closingGood?: Good;
  setup?: readonly Action[];
};

// The two leather cards are worth 1 each, while the market holds two diamonds.
const exchangeSetup: Action[] = [
  { type: "sell", good: "leather", count: 3 },
  { type: "camels" },
  { type: "take", index: 2 },
  { type: "exchange", market: [1, 2, 3], hand: [0], camels: 2 },
  { type: "sell", good: "cloth", count: 2 },
];

// A legal match prefix with gold and silver depleted and one diamond chip left.
const closingSetup: Action[] = [
  { type: "sell", good: "silver", count: 3 },
  { type: "exchange", market: [3, 4], hand: [], camels: 2 },
  { type: "sell", good: "spice", count: 2 },
  { type: "sell", good: "diamond", count: 2 },
  { type: "camels" },
  { type: "exchange", market: [1, 3, 4], hand: [0, 1, 2], camels: 0 },
  { type: "exchange", market: [0, 1, 2, 4], hand: [], camels: 4 },
  { type: "sell", good: "diamond", count: 2 },
  { type: "sell", good: "spice", count: 2 },
  { type: "camels" },
  { type: "sell", good: "cloth", count: 1 },
  { type: "exchange", market: [0, 1, 3, 4], hand: [], camels: 4 },
  { type: "camels" },
  { type: "sell", good: "gold", count: 2 },
  { type: "exchange", market: [0, 2, 3, 4], hand: [], camels: 4 },
  { type: "sell", good: "leather", count: 2 },
  { type: "camels" },
  { type: "take", index: 2 },
  { type: "exchange", market: [0, 2], hand: [], camels: 2 },
  { type: "camels" },
  { type: "sell", good: "gold", count: 3 },
  { type: "exchange", market: [0, 3, 4], hand: [], camels: 3 },
  { type: "sell", good: "cloth", count: 1 },
  { type: "sell", good: "silver", count: 2 },
];

// Separate deals keep each exercise playable even when the player takes a
// different legal trade in the previous one.
export const TUTORIAL_LESSONS: readonly TutorialLesson[] = [
  {
    action: "take",
    title: "拿货",
    text: "拿 1 张香料就能凑成 3 张，也可以拿丝绸。",
    seed: TUTORIAL_SEED,
    example: "spice",
  },
  {
    action: "sell",
    title: "卖货",
    text: "卖同类手牌有货款。一次卖至少 3 张，再领批量奖励。",
    seed: 4,
    example: "spice",
  },
  {
    action: "camels",
    title: "收骆驼",
    text: "点一头就能收走市场里全部骆驼。手牌最多 7 张，骆驼不占手牌，数量不限。",
    seed: TUTORIAL_SEED,
    example: "camel",
  },
  {
    action: "exchange",
    title: "换货",
    text: "用两张低价皮革，换进两张钻石。",
    seed: 1728,
    example: "diamond",
    exchangePayment: "leather",
    setup: exchangeSetup,
  },
  {
    action: "sell",
    title: "收市",
    text: "黄金、白银已售罄。卖出两张钻石，领走最后一枚钻石筹码，触发收市。",
    seed: 2098,
    example: "diamond",
    closingGood: "diamond",
    setup: closingSetup,
  },
];

export const createTutorialSave = (lesson = 0): Save => ({
  version: 1,
  seed: TUTORIAL_LESSONS[lesson].seed,
  targetSeals: 1,
  difficulty: "easy",
  events: [...(TUTORIAL_LESSONS[lesson].setup ?? [])],
});

export function tutorialAccepts(
  lesson: TutorialLesson,
  action: Action,
  paymentCamels: TutorialPayment = 0,
) {
  return (
    action.type === lesson.action &&
    (!lesson.exchangePayment ||
      (action.type === "exchange" &&
        action.market.length === 2 &&
        action.camels === paymentCamels)) &&
    (!lesson.closingGood ||
      (action.type === "sell" && action.good === lesson.closingGood))
  );
}

export function tutorialTapTarget(
  lesson: TutorialLesson,
  state: State,
  { market, hand, camels }: Selection,
  paymentCamels: TutorialPayment = 0,
) {
  const cards = state.players[0].hand;
  if (lesson.exchangePayment) {
    const paymentCards = 2 - paymentCamels;
    if (
      market.length > 2 ||
      hand.length > paymentCards ||
      camels > paymentCamels
    )
      return { area: "clear" as const };
    if (market.filter((i) => state.market[i] !== "camel").length < 2) {
      const index = state.market.findIndex(
        (good, i) => good === lesson.example && !market.includes(i),
      );
      if (index >= 0) return { area: "market" as const, index };
    }
    if (hand.length < paymentCards) {
      const index = cards.findIndex(
        (good, i) => good === lesson.exchangePayment && !hand.includes(i),
      );
      if (index >= 0) return { area: "hand" as const, index };
    }
    if (camels < paymentCamels) return { area: "camel" as const };
  } else if (!market.length && !camels) {
    if (lesson.action === "sell") {
      if (hand.every((i) => cards[i] === lesson.example)) {
        const index = cards.findIndex(
          (good, i) => good === lesson.example && !hand.includes(i),
        );
        if (index >= 0) return { area: "hand" as const, index };
      }
    } else if (!hand.length) {
      const index = state.market.indexOf(lesson.example);
      if (index >= 0) return { area: "market" as const, index };
    }
  }

  const { action, error } = selectedAction(state, { market, hand, camels });
  return action && !error && tutorialAccepts(lesson, action, paymentCamels)
    ? { area: "confirm" as const }
    : null;
}

// Reference match used by the replay, animation and statistics tests.
export const TUTORIAL_ACTIONS: Action[] = [
  { type: "take", index: 4 },
  { type: "sell", good: "gold", count: 2 },
  { type: "sell", good: "spice", count: 3 },
  { type: "sell", good: "cloth", count: 1 },
  { type: "camels" },
  { type: "take", index: 2 },
  { type: "exchange", market: [0, 1], hand: [], camels: 2 },
  { type: "camels" },
  { type: "exchange", market: [0, 1], hand: [2, 3], camels: 0 },
  { type: "take", index: 2 },
  { type: "exchange", market: [2, 3], hand: [2], camels: 1 },
  { type: "sell", good: "spice", count: 1 },
];

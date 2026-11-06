import type { Action, Save, State } from "./types.ts";
import { boardFeedback } from "./action-feedback.ts";
import type { BoardFeedback } from "./action-feedback.ts";
import { presentAction } from "./presentation.ts";
import type { Presentation } from "./presentation.ts";
import { dealFlights } from "./flights.ts";
import type { Flight } from "./flights.ts";
import { settlementFlights } from "./settlement-flights.ts";
import { initialMarketSlots } from "./market-layout.ts";
import { marketSlotsAt } from "./opponent-turn.ts";
import { advance, replay } from "./storage.ts";

export type TransitionOptions = {
  mobile: boolean;
  reduced: boolean;
  revealOpponent?: boolean;
};
export type ActionTransition = {
  kind: "action" | "deal";
  eventLimit: number;
  before: State;
  marketSlots: number[];
  action: Presentation;
  caption?: string;
  flights: Flight[];
  duration: number;
  departureHoldMs: number;
  feedback?: BoardFeedback;
  replayTarget?: number;
};

export function actionTransition(
  before: State,
  action: Action,
  after: State,
  slots: number[],
  eventLimit: number,
  options: TransitionOptions,
): ActionTransition {
  // Give the opponent's market selection time to be read before it fades.
  const departureHoldMs = options.mobile
    ? before.current === 1 && action.type !== "sell"
      ? 1200
      : options.reduced
        ? 450
        : 570
    : 0;
  return {
    kind: "action",
    eventLimit,
    before,
    marketSlots: slots,
    action: presentAction(before, action, after, options.revealOpponent),
    flights: options.mobile
      ? []
      : settlementFlights(before, action, after, slots),
    duration: options.mobile
      ? departureHoldMs + (options.reduced ? 50 : 380)
      : options.reduced
        ? 180
        : before.current === 0
          ? 500
          : 850,
    departureHoldMs,
    feedback: boardFeedback(before, action, after, slots),
  };
}

export function dealTransition(
  state: State,
  eventLimit: number,
  options: TransitionOptions,
): ActionTransition {
  return {
    kind: "deal",
    eventLimit,
    before: state,
    marketSlots: initialMarketSlots(),
    action: {
      actor: 0,
      type: "take",
      incoming: [],
      outgoing: [],
      coins: [],
      bonus: null,
    },
    flights: options.mobile ? [] : dealFlights(state),
    duration: options.mobile ? 350 : options.reduced ? 500 : 2700,
    departureHoldMs: 0,
    caption: "正在发牌：牌堆 → 双方手牌…",
  };
}

// A replay step reads the saved prefix; it never changes the live match or save.
export function replayTransition(
  save: Save,
  index: number,
  options: TransitionOptions,
): ActionTransition | null {
  if (!Number.isInteger(index) || index < 0 || index >= save.events.length)
    return null;
  const before = replay(save, index);
  const event = save.events[index];
  const after = advance(before, event);
  const transition =
    event.type === "next"
      ? dealTransition(after, index + 1, options)
      : actionTransition(
          before,
          event,
          after,
          marketSlotsAt(save, index),
          index,
          options,
        );
  return { ...transition, replayTarget: index + 1 };
}

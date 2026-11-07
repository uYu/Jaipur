import type { Action, Save, State } from "./types.ts";
import { boardFeedback } from "./action-feedback.ts";
import type { BoardFeedback } from "./action-feedback.ts";
import { presentAction } from "./presentation.ts";
import type { Presentation } from "./presentation.ts";
import { actionFlights, dealFlights } from "./flights.ts";
import type { Flight } from "./flights.ts";
import { handLayoutFlights } from "./hand-layout.ts";
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

function mobileFlights(
  action: Action,
  flights: Flight[],
  actor: number,
  reduced: boolean,
): Pick<ActionTransition, "flights" | "duration" | "departureHoldMs"> {
  if (action.type === "sell") {
    const departureHoldMs = reduced ? 400 : 500;
    const cards = flights.filter((flight) => flight.to === "sale");
    const layout = flights.filter((flight) => flight.layout);
    const income = flights.filter((flight) => flight.coin !== undefined);
    const cardTravel = reduced ? 150 : 1050;
    const cardStagger = reduced ? 0 : 90;
    const cardsEnd =
      departureHoldMs + cardTravel + (cards.length - 1) * cardStagger;
    const incomeStart = cardsEnd + (reduced ? 100 : 150);
    const incomeTravel = reduced ? 180 : 650;
    const incomeStagger = reduced ? 0 : 110;
    const duration = Math.max(
      income.length
        ? incomeStart +
            incomeTravel +
            (income.length - 1) * incomeStagger +
            (reduced ? 200 : 220)
        : cardsEnd + (reduced ? 200 : 250),
      layout.length ? cardsEnd + (reduced ? 220 : 700) : 0,
    );
    return {
      departureHoldMs,
      duration,
      flights: [
        ...cards.map((flight, index) => ({
          ...flight,
          start: (departureHoldMs + index * cardStagger) / duration,
          end: (departureHoldMs + index * cardStagger + cardTravel) / duration,
        })),
        ...layout.map((flight) => ({
          ...flight,
          start: (cardsEnd + (reduced ? 0 : 60)) / duration,
          end: (cardsEnd + (reduced ? 120 : 580)) / duration,
        })),
        ...income.map((flight, index) => ({
          ...flight,
          start: (incomeStart + index * incomeStagger) / duration,
          end: (incomeStart + index * incomeStagger + incomeTravel) / duration,
        })),
      ],
    };
  }

  // An opponent's choice stays on the market long enough to identify it.
  // Payment leads; receiving follows without a stop between the two streams.
  const departureHoldMs = actor === 1 ? 1200 : reduced ? 450 : 500;
  if (action.type === "exchange") {
    const incoming = flights.filter((flight) =>
      flight.from.startsWith("market-"),
    );
    const outgoing = flights.filter((flight) =>
      flight.to.startsWith("market-"),
    );
    const stagger = reduced ? 0 : 40;
    const outgoingTravel = reduced ? 200 : 900;
    const incomingTravel = reduced ? 200 : 900;
    const incomingStart = departureHoldMs + (reduced ? 100 : 240);
    const duration =
      Math.max(
        departureHoldMs + outgoingTravel + (outgoing.length - 1) * stagger,
        incomingStart + incomingTravel + (incoming.length - 1) * stagger,
      ) + (reduced ? 180 : 200);
    const phase = (items: Flight[], start: number, travel: number) =>
      items.map((flight, index) => ({
        ...flight,
        start: (start + index * stagger) / duration,
        end: (start + index * stagger + travel) / duration,
      }));
    return {
      departureHoldMs,
      duration,
      flights: [
        ...phase(outgoing, departureHoldMs, outgoingTravel),
        ...flights
          .filter((flight) => flight.layout)
          .map((flight) => ({
            ...flight,
            start: incomingStart / duration,
            end: (incomingStart + incomingTravel) / duration,
          })),
        ...phase(incoming, incomingStart, incomingTravel),
      ],
    };
  }
  const stagger = reduced ? 0 : 60;
  const travel = reduced ? 150 : 1000;
  const departures = flights.filter(
    (flight) => flight.from !== "deck" && !flight.layout,
  );
  const layout = flights.filter((flight) => flight.layout);
  const refills = flights.filter((flight) => flight.from === "deck");
  const departureEnd =
    departureHoldMs + travel + (departures.length - 1) * stagger;
  const refillStart = departureEnd + (reduced ? 140 : 120);
  const refillTravel = reduced ? 180 : 900;
  const duration =
    (refills.length
      ? refillStart + refillTravel + (refills.length - 1) * stagger
      : departureEnd) + (reduced ? 200 : 160);
  return {
    departureHoldMs,
    duration,
    flights: [
      ...departures.map((flight, index) => ({
        ...flight,
        start: (departureHoldMs + index * stagger) / duration,
        end: (departureHoldMs + index * stagger + travel) / duration,
      })),
      ...layout.map((flight) => ({
        ...flight,
        start: departureHoldMs / duration,
        end: (departureHoldMs + travel) / duration,
      })),
      ...refills.map((flight, index) => ({
        ...flight,
        hideSource: false,
        hideTarget: false,
        start: (refillStart + index * stagger) / duration,
        end: (refillStart + index * stagger + refillTravel) / duration,
      })),
    ],
  };
}

export function actionTransition(
  before: State,
  action: Action,
  after: State,
  slots: number[],
  eventLimit: number,
  options: TransitionOptions,
): ActionTransition {
  const feedback = boardFeedback(before, action, after, slots);
  const presentation = presentAction(
    before,
    action,
    after,
    options.revealOpponent,
  );
  const flights = settlementFlights(before, action, after, slots);
  if (options.mobile)
    flights.push(
      ...handLayoutFlights(before, after, { action: presentation, feedback }),
    );
  if (options.mobile && (action.type === "take" || action.type === "camels"))
    flights.push(
      ...actionFlights(before, action, after, slots).filter(
        (flight) => flight.from === "deck",
      ),
    );
  if (options.mobile && action.type === "sell")
    flights.push(
      ...actionFlights(before, action, after, slots)
        .filter((flight) => flight.coin !== undefined)
        .map((flight) => ({
          ...flight,
          from: flight.coinGood
            ? `stock-${action.good}`
            : `bonus-face-${Math.min(action.count, 5)}`,
          to: `money-${before.current}`,
          hideSource: false,
          hideTarget: false,
          coin:
            !flight.coinGood && options.revealOpponent
              ? after.players[before.current].bonuses.at(-1)!
              : flight.coin,
        })),
    );
  const motion = options.mobile
    ? mobileFlights(action, flights, before.current, options.reduced)
    : {
        flights,
        duration: options.reduced ? 180 : before.current === 0 ? 500 : 850,
        departureHoldMs: 0,
      };
  return {
    kind: "action",
    eventLimit,
    before,
    marketSlots: slots,
    action: presentation,
    ...motion,
    feedback,
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

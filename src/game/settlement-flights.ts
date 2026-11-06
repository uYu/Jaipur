import type { Action, State } from "./types.ts";
import { actionFlights } from "./flights.ts";
import type { Flight } from "./flights.ts";
import { initialMarketSlots } from "./market-layout.ts";

// Keep the transaction visible without animating hand sorting, refills or money.
export function settlementFlights(
  before: State,
  action: Action,
  after: State,
  slots = initialMarketSlots(),
): Flight[] {
  const flights = actionFlights(before, action, after, slots).filter(
    (flight) => {
      if (flight.coin !== undefined || flight.from === "deck") return false;
      if (action.type === "sell") return flight.to === "sale";
      if (action.type === "exchange")
        return (
          flight.from.startsWith("market-") || flight.to.startsWith("market-")
        );
      return flight.from.startsWith("market-");
    },
  );
  if (action.type !== "exchange") return flights;

  const incoming = flights.filter((flight) =>
    flight.from.startsWith("market-"),
  );
  const outgoing = flights.filter((flight) => flight.to.startsWith("market-"));
  return [
    ...incoming.map((flight, index) => {
      const stagger = incoming.length > 1 ? index / (incoming.length - 1) : 0;
      return {
        ...flight,
        start: stagger * 0.1,
        end: Math.min(0.42, 0.32 + stagger * 0.1),
      };
    }),
    ...outgoing.map((flight, index) => {
      const stagger = outgoing.length > 1 ? index / (outgoing.length - 1) : 0;
      return {
        ...flight,
        start: 0.5 + stagger * 0.08,
        end: Math.min(0.9, 0.82 + stagger * 0.08),
      };
    }),
  ];
}

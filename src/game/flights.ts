import type { Action, Card, State } from "./types.ts";
export type Flight = {
  from: string;
  to: string;
  good?: Card;
  coin?: number | "?";
  coinGood?: Card;
  start: number;
  end: number;
  fromBack?: boolean;
  toBack?: boolean;
  hideSource?: boolean;
  hideTarget?: boolean;
  slot?: number;
};
export function actionFlights(
  before: State,
  action: Action,
  after: State,
): Flight[] {
  const actor = before.current,
    p = before.players[actor],
    flights: Flight[] = [];
  const hand = (i: number) => (actor === 0 ? `hand-${i}` : "opponent-hand");
  const destination = actor === 0 ? "your-hand" : "opponent-hand";
  const herd = actor === 0 ? "your-herd" : "opponent-herd";
  const surrendered =
    action.type === "exchange"
      ? action.hand
      : action.type === "sell"
        ? p.hand
            .flatMap((c, i) => (c === action.good ? [i] : []))
            .slice(0, action.count)
        : [];
  if (actor === 0 && surrendered.length)
    p.hand
      .flatMap((_, i) => (surrendered.includes(i) ? [] : [i]))
      .forEach((i, j) =>
        flights.push({
          from: hand(i),
          to: "your-hand",
          good: p.hand[i],
          slot: j,
          start: 0,
          end: 0.7,
          hideSource: true,
        }),
      );
  let taken: number[] = [];
  if (action.type === "take") taken = [action.index];
  if (action.type === "camels")
    taken = before.market.flatMap((c, i) => (c === "camel" ? [i] : []));
  if (action.type === "exchange") taken = action.market;
  taken.forEach((i, j) =>
    flights.push({
      from: `market-${i}`,
      to: action.type === "camels" ? herd : destination,
      good: before.market[i],
      start: j * 0.035,
      end: 0.5 + j * 0.035,
      hideSource: true,
      toBack: actor === 1,
      slot:
        actor === 0 && action.type !== "camels"
          ? p.hand.length - surrendered.length + j
          : j,
    }),
  );
  if (action.type === "sell") {
    const sold = p.hand
      .flatMap((c, i) => (c === action.good ? [i] : []))
      .slice(0, action.count);
    sold.forEach((i, j) =>
      flights.push({
        from: hand(i),
        to: "sale",
        good: action.good,
        start: j * 0.025,
        end: 0.48 + j * 0.025,
        fromBack: actor === 1,
        hideSource: actor === 0,
        slot: j,
      }),
    );
    const coins = after.players[actor].goods.slice(p.goods.length);
    coins.forEach((coin, i) =>
      flights.push({
        from: `token-${action.good}-${i}`,
        to: `payment-${actor}-${i}`,
        coinGood: action.good,
        hideSource: true,
        hideTarget: true,
        coin,
        start: 0.4 + i * 0.025,
        end: 0.7 + i * 0.015,
        slot: i,
      }),
    );
    if (after.players[actor].bonuses.length > p.bonuses.length)
      flights.push({
        from: `bonus-${Math.min(action.count, 5)}`,
        to: `payment-${actor}-${coins.length}`,
        hideTarget: true,
        coin: actor === 0 ? after.players[actor].bonuses.at(-1)! : "?",
        start: 0.53,
        end: 0.82,
      });
    return flights;
  }
  const retained = before.market.flatMap((_, i) =>
    taken.includes(i) ? [] : [i],
  );
  retained.forEach((i, j) =>
    flights.push({
      from: `market-${i}`,
      to: `market-${j}`,
      good: before.market[i],
      start: 0,
      end: 0.65,
      hideSource: true,
    }),
  );
  if (action.type === "exchange") {
    const outgoing = [
      ...action.hand.map((i) => ({
        from: hand(i),
        good: p.hand[i],
        hideSource: actor === 0,
        fromBack: actor === 1,
      })),
      ...Array.from({ length: action.camels }, () => ({
        from: herd,
        good: "camel" as const,
        hideSource: false,
        fromBack: actor === 1,
      })),
    ];
    outgoing.forEach((card, j) =>
      flights.push({
        ...card,
        to: `market-${retained.length + j}`,
        start: 0.12 + j * 0.025,
        end: 0.78 + j * 0.025,
      }),
    );
  } else {
    after.market.slice(retained.length).forEach((good, j) =>
      flights.push({
        from: "deck",
        to: `market-${retained.length + j}`,
        good,
        fromBack: true,
        start: 0.5 + j * 0.04,
        end: 0.83 + j * 0.025,
      }),
    );
  }
  return flights;
}

export function dealFlights(state: State): Flight[] {
  return [
    ...state.players[0].hand.map((good, i) => ({
      from: "deck",
      to: `hand-${i}`,
      good,
      fromBack: true,
      hideTarget: true,
      start: i * 0.08,
      end: 0.45 + i * 0.08,
    })),
    ...Array.from({ length: state.players[1].hand.length }, (_, i) => ({
      from: "deck",
      to: "opponent-hand",
      good: "camel" as const,
      fromBack: true,
      toBack: true,
      hideTarget: true,
      start: 0.04 + i * 0.08,
      end: 0.49 + i * 0.08,
      slot: i,
    })),
    ...Array.from({ length: state.players[0].camels }, (_, i) => ({
      from: "deck",
      to: "your-herd",
      good: "camel" as const,
      fromBack: true,
      start: 0.08 + i * 0.08,
      end: 0.53 + i * 0.08,
      slot: i,
    })),
  ];
}

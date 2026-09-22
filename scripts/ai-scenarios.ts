import { newGame } from "../src/game/engine.ts";
import { makeDeck } from "../src/game/data.ts";
import type { Card, Good } from "../src/game/types.ts";

export function collectionScenario(hand: Good[], market: Card[], camels = 2) {
  const s = newGame(55);
  s.current = 0;
  s.players[0] = { hand, camels, goods: [], bonuses: [] };
  s.players[1] = {
    hand: ["diamond", "gold", "cloth", "spice"],
    camels: 1,
    goods: [],
    bonuses: [],
  };
  s.market = market;
  s.deck = makeDeck();
  for (const card of [
    ...s.market,
    ...s.players.flatMap((p) => [
      ...p.hand,
      ...Array<Card>(p.camels).fill("camel"),
    ]),
  ]) {
    const i = s.deck.indexOf(card);
    if (i < 0) throw new Error("Scenario exceeds card inventory");
    s.deck.splice(i, 1);
  }
  return s;
}

export const aiScenarios = [
  {
    name: "three-leather-two-visible",
    state: collectionScenario(
      ["leather", "leather", "leather"],
      ["leather", "leather", "camel", "cloth", "spice"],
    ),
  },
  {
    name: "four-leather-fifth-visible",
    state: collectionScenario(
      ["leather", "leather", "leather", "leather"],
      ["leather", "camel", "camel", "cloth", "spice"],
    ),
  },
  {
    name: "two-silver-two-visible",
    state: collectionScenario(
      ["silver", "silver"],
      ["silver", "silver", "camel", "cloth", "spice"],
    ),
  },
];

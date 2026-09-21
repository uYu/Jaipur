import type { Action, Card, State } from "./types.ts";
import { sum } from "./data.ts";
export type Presentation = {
  actor: number;
  type: Action["type"];
  incoming: Card[];
  outgoing: Card[];
  coins: number[];
  bonus: number | "hidden" | null;
};
// Project only publicly revealed cards. Never pass the opponent's remaining hand or bonus value.
export function presentAction(
  before: State,
  action: Action,
  after: State,
): Presentation {
  const actor = before.current,
    player = before.players[actor];
  const result: Presentation = {
    actor,
    type: action.type,
    incoming: [],
    outgoing: [],
    coins: [],
    bonus: null,
  };
  if (action.type === "take") result.incoming = [before.market[action.index]];
  if (action.type === "camels")
    result.incoming = before.market.filter((c) => c === "camel");
  if (action.type === "exchange") {
    result.incoming = action.market.map((i) => before.market[i]);
    result.outgoing = [
      ...action.hand.map((i) => player.hand[i]),
      ...Array<Card>(action.camels).fill("camel"),
    ];
  }
  if (action.type === "sell") {
    result.outgoing = Array<Card>(action.count).fill(action.good);
    result.coins = after.players[actor].goods.slice(player.goods.length);
    if (after.players[actor].bonuses.length > player.bonuses.length)
      result.bonus =
        actor === 0 ? after.players[actor].bonuses.at(-1)! : "hidden";
  }
  return result;
}
export function saleCaption(p: Presentation): string {
  return `货物 +${sum(p.coins)} 卢比${p.bonus === null ? "" : p.bonus === "hidden" ? " · 奖励 +1 枚（面值保密）" : ` · 奖励 +${p.bonus} 卢比`}`;
}

import type { Action, Card, State } from "./types.ts";
import { LABEL, sum } from "./data.ts";
export type Presentation = {
  actor: number;
  type: Action["type"];
  incoming: Card[];
  outgoing: Card[];
  coins: number[];
  bonus: number | "hidden" | null;
};
// Live projections hide opponent rewards; replay can explicitly reveal their faces.
// The opponent's remaining hand is never part of this projection.
export function presentAction(
  before: State,
  action: Action,
  after: State,
  revealOpponent = false,
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
        actor === 0 || revealOpponent
          ? after.players[actor].bonuses.at(-1)!
          : "hidden";
  }
  return result;
}
export function saleCaption(p: Presentation): string {
  return `货物 +${sum(p.coins)} 卢比${p.bonus === null ? "" : p.bonus === "hidden" ? " · 奖励 +1 枚（面值保密）" : ` · 奖励 +${p.bonus} 卢比`}`;
}

export function actionCaption(p: Presentation): string {
  const describe = (cards: Card[]) =>
    [...new Set(cards)]
      .map((good) => `${LABEL[good]}×${cards.filter((c) => c === good).length}`)
      .join("、");
  if (p.type === "take") return `拿取 ${describe(p.incoming)}`;
  if (p.type === "camels") return `收下 ${p.incoming.length} 头骆驼`;
  if (p.type === "exchange")
    return `用 ${describe(p.outgoing)} 换入 ${describe(p.incoming)}`;
  return `卖出 ${describe(p.outgoing)} · 收入 ${sum(p.coins)} 卢比${p.bonus === null ? "" : ` · ${Math.min(p.outgoing.length, 5)} 张奖励`}`;
}

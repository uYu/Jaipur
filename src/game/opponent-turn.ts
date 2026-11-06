import { sum } from "./data.ts";
import { newGame } from "./engine.ts";
import {
  initialMarketSlots,
  nextMarketSlots,
  takenMarketIndices,
} from "./market-layout.ts";
import { presentAction, type Presentation } from "./presentation.ts";
import { advance } from "./storage.ts";
import type { Action, Card, Save, State } from "./types.ts";

type PublicCountChange = { before: number; after: number };

// This is a public projection, never a retained engine state. In particular,
// neither the opponent's remaining cards, herd size nor bonus faces belong here.
export type OpponentTurnDetails = {
  round: number;
  turn: number;
  action: Presentation & { actor: 1 };
  handCount: PublicCountChange;
  goodsTokenCount: PublicCountChange;
  goodsScore: PublicCountChange;
  bonusCount: PublicCountChange;
  market: {
    before: Card[];
    after: Card[];
    removed: Card[];
    added: Card[];
    beforeSlots: number[];
    afterSlots: number[];
    removedSlots: number[];
    addedSlots: number[];
  };
};

export function presentOpponentTurn(
  before: State,
  action: Action,
  after: State,
  slots = initialMarketSlots(),
): OpponentTurnDetails {
  if (before.current !== 1) throw new Error("对手行动详情只能展示米拉的行动");

  const player = before.players[1];
  const nextPlayer = after.players[1];
  const taken = takenMarketIndices(before, action);
  // The engine retains untouched market cards first, then appends either the
  // actual deck refill or the exchange payment. Equal goods must not be diffed
  // by value: a replacement can have the same face as the card just taken.
  const retainedCount = before.market.length - taken.length;
  const afterSlots = nextMarketSlots(before, action, after, slots);
  const presentation = presentAction(before, action, after);

  return {
    round: before.round,
    turn: before.turn + 1,
    action: { ...presentation, actor: 1 },
    handCount: { before: player.hand.length, after: nextPlayer.hand.length },
    goodsTokenCount: {
      before: player.goods.length,
      after: nextPlayer.goods.length,
    },
    goodsScore: { before: sum(player.goods), after: sum(nextPlayer.goods) },
    bonusCount: {
      before: player.bonuses.length,
      after: nextPlayer.bonuses.length,
    },
    market: {
      before: [...before.market],
      after: [...after.market],
      removed: taken.map((index) => before.market[index]),
      added: after.market.slice(retainedCount),
      beforeSlots: [...slots],
      afterSlots,
      removedSlots: taken.map((index) => slots[index]),
      addedSlots: afterSlots.slice(retainedCount),
    },
  };
}

export function lastOpponentTurn(
  save: Save | null,
  limit = save?.events.length ?? 0,
): OpponentTurnDetails | null {
  if (!save) return null;
  let state = newGame(save.seed, save.targetSeals ?? 2);
  let slots = initialMarketSlots();
  let latest: OpponentTurnDetails | null = null;

  // Only replay the visible prefix, including while a newer action is being
  // animated. A player's own turn leaves the opponent's last transaction up.
  for (const event of save.events.slice(0, Math.max(0, limit))) {
    const next = advance(state, event);
    if (event.type === "next") {
      latest = null;
      slots = initialMarketSlots();
    } else {
      if (state.current === 1)
        latest = presentOpponentTurn(state, event, next, slots);
      slots = nextMarketSlots(state, event, next, slots);
    }
    state = next;
  }
  return latest;
}

// Restore the same physical market positions for live saves, pending actions
// and replay. Engine array indices alone describe transaction order, not slots.
export function marketSlotsAt(
  save: Save | null,
  limit = save?.events.length ?? 0,
): number[] {
  let slots = initialMarketSlots();
  if (!save) return slots;
  let state = newGame(save.seed, save.targetSeals ?? 2);
  for (const event of save.events.slice(0, Math.max(0, limit))) {
    const next = advance(state, event);
    slots =
      event.type === "next"
        ? initialMarketSlots()
        : nextMarketSlots(state, event, next, slots);
    state = next;
  }
  return slots;
}

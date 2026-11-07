import type { Good } from "./types.ts";
import type { ActionRecord } from "./receipts.ts";
import { sum } from "./data.ts";

export type OpponentMemory = {
  hand: Good[];
  camels: number;
  goods: number;
};

/** Remember only public actions. No concealed hand or bonus values are inputs. */
export function opponentMemory(
  history: readonly ActionRecord[],
  round: number,
  handCount: number,
): OpponentMemory {
  const hand: Good[] = [];
  let handChange = 0,
    camelChange = 0,
    goods = 0;
  for (const record of history) {
    if (record.round !== round || record.action.actor !== 1) continue;
    const { incoming, outgoing, coins } = record.action;
    for (const card of outgoing) {
      if (card === "camel") camelChange--;
      else {
        handChange--;
        const index = hand.indexOf(card);
        if (index !== -1) hand.splice(index, 1);
      }
    }
    for (const card of incoming) {
      if (card === "camel") camelChange++;
      else {
        handChange++;
        hand.push(card);
      }
    }
    goods += sum(coins);
  }
  // Five cards are dealt initially; the public hand count identifies how many
  // were camels. Subsequent camel transfers are public as well.
  const initialHandCount = handCount - handChange;
  return { hand, camels: 5 - initialHandCount + camelChange, goods };
}

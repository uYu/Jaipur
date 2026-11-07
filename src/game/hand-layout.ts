import type { State } from "./types.ts";
import type { Flight } from "./flights.ts";
import type { ActionTransition } from "./action-transition.ts";

/** Match surviving cards by their old slots, including duplicate goods. */
export function retainedHandSlots(
  transition: Pick<ActionTransition, "action" | "feedback">,
  actor: 0 | 1,
  count: number,
): number[] {
  const removed = new Set<number>();
  if (transition.action.actor === actor) {
    if (actor === 0) {
      for (const departure of transition.feedback?.departures ?? []) {
        const match = /^hand-(\d+)$/.exec(departure.anchor);
        if (match) removed.add(Number(match[1]));
      }
    } else {
      // The departure animation uses the first generic backs. Never inspect
      // concealed goods to identify an opponent's surviving cards.
      const paid = transition.action.outgoing.filter(
        (good) => good !== "camel",
      ).length;
      for (let index = 0; index < paid; index++) removed.add(index);
    }
  }
  return Array.from({ length: count }, (_, index) => index).filter(
    (index) => !removed.has(index),
  );
}

/** The same left-aligned, single-row geometry used by the real hand. */
export function handSlotOffset(
  width: number,
  cardWidth: number,
  count: number,
  slot: number,
  gap: number,
) {
  const overlap = Math.min(
    0,
    (width - count * cardWidth - (count - 1) * gap) / Math.max(1, count - 1),
  );
  return slot * (cardWidth + gap + overlap);
}

export function handLayoutFlights(
  before: State,
  after: State,
  transition: Pick<ActionTransition, "action" | "feedback">,
): Flight[] {
  const actor = transition.action.actor === 0 ? 0 : 1;
  const count = before.players[actor].hand.length;
  const nextCount = after.players[actor].hand.length;
  const retained = retainedHandSlots(transition, actor, count);
  return retained.flatMap((oldSlot, slot) => {
    // Up to five cards fit without overlap on supported portrait widths.
    if (
      oldSlot === slot &&
      (count === nextCount || Math.max(count, nextCount) < 6)
    )
      return [];
    return [
      {
        from: actor === 0 ? `hand-${oldSlot}` : `opponent-hand-${oldSlot}`,
        to: actor === 0 ? "your-hand" : "opponent-hand",
        good: actor === 0 ? before.players[0].hand[oldSlot] : "camel",
        fromBack: actor === 1,
        toBack: actor === 1,
        hideSource: true,
        layout: true,
        slot,
        handCount: nextCount,
        start: 0,
        end: 1,
      } as Flight,
    ];
  });
}

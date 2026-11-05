import type { Action, State } from "./types.ts";

// Engine indices follow transaction order; visual slots stay fixed on the table.
export const initialMarketSlots = () => [0, 1, 2, 3, 4];

export function takenMarketIndices(before: State, action: Action): number[] {
  if (action.type === "take") return [action.index];
  if (action.type === "exchange") return action.market;
  if (action.type === "camels")
    return before.market.flatMap((good, i) => (good === "camel" ? [i] : []));
  return [];
}

export function nextMarketSlots(
  before: State,
  action: Action,
  after: State,
  slots: number[],
): number[] {
  const taken = takenMarketIndices(before, action);
  const retained = slots.filter((_, i) => !taken.includes(i));
  const vacancies = taken.map((i) => slots[i]).sort((a, b) => a - b);
  return retained.concat(
    vacancies.slice(0, after.market.length - retained.length),
  );
}

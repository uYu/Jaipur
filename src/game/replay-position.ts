export type ReplayMoment = "before" | "after";

// The selected index names the action being reviewed (1-based); the board
// projects the boundary on either side of that action. Index 0 is the deal.
export function replayBoardIndex(
  selectedIndex: number,
  moment: ReplayMoment,
): number {
  return Math.max(0, selectedIndex - (moment === "before" ? 1 : 0));
}

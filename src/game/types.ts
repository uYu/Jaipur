export const GOODS = [
  "diamond",
  "gold",
  "silver",
  "cloth",
  "spice",
  "leather",
] as const;
export type Good = (typeof GOODS)[number];
export type Card = Good | "camel";
export type Difficulty = "easy" | "normal" | "hard";
export type Player = {
  hand: Good[];
  camels: number;
  goods: number[];
  bonuses: number[];
};
export type Action =
  | { type: "take"; index: number }
  | { type: "camels" }
  | { type: "sell"; good: Good; count: number }
  | { type: "exchange"; market: number[]; hand: number[]; camels: number };
export type RoundResult = {
  round: number;
  scores: [number, number];
  goods: [number, number];
  bonuses: [number, number];
  camel: number | null;
  winner: number | null;
  reason: string;
};
export type State = {
  seed: number;
  rng: number;
  round: number;
  turn: number;
  current: number;
  starter: number;
  players: [Player, Player];
  deck: Card[];
  market: Card[];
  discard: Good[];
  tokens: Record<Good, number[]>;
  bonus: Record<3 | 4 | 5, number[]>;
  seals: [number, number];
  results: RoundResult[];
  phase: "playing" | "roundEnd" | "finished";
  log: string[];
};
export type Event = Action | { type: "next" };
export type Save = {
  version: 1;
  seed: number;
  difficulty: Difficulty;
  events: Event[];
};

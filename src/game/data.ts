import { GOODS } from "./types.ts";
import type { Card, Good } from "./types.ts";
export const LABEL: Record<Card, string> = {
  diamond: "钻石",
  gold: "黄金",
  silver: "白银",
  cloth: "丝绸",
  spice: "香料",
  leather: "皮革",
  camel: "骆驼",
};
export const ENGLISH: Record<Card, string> = {
  diamond: "DIAMOND",
  gold: "GOLD",
  silver: "SILVER",
  cloth: "SILK",
  spice: "SPICE",
  leather: "LEATHER",
  camel: "CAMEL",
};
export const COUNTS: Record<Card, number> = {
  diamond: 6,
  gold: 6,
  silver: 6,
  cloth: 8,
  spice: 8,
  leather: 10,
  camel: 11,
};
export const TOKEN_VALUES: Record<Good, number[]> = {
  diamond: [7, 7, 5, 5, 5],
  gold: [6, 6, 5, 5, 5],
  silver: [5, 5, 5, 5, 5],
  cloth: [5, 3, 3, 2, 2, 1, 1],
  spice: [5, 3, 3, 2, 2, 1, 1],
  leather: [4, 3, 2, 1, 1, 1, 1, 1, 1],
};
export const BONUS_VALUES = {
  3: [1, 1, 2, 2, 2, 3, 3],
  4: [4, 4, 5, 5, 6, 6],
  5: [8, 8, 9, 10, 10],
};
export const precious = (g: Good) => ["diamond", "gold", "silver"].includes(g);
export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
export function random(seed: number): [number, number] {
  const next = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return [next / 4294967296, next];
}
export function shuffle<T>(values: T[], seed: number): [T[], number] {
  const a = [...values];
  for (let i = a.length - 1; i > 0; i--) {
    const [r, n] = random(seed);
    seed = n;
    const j = Math.floor(r * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return [a, seed];
}
export function makeDeck(): Card[] {
  return [...GOODS, "camel" as const].flatMap((g) =>
    Array<Card>(COUNTS[g]).fill(g),
  );
}

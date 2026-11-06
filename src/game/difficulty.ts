import type { Difficulty } from "./types.ts";

export const DIFFICULTY_NAME: Record<Difficulty, string> = {
  easy: "入门",
  normal: "中等",
  hard: "高难",
  experimental: "高难", // Older saves used this name for the model opponent.
};

export function parseDifficulty(value: unknown): Difficulty | null {
  if (value === "experimental") return "hard";
  return value === "easy" || value === "normal" || value === "hard"
    ? value
    : null;
}

export function opponentPolicy(difficulty: Difficulty) {
  return difficulty === "easy"
    ? "heuristic"
    : difficulty === "normal"
      ? "tactical"
      : "model";
}

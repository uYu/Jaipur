import type { Difficulty } from "./types.ts";
export type Preferences = { difficulty: Difficulty; speed: number };
export function readPreferences(): Preferences {
  try {
    const value = JSON.parse(
      localStorage.getItem("jaipur.preferences.v1") ?? "{}",
    );
    return {
      difficulty: ["easy", "normal", "hard"].includes(value.difficulty)
        ? value.difficulty
        : "normal",
      speed: [350, 1000, 2000].includes(value.speed) ? value.speed : 1000,
    };
  } catch {
    return { difficulty: "normal", speed: 1000 };
  }
}
export function writePreferences(preferences: Preferences) {
  try {
    localStorage.setItem("jaipur.preferences.v1", JSON.stringify(preferences));
  } catch {
    /* Gameplay remains available when browser storage is disabled. */
  }
}

import type { Difficulty, InformationMode } from "./types.ts";
import { parseDifficulty } from "./difficulty.ts";
export type Preferences = {
  difficulty: Difficulty;
  targetSeals: 1 | 2;
  informationMode: InformationMode;
};
export function readPreferences(): Preferences {
  try {
    const value = JSON.parse(
      localStorage.getItem("jaipur.preferences.v1") ?? "{}",
    );
    return {
      difficulty: parseDifficulty(value.difficulty) ?? "normal",
      targetSeals: value.targetSeals === 2 ? 2 : 1,
      informationMode:
        value.informationMode === "assisted" ? "assisted" : "standard",
    };
  } catch {
    return {
      difficulty: "normal",
      targetSeals: 1,
      informationMode: "standard",
    };
  }
}
export function writePreferences(preferences: Preferences) {
  try {
    localStorage.setItem(
      "jaipur.preferences.v1",
      JSON.stringify({
        ...preferences,
        difficulty: parseDifficulty(preferences.difficulty) ?? "normal",
      }),
    );
  } catch {
    /* Gameplay remains available when browser storage is disabled. */
  }
}

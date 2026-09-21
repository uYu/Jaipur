import type { Event, Save, State } from "./types.ts";
import { applyAction, newGame, nextRound } from "./engine.ts";
export const SAVE_KEY = "jaipur.save.v1";
export function advance(s: State, event: Event): State {
  return event.type === "next" ? nextRound(s) : applyAction(s, event);
}
export function replay(save: Save, end = save.events.length): State {
  return save.events.slice(0, end).reduce(advance, newGame(save.seed));
}
export function parseSave(text: string): Save {
  if (text.length > 2000000) throw new Error("存档文件过大");
  const value = JSON.parse(text);
  if (
    !value ||
    value.version !== 1 ||
    !Number.isInteger(value.seed) ||
    value.seed < 0 ||
    value.seed > 4294967295 ||
    !["easy", "normal", "hard"].includes(value.difficulty) ||
    !Array.isArray(value.events) ||
    value.events.length > 4000
  )
    throw new Error("存档格式或版本无效");
  const save: Save = {
    version: 1,
    seed: value.seed,
    difficulty: value.difficulty,
    events: value.events,
  };
  try {
    replay(save);
  } catch {
    throw new Error("存档包含不合法行动，原有进度已保留");
  }
  return save;
}
export function downloadSave(save: Save) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(save, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `jaipur-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

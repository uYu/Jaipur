import { chooseAction } from "./ai.ts";
import {
  chooseOriginalWasmAction,
  chooseWasmActionWithStats,
} from "./ai-wasm.ts";

self.onmessage = async (event) => {
  try {
    const started = performance.now();
    if (event.data.difficulty === "hard") {
      const decision = await chooseWasmActionWithStats(event.data.observation);
      self.postMessage({
        action: decision.action,
        algorithm: "ED-MCTS · C++/Wasm",
        stats: decision.stats,
      });
      return;
    }
    const action =
      event.data.difficulty === "normal"
        ? await chooseOriginalWasmAction(event.data.observation)
        : chooseAction(event.data.observation, "easy");
    self.postMessage({
      action,
      algorithm:
        event.data.difficulty === "normal"
          ? "战术穷举 · C++/Wasm"
          : "轻量启发式 · TypeScript",
      elapsedMs: Math.round(performance.now() - started),
    });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : "AI 计算失败",
    });
  }
};

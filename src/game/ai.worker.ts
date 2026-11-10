import { chooseAction } from "./ai.ts";
import { chooseOriginalWasmAction } from "./ai-wasm.ts";
import { chooseDouzeroAction, DEFAULT_DOUZERO_VERSION } from "./douzero-browser.ts";
import { opponentPolicy } from "./difficulty.ts";

self.onmessage = async (event) => {
  try {
    const started = performance.now();
    const policy = opponentPolicy(event.data.difficulty);
    if (policy === "model") {
      const action = await chooseDouzeroAction(
        event.data.observation,
        event.data.history,
      );
      self.postMessage({
        action,
        algorithm: `自博弈神经策略 · v${DEFAULT_DOUZERO_VERSION}`,
        elapsedMs: Math.round(performance.now() - started),
      });
      return;
    }
    const action =
      policy === "tactical"
        ? await chooseOriginalWasmAction(event.data.observation)
        : chooseAction(event.data.observation, "easy");
    self.postMessage({
      action,
      algorithm:
        policy === "tactical"
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

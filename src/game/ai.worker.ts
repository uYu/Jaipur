import { chooseAction } from "./ai.ts";
import { chooseOriginalWasmAction } from "./ai-wasm.ts";
import {
  chooseDouzeroAction,
  loadDouzeroNetwork,
  DEFAULT_DOUZERO_MODEL_NAME,
} from "./douzero-browser.ts";
import { opponentPolicy } from "./difficulty.ts";

self.onmessage = async (event) => {
  try {
    const requestId = event.data.requestId;
    const progress = (modelProgress: unknown) =>
      self.postMessage({ requestId, modelProgress });
    if (event.data.kind === "preload") {
      await loadDouzeroNetwork(progress);
      self.postMessage({ requestId, ready: true });
      return;
    }
    const started = performance.now();
    const policy = opponentPolicy(event.data.difficulty);
    if (policy === "model") {
      await loadDouzeroNetwork(progress);
      const action = await chooseDouzeroAction(
        event.data.observation,
        event.data.history,
      );
      self.postMessage({
        requestId,
        action,
        algorithm: `自博弈神经策略 · ${DEFAULT_DOUZERO_MODEL_NAME}`,
        elapsedMs: Math.round(performance.now() - started),
      });
      return;
    }
    const action =
      policy === "tactical"
        ? await chooseOriginalWasmAction(event.data.observation)
        : chooseAction(event.data.observation, "easy");
    self.postMessage({
      requestId,
      action,
      algorithm:
        policy === "tactical"
          ? "战术穷举 · C++/Wasm"
          : "轻量启发式 · TypeScript",
      elapsedMs: Math.round(performance.now() - started),
    });
  } catch (error) {
    self.postMessage({
      requestId: event.data.requestId,
      error: error instanceof Error ? error.message : "AI 计算失败",
    });
  }
};

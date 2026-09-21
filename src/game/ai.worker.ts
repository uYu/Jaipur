import { chooseAction } from "./ai.ts";
import { chooseWasmAction } from "./ai-wasm.ts";

self.onmessage = async (event) => {
  try {
    const action =
      event.data.difficulty === "hard"
        ? await chooseWasmAction(event.data.observation)
        : chooseAction(event.data.observation, event.data.difficulty);
    self.postMessage({
      action,
    });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : "AI 计算失败",
    });
  }
};

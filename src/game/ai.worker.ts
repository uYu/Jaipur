import { chooseAction } from "./ai.ts";
self.onmessage = (event) => {
  try {
    self.postMessage({
      action: chooseAction(event.data.observation, event.data.difficulty),
    });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : "AI 计算失败",
    });
  }
};

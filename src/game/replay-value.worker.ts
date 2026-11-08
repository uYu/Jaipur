import { loadDouzeroNetwork } from "./douzero-browser.ts";
import { replayValuePoints } from "./replay-value.ts";
import type { ReplayValuePoint } from "./replay-value.ts";
import type { Save } from "./types.ts";

self.onmessage = async (event: MessageEvent<Save>) => {
  try {
    const model = await loadDouzeroNetwork();
    const points: ReplayValuePoint[] = [];
    for (const point of replayValuePoints(event.data, model)) {
      points.push(point);
      if (point.index % 4 === 0 || point.index === event.data.events.length)
        self.postMessage({
          points,
          complete: point.index === event.data.events.length,
        });
    }
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : "模型分析失败",
    });
  }
};

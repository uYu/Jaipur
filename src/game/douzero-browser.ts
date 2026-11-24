import { loadCachedModel, type ModelLoadProgress } from "./model-cache.ts";
import type { Observation } from "./ai.ts";
import { dmcAction, dmcActions, dmcState } from "./dmc.ts";
import { DouzeroNetwork } from "./douzero-network.ts";
import { findEndgameWinningAction } from "./endgame.ts";

export const DEFAULT_DOUZERO_MODEL_NAME = "TF＋手牌 Top5平均";
export const DEFAULT_DOUZERO_VERSION = 241551;
export const DEFAULT_DOUZERO_MODEL_URL = new URL(
  "./models/history-transformer-hand-top5-average.bin",
  import.meta.url,
);

let network: Promise<DouzeroNetwork> | undefined;
let progress: ModelLoadProgress = { phase: "cache", loaded: 0 };
const listeners = new Set<(progress: ModelLoadProgress) => void>();
export function loadDouzeroNetwork(
  onProgress?: (progress: ModelLoadProgress) => void,
) {
  if (onProgress) {
    listeners.add(onProgress);
    onProgress(progress);
  }
  if (!network) {
    network = loadCachedModel(
      DEFAULT_DOUZERO_MODEL_URL.href,
      16 + 2302849 * 4,
      (bytes) => {
        const model = new DouzeroNetwork(bytes);
        if (model.version !== DEFAULT_DOUZERO_VERSION)
          throw Error("对手数据版本不匹配，请刷新重试");
        return model;
      },
      (next) => {
        progress = next;
        for (const listener of listeners) listener(next);
      },
    );
    network.catch(() => {
      network = undefined;
      progress = { phase: "cache", loaded: 0 };
    });
  }
  return network.finally(() => {
    if (onProgress) listeners.delete(onProgress);
  });
}

export async function chooseDouzeroAction(
  observation: Observation,
  history: number[][],
) {
  const win = findEndgameWinningAction(observation);
  if (win) return win;
  const model = await loadDouzeroNetwork();
  return scoreActions(model, observation, history);
}

export function chooseDouzeroActionFromModel(
  model: DouzeroNetwork,
  observation: Observation,
  history: number[][],
) {
  const win = findEndgameWinningAction(observation);
  if (win) return win;
  return scoreActions(model, observation, history);
}

function scoreActions(
  model: DouzeroNetwork,
  observation: Observation,
  history: number[][],
) {
  const actions = dmcActions(observation);
  const state = dmcState(observation, {
    ownSeals: 0,
    opponentSeals: 0,
    round: 0,
  });
  const scores = model.score(
    history,
    state,
    actions.map((action) => dmcAction(observation, action)),
  );
  let best = 0;
  for (let i = 1; i < scores.length; i++)
    if (scores[i] > scores[best]) best = i;
  return actions[best];
}

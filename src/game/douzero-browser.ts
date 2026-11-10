import type { Observation } from "./ai.ts";
import { dmcAction, dmcActions, dmcState } from "./dmc.ts";
import { DouzeroNetwork } from "./douzero-network.ts";
import { findEndgameWinningAction } from "./endgame.ts";

export const DEFAULT_DOUZERO_VERSION = 114824;
export const DEFAULT_DOUZERO_MODEL_URL = new URL(
  "./models/legacy-round-114824.bin",
  import.meta.url,
);

let network: Promise<DouzeroNetwork> | undefined;
export function loadDouzeroNetwork() {
  network ??= fetch(DEFAULT_DOUZERO_MODEL_URL).then(async (response) => {
    if (!response.ok) throw Error("高难对手加载失败，请重试");
    const model = new DouzeroNetwork(await response.arrayBuffer());
    if (model.version !== DEFAULT_DOUZERO_VERSION)
      throw Error("对手数据版本不匹配，请刷新重试");
    return model;
  });
  // A failed fetch can be retried from the replay analysis panel.
  network.catch(() => {
    network = undefined;
  });
  return network;
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

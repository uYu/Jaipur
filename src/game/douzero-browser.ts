import type { Observation } from "./ai.ts";
import { dmcAction, dmcActions, dmcState } from "./dmc.ts";
import { DouzeroNetwork } from "./douzero-network.ts";

let network: Promise<DouzeroNetwork> | undefined;
function loadNetwork() {
  network ??= fetch(new URL("./models/legacy-round-147126.bin", import.meta.url))
    .then(async (response) => {
      if (!response.ok) throw Error("高难对手加载失败，请重试");
      const model = new DouzeroNetwork(await response.arrayBuffer());
      if (model.version !== 147126) throw Error("对手数据版本不匹配，请刷新重试");
      return model;
    });
  return network;
}

export async function chooseDouzeroAction(observation: Observation, history: number[][]) {
  const model = await loadNetwork();
  return chooseDouzeroActionFromModel(model, observation, history);
}

export function chooseDouzeroActionFromModel(
  model: DouzeroNetwork,
  observation: Observation,
  history: number[][],
) {
  const actions = dmcActions(observation);
  const state = dmcState(observation, { ownSeals: 0, opponentSeals: 0, round: 0 });
  const scores = model.score(history, state, actions.map((action) => dmcAction(observation, action)));
  let best = 0;
  for (let i = 1; i < scores.length; i++)
    if (scores[i] > scores[best]) best = i;
  return actions[best];
}

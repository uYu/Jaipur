import { GOODS } from "./types.ts";
import type { Action, Good } from "./types.ts";
import type { Observation } from "./ai.ts";
import createJaipurAi from "./wasm/jaipur_ai.mjs";
import { MCTS_ITERATIONS_PER_TREE } from "./ai-config.ts";

type JaipurModule = {
  HEAP32: Int32Array;
  _malloc(bytes: number): number;
  _free(pointer: number): void;
  _jaipur_choose(
    input: number,
    length: number,
    output: number,
    iterationsPerTree: number,
  ): number;
  _jaipur_choose_original(
    input: number,
    length: number,
    output: number,
  ): number;
};

export type MctsStats = {
  trees: number;
  iterationsPerTree: number;
  simulations: number;
  rootActionFamilies: number;
  selectedVisitShare: number;
  exchangeCandidates: number;
  maxTreeDepth: number;
  terminalSimulations: number;
  truncatedSimulations: number;
  rolloutTurns: number;
  elapsedMs: number;
};

export type MctsDecision = { action: Action; stats: MctsStats };

const modulePromise = createJaipurAi() as Promise<JaipurModule>;
const goodIndex = (good: Good) => GOODS.indexOf(good);

export function encodeObservation(observation: Observation): Int32Array {
  const values: number[] = [0x4a4149, 1];
  for (const good of GOODS)
    values.push(observation.hand.filter((card) => card === good).length);
  values.push(
    observation.camels,
    observation.goods.length,
    observation.goods.reduce((total, value) => total + value, 0),
    observation.bonuses.length,
    ...observation.bonuses,
    observation.opponentGoods.length,
    observation.opponentGoods.reduce((total, value) => total + value, 0),
  );
  for (const good of GOODS)
    values.push(
      observation.knownOpponentHand.filter((card) => card === good).length,
    );
  values.push(
    ...observation.market.map((card) =>
      card === "camel" ? GOODS.length : goodIndex(card),
    ),
  );
  for (const good of GOODS)
    values.push(observation.tokens[good].length, ...observation.tokens[good]);
  values.push(
    observation.bonusCounts[3],
    observation.bonusCounts[4],
    observation.bonusCounts[5],
  );
  for (const good of GOODS)
    values.push(observation.discard.filter((card) => card === good).length);
  values.push(
    observation.deckCount,
    observation.opponentHandCount,
    observation.turn,
  );
  return Int32Array.from(values);
}

export function decodeAction(
  output: Int32Array,
  observation: Observation,
): Action {
  if (output[0] === 0) {
    const good = GOODS[output[1]];
    const index = observation.market.indexOf(good);
    if (index < 0) throw new Error("C++ AI 返回了市场中不存在的货物");
    return { type: "take", index };
  }
  if (output[0] === 1) return { type: "camels" };
  if (output[0] === 2)
    return { type: "sell", good: GOODS[output[1]], count: output[2] };
  if (output[0] !== 3) throw new Error("C++ AI 返回了未知行动");

  const market: number[] = [];
  const hand: number[] = [];
  const takeLeft = Array.from(output.slice(2, 8));
  const giveLeft = Array.from(output.slice(8, 14));
  observation.market.forEach((card, index) => {
    if (card === "camel") return;
    const good = goodIndex(card);
    if (takeLeft[good] > 0) {
      market.push(index);
      takeLeft[good]--;
    }
  });
  observation.hand.forEach((good, index) => {
    const goodIndexValue = goodIndex(good);
    if (giveLeft[goodIndexValue] > 0) {
      hand.push(index);
      giveLeft[goodIndexValue]--;
    }
  });
  return { type: "exchange", market, hand, camels: output[1] };
}

export async function chooseWasmAction(
  observation: Observation,
  iterationsPerTree = MCTS_ITERATIONS_PER_TREE,
): Promise<Action> {
  return (await chooseWasmActionWithStats(observation, iterationsPerTree))
    .action;
}

export async function chooseWasmActionWithStats(
  observation: Observation,
  iterationsPerTree = MCTS_ITERATIONS_PER_TREE,
): Promise<MctsDecision> {
  const module = await modulePromise;
  const encoded = encodeObservation(observation);
  const inputPointer = module._malloc(encoded.byteLength);
  const outputPointer = module._malloc(27 * Int32Array.BYTES_PER_ELEMENT);
  const started = performance.now();
  try {
    module.HEAP32.set(encoded, inputPointer / Int32Array.BYTES_PER_ELEMENT);
    if (
      !module._jaipur_choose(
        inputPointer,
        encoded.length,
        outputPointer,
        iterationsPerTree,
      )
    )
      throw new Error("C++ AI 无法解析当前局面");
    const output = module.HEAP32.slice(
      outputPointer / Int32Array.BYTES_PER_ELEMENT,
      outputPointer / Int32Array.BYTES_PER_ELEMENT + 27,
    );
    if (output[16] !== 0x4d435453)
      throw new Error("C++ AI 未返回 MCTS 搜索统计");
    return {
      action: decodeAction(output, observation),
      stats: {
        trees: output[17],
        iterationsPerTree: output[18],
        simulations: output[19],
        rootActionFamilies: output[20],
        selectedVisitShare: output[21] / 10000,
        exchangeCandidates: output[22],
        maxTreeDepth: output[23],
        terminalSimulations: output[24],
        truncatedSimulations: output[25],
        rolloutTurns: output[26],
        elapsedMs: Math.round(performance.now() - started),
      },
    };
  } finally {
    module._free(outputPointer);
    module._free(inputPointer);
  }
}

export async function chooseOriginalWasmAction(
  observation: Observation,
): Promise<Action> {
  const module = await modulePromise;
  const encoded = encodeObservation(observation);
  const inputPointer = module._malloc(encoded.byteLength);
  const outputPointer = module._malloc(16 * Int32Array.BYTES_PER_ELEMENT);
  try {
    module.HEAP32.set(encoded, inputPointer / Int32Array.BYTES_PER_ELEMENT);
    if (
      !module._jaipur_choose_original(
        inputPointer,
        encoded.length,
        outputPointer,
      )
    )
      throw new Error("C++ 原最高难度无法解析当前局面");
    const output = module.HEAP32.slice(
      outputPointer / Int32Array.BYTES_PER_ELEMENT,
      outputPointer / Int32Array.BYTES_PER_ELEMENT + 16,
    );
    return decodeAction(output, observation);
  } finally {
    module._free(outputPointer);
    module._free(inputPointer);
  }
}

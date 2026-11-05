// Inference for the fixed JaipurDouZero architecture, using FP32 row-major weights.
type LinearLayer = { weight: Float32Array; bias: Float32Array; width: number };

function linear(input: Float32Array, layer: LinearLayer, output: Float32Array) {
  for (let row = 0; row < layer.bias.length; row++) {
    let sum = layer.bias[row];
    const offset = row * layer.width;
    for (let column = 0; column < layer.width; column++)
      sum += layer.weight[offset + column] * input[column];
    output[row] = sum;
  }
}

export class DouzeroNetwork {
  readonly version: number;
  private readonly input: LinearLayer;
  private readonly recurrent: LinearLayer;
  private readonly layers: LinearLayer[];

  constructor(buffer: ArrayBuffer) {
    if (buffer.byteLength !== 16 + 1284097 * 4)
      throw Error("模型文件大小不匹配");
    const header = new DataView(buffer);
    if (header.getUint32(0, true) !== 0x4a445a52 ||
        header.getUint32(4, true) !== 1 ||
        header.getUint32(12, true) !== 1284097)
      throw Error("模型格式不匹配");
    this.version = header.getUint32(8, true);
    const weights = new Float32Array(buffer, 16);
    if (!weights.every(Number.isFinite)) throw Error("模型权重无效");
    let at = 0;
    const take = (length: number) => {
      const result = weights.subarray(at, at + length);
      at += length;
      return result;
    };
    const inputWeight = take(512 * 26);
    const recurrentWeight = take(512 * 128);
    this.input = { weight: inputWeight, bias: take(512), width: 26 };
    this.recurrent = { weight: recurrentWeight, bias: take(512), width: 128 };
    this.layers = [298, 512, 512, 512, 512, 512].map((width, index) => {
      const rows = index === 5 ? 1 : 512;
      return { weight: take(rows * width), bias: take(rows), width };
    });
    if (at !== weights.length) throw Error("模型参数数量不匹配");
  }

  score(history: number[][], state: number[], actions: number[][]): Float32Array {
    if (history.length !== 16 || history.some((row) => row.length !== 26) ||
        state.length !== 146 || !actions.length ||
        actions.some((row) => row.length !== 24) ||
        ![...history.flat(), ...state, ...actions.flat()].every(Number.isFinite))
      throw Error("实验模型输入无效");
    const hidden = new Float32Array(128);
    const cell = new Float32Array(128);
    const gates = new Float32Array(512);
    const recurrent = new Float32Array(512);
    const sigmoid = (value: number) => 1 / (1 + Math.exp(-value));
    for (const row of history) {
      linear(Float32Array.from(row), this.input, gates);
      linear(hidden, this.recurrent, recurrent);
      for (let i = 0; i < 128; i++) {
        const input = sigmoid(gates[i] + recurrent[i]);
        const forget = sigmoid(gates[128 + i] + recurrent[128 + i]);
        const candidate = Math.tanh(gates[256 + i] + recurrent[256 + i]);
        const output = sigmoid(gates[384 + i] + recurrent[384 + i]);
        cell[i] = forget * cell[i] + input * candidate;
        hidden[i] = output * Math.tanh(cell[i]);
      }
    }
    const context = Float32Array.from([...hidden, ...state]);
    const first = this.layers[0];
    const common = new Float32Array(512);
    for (let row = 0; row < 512; row++) {
      let sum = first.bias[row];
      for (let column = 0; column < 274; column++)
        sum += first.weight[row * 298 + column] * context[column];
      common[row] = sum;
    }
    const scores = new Float32Array(actions.length);
    let current = new Float32Array(512);
    let next = new Float32Array(512);
    const result = new Float32Array(1);
    for (let index = 0; index < actions.length; index++) {
      const action = Float32Array.from(actions[index]);
      for (let row = 0; row < 512; row++) {
        let sum = common[row];
        for (let column = 0; column < 24; column++)
          sum += first.weight[row * 298 + 274 + column] * action[column];
        current[row] = Math.max(0, sum);
      }
      for (let layer = 1; layer < 5; layer++) {
        linear(current, this.layers[layer], next);
        for (let i = 0; i < 512; i++) next[i] = Math.max(0, next[i]);
        [current, next] = [next, current];
      }
      linear(current, this.layers[5], result);
      scores[index] = result[0];
    }
    if (!scores.every(Number.isFinite)) throw Error("实验模型评分无效");
    return scores;
  }
}

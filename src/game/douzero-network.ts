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
  private readonly input!: LinearLayer;
  private readonly recurrent!: LinearLayer;
  private readonly transformer?: HistoryTransformer;
  private readonly layers: LinearLayer[];

  constructor(buffer: ArrayBuffer) {
    const header = new DataView(buffer);
    const format = header.getUint32(4, true);
    const count = format === 1 ? 1284097 : format === 2 ? 2302849 : 0;
    if (!count || buffer.byteLength !== 16 + count * 4 ||
        header.getUint32(0, true) !== 0x4a445a52 ||
        header.getUint32(12, true) !== count)
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
    if (format === 2) this.transformer = new HistoryTransformer(take);
    else {
      const inputWeight = take(512 * 26);
      const recurrentWeight = take(512 * 128);
      this.input = { weight: inputWeight, bias: take(512), width: 26 };
      this.recurrent = { weight: recurrentWeight, bias: take(512), width: 128 };
    }
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
    if (!this.transformer) for (const row of history) {
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
    const encoded = this.transformer ? this.transformer.encode(history) : hidden;
    const context = Float32Array.from([...encoded, ...state]);
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

// PyTorch TransformerEncoderLayer: post-LN, ReLU, eight attention heads.
class HistoryTransformer {
  private summary: Float32Array;
  private positions: Float32Array;
  private input: LinearLayer;
  private output: LinearLayer;
  private blocks: { qkv: LinearLayer; projection: LinearLayer; ff1: LinearLayer;
    ff2: LinearLayer; norm1: Float32Array[]; norm2: Float32Array[] }[];
  constructor(take: (n: number) => Float32Array) {
    const layer = (width: number, rows: number): LinearLayer =>
      ({ weight: take(width * rows), bias: take(rows), width });
    this.summary = take(256);
    this.positions = take(17 * 256);
    this.input = layer(26, 256);
    this.blocks = Array.from({ length: 2 }, () => ({
      qkv: layer(256, 768), projection: layer(256, 256),
      ff1: layer(256, 512), ff2: layer(512, 256),
      norm1: [take(256), take(256)], norm2: [take(256), take(256)],
    }));
    this.output = layer(256, 128);
  }
  encode(history: number[][]): Float32Array {
    const tokens = [this.summary.slice(), ...history.map(row => {
      const token = new Float32Array(256);
      linear(Float32Array.from(row), this.input, token);
      return token;
    })];
    tokens.forEach((token, t) => token.forEach((v, i) => {
      token[i] = v + this.positions[t * 256 + i];
    }));
    const visible = [true, ...history.map(row => row[0] !== 0 || row[1] !== 0)];
    const norm = (x: Float32Array, residual: Float32Array, params: Float32Array[]) => {
      for (let i = 0; i < 256; i++) x[i] += residual[i];
      const mean = x.reduce((a, b) => a + b, 0) / 256;
      const variance = x.reduce((a, b) => a + (b - mean) ** 2, 0) / 256;
      for (let i = 0; i < 256; i++)
        x[i] = (x[i] - mean) / Math.sqrt(variance + 1e-5) * params[0][i] + params[1][i];
    };
    for (const block of this.blocks) {
      const qkv = tokens.map(token => {
        const out = new Float32Array(768); linear(token, block.qkv, out); return out;
      });
      const next = tokens.map((token, t) => {
        const attended = new Float32Array(256);
        for (let head = 0; head < 8; head++) {
          const offset = head * 32;
          const logits = qkv.map((key, k) => {
            if (!visible[k]) return -Infinity;
            let dot = 0;
            for (let d = 0; d < 32; d++) dot += qkv[t][offset+d] * key[256+offset+d];
            return dot / Math.sqrt(32);
          });
          const max = Math.max(...logits);
          const probs = logits.map(v => Math.exp(v - max));
          const sum = probs.reduce((a,b) => a+b, 0);
          for (let d = 0; d < 32; d++) {
            let value = 0;
            for (let k = 0; k < 17; k++) value += probs[k] / sum * qkv[k][512+offset+d];
            attended[offset+d] = value;
          }
        }
        const projected = new Float32Array(256);
        linear(attended, block.projection, projected);
        norm(projected, token, block.norm1);
        const ff = new Float32Array(512);
        linear(projected, block.ff1, ff);
        for (let i = 0; i < 512; i++) ff[i] = Math.max(0, ff[i]);
        const out = new Float32Array(256);
        linear(ff, block.ff2, out);
        norm(out, projected, block.norm2);
        return out;
      });
      next.forEach((token, t) => { tokens[t] = token; });
    }
    const result = new Float32Array(128);
    linear(tokens[0], this.output, result);
    return result;
  }
}

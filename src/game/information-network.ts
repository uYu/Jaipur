import { dmcActions, dmcAction } from "./dmc.ts";
import { eventFeatures, stateFeatures } from "./information.ts";
import type { PlayerView, PublicEvent } from "./information.ts";
export type Weights = {
  format: string;
  weights: Record<string, number[] | number[][]>;
  gruSize: number;
};
export class InformationNetwork {
  private cache = new WeakMap<PublicEvent, Map<number, number[]>>();
  private model: Weights;
  constructor(model: Weights) {
    this.model = model;
    if (model.format !== "jaipur-information-v1")
      throw Error("Wrong network format");
  }
  linear(name: string, x: number[]): number[] {
    const w = this.model.weights[name + ".weight"] as number[][],
      b = this.model.weights[name + ".bias"] as number[];
    return w.map((row, i) => {
      let s = b[i];
      for (let j = 0; j < x.length; j++) s += row[j] * x[j];
      return s;
    });
  }
  private history(events: PublicEvent[], player: number): number[] {
    let h = Array<number>(this.model.gruSize).fill(0);
    const n = h.length,
      w = this.model.weights;
    const wi = w["history.weight_ih_l0"] as number[][],
      wh = w["history.weight_hh_l0"] as number[][],
      bi = w["history.bias_ih_l0"] as number[],
      bh = w["history.bias_hh_l0"] as number[];
    for (const e of events) {
      const cached = this.cache.get(e)?.get(player);
      if (cached) {
        h = cached;
        continue;
      }
      const x = eventFeatures(e, player),
        a = wi.map((row, i) => row.reduce((s, v, j) => s + v * x[j], bi[i])),
        b = wh.map((row, i) => row.reduce((s, v, j) => s + v * h[j], bh[i]));
      const next = h.map((old, i) => {
        const r = 1 / (1 + Math.exp(-a[i] - b[i])),
          z = 1 / (1 + Math.exp(-a[n + i] - b[n + i])),
          candidate = Math.tanh(a[2 * n + i] + r * b[2 * n + i]);
        return (1 - z) * candidate + z * old;
      });
      const item = this.cache.get(e) ?? new Map<number, number[]>();
      item.set(player, next);
      this.cache.set(e, item);
      h = next;
    }
    return h;
  }
  context(v: PlayerView): number[] {
    return this.linear("state", [
      ...stateFeatures(v),
      ...this.history(v.history, v.player),
    ]).map((x) => Math.max(0, x));
  }
  value(v: PlayerView): number {
    const c = this.context(v);
    return Math.tanh(
      this.linear(
        "value.2",
        this.linear("value.0", c).map((x) => Math.max(0, x)),
      )[0],
    );
  }
  predict(v: PlayerView, head: "policy" | "opponent" = "policy") {
    const context = this.context(v),
      actions = dmcActions(v.observation);
    const logits = actions.map((a) => {
      const encoded = this.linear("action", dmcAction(v.observation, a)).map(
        (x) => Math.max(0, x),
      );
      return this.linear(
        head + ".2",
        this.linear(head + ".0", [...context, ...encoded]).map((x) =>
          Math.max(0, x),
        ),
      )[0];
    });
    const max = Math.max(...logits),
      weights = logits.map((x) => Math.exp(x - max)),
      total = weights.reduce((a, b) => a + b, 0);
    const value = Math.tanh(
      this.linear(
        "value.2",
        this.linear("value.0", context).map((x) => Math.max(0, x)),
      )[0],
    );
    return {
      actions,
      logits,
      probabilities: weights.map((x) => x / total),
      value,
    };
  }
}

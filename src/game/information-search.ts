import { applyAction, nextRound, actionError } from "./engine.ts";
import type { Action, State } from "./types.ts";
import {
  playerView,
  publicEvent,
  sampleState,
  structuralBelief,
} from "./information.ts";
import type { PlayerView, PublicEvent } from "./information.ts";
import { InformationNetwork } from "./information-network.ts";
type Edge = {
  action: Action;
  prior: number;
  n: number;
  w: number;
  children: Map<string, Node>;
};
type Node = { n: number; value: number; edges: Edge[] };
export const observationKey = (events: PublicEvent[], v: PlayerView) =>
  JSON.stringify([
    events,
    v.observation,
    v.seals,
    v.starter,
    v.current,
    v.round,
  ]);
export function informationSearch(
  v: PlayerView,
  network: Pick<InformationNetwork, "predict" | "value">,
  options: {
    budgetMs: number;
    depth?: number;
    iterations?: number;
    random: () => number;
  },
) {
  const started = performance.now(),
    deadline = started + options.budgetMs,
    random = options.random,
    worlds = structuralBelief(v),
    initial = network.predict(v);
  const makeNode = (p: ReturnType<InformationNetwork["predict"]>): Node => ({
    n: 0,
    value: p.value,
    edges: p.actions.map((action, i) => ({
      action,
      prior: 0.98 * p.probabilities[i] + 0.02 / p.actions.length,
      n: 0,
      w: 0,
      children: new Map(),
    })),
  });
  const root = makeNode(initial),
    maxDepth = options.depth ?? 1;
  let completed = 0,
    discarded = 0,
    leaves = 0,
    opponentMoves = 0,
    terminals = 0,
    maxReached = 0;
  // One path collects root-perspective values; commit visits only after a complete simulation.
  let path: { node: Node; edge: Edge }[] = [];
  const simulate = (
    node: Node,
    state: State,
    history: PublicEvent[],
    depth: number,
  ): number | null => {
    if (performance.now() > deadline - 5) return null;
    maxReached = Math.max(maxReached, depth);
    let best = node.edges[0],
      score = -Infinity;
    for (const e of node.edges) {
      const q = e.n ? e.w / e.n : node.value;
      const s = q + (1.4 * e.prior * Math.sqrt(node.n + 1)) / (1 + e.n);
      if (s > score) {
        score = s;
        best = e;
      }
    }
    path.push({ node, edge: best });
    const error = actionError(state, best.action);
    if (error) throw Error("Information node illegal action: " + error);
    let next = applyAction(state, best.action),
      h = [...history, publicEvent(state, next, best.action)],
      newEvents = [h.at(-1)!];
    while (
      next.phase !== "finished" &&
      (next.phase === "roundEnd" || next.current !== v.player)
    ) {
      if (performance.now() > deadline - 5) return null;
      const before = next;
      if (next.phase === "roundEnd") {
        next = nextRound(next);
        const e = publicEvent(before, next, { type: "next" });
        h = [...h, e];
        newEvents.push(e);
      } else {
        const p = network.predict(
          playerView(next, next.current, h),
          "opponent",
        );
        let u = random(),
          i = p.actions.length - 1;
        for (let j = 0; j < p.actions.length; j++) {
          u -= p.probabilities[j];
          if (u <= 0) {
            i = j;
            break;
          }
        }
        next = applyAction(next, p.actions[i]);
        const e = publicEvent(before, next, p.actions[i]);
        h = [...h, e];
        newEvents.push(e);
        opponentMoves++;
      }
    }
    let result: number;
    if (next.phase === "finished") {
      result = next.seals[v.player] >= 2 ? 1 : -1;
      terminals++;
    } else {
      const view = playerView(next, v.player, h);
      if (depth + 1 >= maxDepth) {
        result = network.value(view);
        leaves++;
      } else {
        const key = observationKey(newEvents, view);
        let child = best.children.get(key);
        if (!child) {
          const p = network.predict(view);
          child = makeNode(p);
          best.children.set(key, child);
          result = p.value;
          leaves++;
        } else {
          const r = simulate(child, next, h, depth + 1);
          if (r === null) return null;
          result = r;
        }
      }
    }
    if (performance.now() > deadline) return null;
    return result;
  };
  while (
    (options.iterations === undefined || completed < options.iterations) &&
    performance.now() < deadline - 10
  ) {
    path = [];
    const s = sampleState(v, worlds, random);
    const result = simulate(root, s, v.history, 0);
    if (result === null) {
      discarded++;
      break;
    }
    for (const { node, edge } of path) {
      node.n++;
      edge.n++;
      edge.w += result;
    }
    completed++;
  }
  const selected = completed
    ? root.edges.reduce((a, b) =>
        b.n > a.n ||
        (b.n === a.n && b.w / Math.max(1, b.n) > a.w / Math.max(1, a.n))
          ? b
          : a,
      )
    : root.edges.reduce((a, b) => (b.prior > a.prior ? b : a));
  return {
    action: selected.action,
    stats: {
      elapsedMs: performance.now() - started,
      rootValue: selected.n ? selected.w / selected.n : initial.value,
      completed,
      discarded,
      leaves,
      opponentMoves,
      terminals,
      maxDepth: maxReached + 1,
      worlds: worlds.length,
      fallback: completed === 0,
      unvisited: root.edges.filter((e) => !e.n).length,
      actions: root.edges.length,
    },
    policy: root.edges.map((e) => e.n / Math.max(1, completed)),
  };
}

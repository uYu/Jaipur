import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { dmcClient } from "./dmc-client.ts";
import { dmcActions, dmcState, dmcAction } from "../src/game/dmc.ts";
import type { MatchContext } from "../src/game/dmc.ts";
import type { Observation } from "../src/game/ai.ts";
import { encodeObservation, decodeAction } from "../src/game/ai-wasm.ts";

export function dmcMctsClient(
  binary: string,
  mix: number,
  fixedIterations = 0,
  architecture: "mlp" | "douzero" = "mlp",
  fullSaleRoot = false,
) {
  const checkpoint = architecture === "douzero"
    ? process.env.JAIPUR_DOUZERO_CHECKPOINT
    : process.env.JAIPUR_DMC_CHECKPOINT;
  if (!checkpoint) throw Error(`Set ${architecture === "douzero" ? "JAIPUR_DOUZERO_CHECKPOINT" : "JAIPUR_DMC_CHECKPOINT"}`);
  const network = architecture === "douzero"
    ? dmcClient(join(tmpdir(), "jaipur-douzero-hybrid"), checkpoint,
                "scripts/douzero-learner.py", ["--device", "cpu", "--scorer-only",
                  ...(process.env.JAIPUR_DOUZERO_FULL_SALE_ONLY === "1"
                    ? ["--full-sale-only"] : [])])
    : dmcClient(join(tmpdir(), "jaipur-dmc-hybrid"), checkpoint);
  const native = spawn(
    binary,
    ["search-dmc", "1.4142135623730951", "0", "8", "1", "0", "1",
      ...Array(8).fill("0"), fullSaleRoot ? "1" : "0"],
    { stdio: ["pipe", "pipe", "inherit"] },
  );
  let pending:
    { resolve: (r: any) => void; reject: (e: Error) => void } | undefined;
  let failure: Error | undefined;
  const fail = (e: Error) => {
    failure = e;
    pending?.reject(e);
  };
  native.on("error", fail);
  native.on("exit", (code) => fail(Error(`DMC MCTS worker exited ${code}`)));
  native.stdin.on("error", fail);
  createInterface({ input: native.stdout }).on("line", (line) => {
    const p = pending;
    pending = undefined;
    try {
      p?.resolve(JSON.parse(line));
    } catch (e) {
      p?.reject(e as Error);
    }
  });
  return {
    ready: network.call({ op: "ready" }),
    async choose(o: Observation, remainingMs: number, context: MatchContext,
                 history?: number[][]) {
      if (architecture === "douzero" && !history)
        throw Error("DouZero root prior requires public move history");
      const start = performance.now();
      const actions = dmcActions(o, fullSaleRoot),
        features = actions.map((a) => dmcAction(o, a));
      const result = await network.call({
        op: "score",
        rows: [{ state: dmcState(o, context), actions: features,
                 ...(architecture === "douzero" ? { history } : {}) }],
      });
      const scores: number[] = result.scores;
      if (
        scores.length !== actions.length ||
        scores.some((q) => !Number.isFinite(q))
      )
        throw Error("Invalid DMC scores");
      // Q is a return, not a calibrated action probability. Fixed experimental
      // temperature and uniform floor retain support for every legal action.
      const maximum = Math.max(...scores),
        weights = scores.map((q) => Math.exp((q - maximum) / 0.2));
      const total = weights.reduce((s, x) => s + x, 0);
      const probabilities = weights.map(
        (w) => (0.95 * w) / total + 0.05 / weights.length,
      );
      const x = encodeObservation(o, true);
      const payload = features
        .map((f, i) => [...f, probabilities[i]].join(" "))
        .join(" ");
      const preparationMs = performance.now() - start;
      if (!fixedIterations && preparationMs >= remainingMs) {
        return {
          action: actions[scores.indexOf(maximum)],
          elapsedMs: preparationMs,
          terminal: 0,
          priorMs: preparationMs,
        };
      }
      if (failure) throw failure;
      const answer = new Promise<any>((resolve, reject) => {
        pending = { resolve, reject };
      });
      native.stdin.write(
        `${fixedIterations || 100000} ${x.length} ${fixedIterations ? 0 : Math.max(0.01, remainingMs - preparationMs)} ${Array.from(x).join(" ")} ${mix} ${actions.length} ${payload}\n`,
      );
      const r = await answer;
      return {
        ...r,
        action: decodeAction(Int32Array.from(r.action), o),
        elapsedMs: performance.now() - start,
        priorMs: preparationMs,
      };
    },
    close() {
      network.close();
      native.stdin.end();
    },
  };
}

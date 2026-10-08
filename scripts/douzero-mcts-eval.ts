import { spawn } from "node:child_process";
import { mkdirSync, openSync, closeSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

/** Keep native search and its Python scorer in a cancellable process group. */
export async function runEvaluationProcess(script: string, args: string[], path: string,
  env: NodeJS.ProcessEnv = {}) {
  const fd = openSync(path, "w");
  try {
    await new Promise<void>((accept, reject) => {
      const child = spawn(process.execPath,
        ["--experimental-strip-types", script, ...args], {
          detached: true, stdio: ["ignore", fd, fd],
          env: { ...process.env, ...env },
        });
      const cancel = () => {
        if (child.pid) {
          try { process.kill(-child.pid, "SIGTERM"); } catch { /* Already exited. */ }
        }
      };
      process.on("SIGINT", cancel);
      process.on("SIGTERM", cancel);
      const clean = () => {
        process.off("SIGINT", cancel);
        process.off("SIGTERM", cancel);
      };
      child.once("error", (error) => { clean(); reject(error); });
      child.once("exit", (code) => {
        clean();
        code === 0 ? accept() : reject(Error(`${script} exited ${code}; see ${path}`));
      });
    });
  } finally { closeSync(fd); }
}

export function parseMctsSummary(output: string, pairs: number, simulations: number) {
  // Benchmark writes compact per-match records followed by a pretty summary.
  const start = output.lastIndexOf("\n{\n");
  const end = start < 0 ? -1 : output.indexOf("\n}", start);
  const summary = JSON.parse(start < 0 ? output : output.slice(start + 1,
    end < 0 ? undefined : end + 2));
  if (summary.comparison !== "equal-search-count" ||
      summary.fixedIterationsPerTree !== simulations ||
      !Array.isArray(summary.wins) || summary.wins.length !== 2 ||
      !summary.wins.every((n: number) => Number.isSafeInteger(n) && n >= 0) ||
      summary.wins[0] + summary.wins[1] !== pairs * 2)
    throw Error("Incomplete or mismatched MCTS evaluation");
  return summary;
}

export async function evaluateDouzeroMcts(directory: string, checkpoint: string,
  version: number, fullSaleOnly: boolean, pairs: number, simulations: number) {
  const prefix = join(directory, "mcts", `model-${version}`);
  mkdirSync(join(directory, "mcts"), { recursive: true });
  const started = performance.now();
  await runEvaluationProcess("scripts/benchmark-native.ts",
    [fullSaleOnly ? "douzeroMctsFullSale" : "douzeroMcts", "guidedBehavior",
      "3900020000", String(pairs), "50"], prefix + ".log", {
      JAIPUR_DOUZERO_CHECKPOINT: resolve(checkpoint),
      JAIPUR_DOUZERO_FULL_SALE_ONLY: fullSaleOnly ? "1" : "0",
      JAIPUR_AI_BIN_DIR: resolve(directory, "mcts-bin"),
      JAIPUR_BENCH_ITERATIONS: String(simulations),
      JAIPUR_BENCH_LOG: "", JAIPUR_BENCH_PROGRESS: "", JAIPUR_BENCH_VERBOSE: "0",
    });
  const result = {
    ...parseMctsSummary(readFileSync(prefix + ".log", "utf8"), pairs, simulations),
    checkpoint, version, matches: pairs * 2,
    elapsedSeconds: (performance.now() - started) / 1000,
  };
  writeFileSync(prefix + ".json", JSON.stringify(result, null, 2) + "\n");
  return result;
}

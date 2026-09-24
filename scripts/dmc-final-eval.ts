import { spawn } from "node:child_process";
import { openSync, closeSync } from "node:fs";
import { join } from "node:path";

export async function finalDmcEvaluation(
  directory: string,
  checkpoint: string,
  initial: string,
) {
  async function run(script: string, args: string[], output: string, env = {}) {
    const fd = openSync(join(directory, output), "w");
    try {
      await new Promise<void>((resolve, reject) => {
        const child = spawn(
          process.execPath,
          ["--experimental-strip-types", script, ...args],
          {
            env: { ...process.env, ...env },
            stdio: ["ignore", fd, "inherit"],
          },
        );
        child.on("error", reject);
        child.on("exit", (code) =>
          code === 0 ? resolve() : reject(Error(`${script} exited ${code}`)),
        );
      });
    } finally {
      closeSync(fd);
    }
  }
  const evaluate = "scripts/evaluate-dmc.ts";
  await run(
    evaluate,
    [checkpoint, join(directory, "heldout-normal"), "3300000000", "64"],
    "heldout-normal.log",
  );
  await run(
    evaluate,
    [initial, join(directory, "initial-normal"), "3300000000", "64"],
    "initial-normal.log",
  );
  await run(
    evaluate,
    [
      checkpoint,
      join(directory, "versus-initial"),
      "3400000000",
      "32",
      initial,
    ],
    "versus-initial.log",
  );
  for (const budget of [1000, 2000]) {
    const prefix = join(directory, `versus-guided-${budget / 1000}s`);
    await run(
      "scripts/benchmark-native.ts",
      [
        "dmc",
        "guidedBehavior",
        budget === 1000 ? "7601" : "7701",
        "2",
        String(budget),
      ],
      `versus-guided-${budget / 1000}s-result.json`,
      {
        JAIPUR_DMC_CHECKPOINT: checkpoint,
        JAIPUR_BENCH_LOG: prefix + "-games.jsonl",
        JAIPUR_BENCH_PROGRESS: prefix + "-progress.json",
      },
    );
  }
}

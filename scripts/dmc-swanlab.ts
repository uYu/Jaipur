import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

/** Dedicated process keeps SDK/network work out of the actor inference RPC. */
export function swanlabTracker(directory: string) {
  const worker = spawn(
    process.env.JAIPUR_PYTHON ?? "python3",
    ["scripts/dmc-swanlab.py", directory],
    { stdio: ["pipe", "pipe", "inherit"] },
  );
  let failure: Error | undefined;
  let pending: { resolve: () => void; reject: (e: Error) => void } | undefined;
  const response = () =>
    new Promise<void>((resolve, reject) => {
      if (failure) reject(failure);
      else pending = { resolve, reject };
    });
  const ready = response();
  const exited = new Promise<void>((resolve, reject) => {
    worker.on("error", (e) => {
      failure = e;
      pending?.reject(e);
      reject(e);
    });
    worker.on("exit", (code) => {
      if (code === 0) resolve();
      else {
        failure = Error(
          `SwanLab tracker exited ${code}; local logs remain available for backfill`,
        );
        pending?.reject(failure);
        reject(failure);
      }
    });
  });
  // Handle early termination even before close() is awaited.
  void exited.catch(() => {});
  worker.stdin.on("error", (e) => {
    failure = e;
    pending?.reject(e);
  });
  createInterface({ input: worker.stdout }).on("line", (line) => {
    try {
      JSON.parse(line);
      pending?.resolve();
      pending = undefined;
    } catch {
      failure = Error("Invalid SwanLab tracker response");
      pending?.reject(failure);
    }
  });
  return {
    ready,
    async log(row: object) {
      const acknowledged = response();
      worker.stdin.write(JSON.stringify(row) + "\n");
      await acknowledged;
    },
    async close(failed = false) {
      if (!failure) {
        const acknowledged = response();
        worker.stdin.write(JSON.stringify({ op: "finish", failed }) + "\n");
        await acknowledged;
      }
      worker.stdin.end();
      await exited;
    },
    async evaluate() {
      const acknowledged = response();
      worker.stdin.write(JSON.stringify({ op: "evaluate" }) + "\n");
      await acknowledged;
    },
  };
}

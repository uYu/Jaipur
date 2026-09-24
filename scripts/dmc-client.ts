import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
export function dmcClient(directory: string, checkpoint?: string) {
  const args = ["scripts/dmc-learner.py", "--directory", directory];
  if (checkpoint) args.push("--checkpoint", checkpoint);
  const worker = spawn(process.env.JAIPUR_PYTHON ?? "python3", args, {
    stdio: ["pipe", "pipe", "inherit"],
  });
  let pending:
    { resolve: (x: any) => void; reject: (e: Error) => void } | undefined;
  createInterface({ input: worker.stdout }).on("line", (line) => {
    const p = pending;
    pending = undefined;
    try {
      const r = JSON.parse(line);
      if (r.error) p?.reject(Error(r.error));
      else p?.resolve(r);
    } catch (e) {
      p?.reject(e as Error);
    }
  });
  worker.on("error", (e) => pending?.reject(e));
  worker.on("exit", (code) =>
    pending?.reject(Error(`DMC worker exited ${code}`)),
  );
  return {
    call(r: object): Promise<any> {
      if (pending) throw Error("Concurrent DMC RPC");
      return new Promise((resolve, reject) => {
        pending = { resolve, reject };
        worker.stdin.write(JSON.stringify(r) + "\n");
      });
    },
    close() {
      worker.stdin.end();
    },
  };
}

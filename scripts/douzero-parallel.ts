import { appendFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Worker } from "node:worker_threads";

type ScoreRow = { state: number[]; actions: number[][]; history: number[][] };
type ScoreRequest = { worker: Worker; id: number; rows: ScoreRow[] };
type Batch = {
  x: number[][];
  history: number[][][];
  y: number[];
  completed: number;
  truncated: number;
  totalTurns: number;
};

/** Run independent game engines on CPU threads; batch their legal-action scores. */
export async function parallelDouzeroBatch(args: {
  client: { call(request: object): Promise<any> };
  directory: string;
  iteration: number;
  version: number;
  epsilon: number;
  games: number;
  actors: number;
  lanesPerActor: number;
  maxTurns: number;
  trainSeed: number;
  cumulativeSamples: number;
  targetSamples: number;
}): Promise<Batch> {
  const count = Math.min(args.actors, args.games);
  const workers: Worker[] = [];
  const queue: ScoreRequest[] = [];
  const launchedByWorker = Array(count).fill(0);
  const turnsByWorker = Array(count).fill(0);
  const result: Batch = { x: [], history: [], y: [], completed: 0,
                          truncated: 0, totalTurns: 0 };
  let flushing = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  function schedule() {
    if (!timer && !flushing)
      timer = setTimeout(() => { timer = undefined; void flush(); }, 1);
  }
  async function flush() {
    if (flushing || !queue.length) return;
    flushing = true;
    const requests = queue.splice(0);
    try {
      const rows = requests.flatMap((request) => request.rows);
      const answer = await args.client.call({ op: "act", rows, epsilon: args.epsilon });
      if (answer.indices.length !== rows.length)
        throw Error("Wrong parallel actor score count");
      let at = 0;
      for (const request of requests) {
        request.worker.postMessage({ kind: "act-result", id: request.id,
                                     indices: answer.indices.slice(at, at + request.rows.length) });
        at += request.rows.length;
      }
    } catch (error) {
      for (const request of requests)
        request.worker.postMessage({ kind: "act-result", id: request.id,
                                     error: String(error) });
    } finally {
      flushing = false;
      if (queue.length) schedule();
    }
  }
  const writeProgress = () => writeFileSync(join(args.directory, "progress.json"),
    JSON.stringify({
      iteration: args.iteration + 1,
      launched: launchedByWorker.reduce((sum, value) => sum + value, 0),
      completed: result.completed,
      truncated: result.truncated,
      totalTurns: result.totalTurns,
      samples: result.x.length,
      cumulativeSamples: args.cumulativeSamples,
      targetSamples: args.targetSamples,
    }));
  let offset = 0;
  try {
    const done = Array.from({ length: count }, (_, index) => {
      const games = Math.floor(args.games / count) +
        (index < args.games % count ? 1 : 0);
      const worker = new Worker(new URL("./douzero-selfplay-worker.ts", import.meta.url), {
        workerData: {
          seedStart: args.trainSeed + args.version * 10000 + offset,
          gameCount: games,
          lanes: args.lanesPerActor,
          maxTurns: args.maxTurns,
          iteration: args.iteration,
          version: args.version,
          epsilon: args.epsilon,
        },
      });
      offset += games;
      workers.push(worker);
      return new Promise<void>((resolve, reject) => {
        let finished = false;
        worker.on("message", (message: any) => {
          if (message.kind === "act") {
            queue.push({ worker, id: message.id, rows: message.rows });
            schedule();
          } else if (message.kind === "game" || message.kind === "truncated") {
            launchedByWorker[index] = message.launched;
            turnsByWorker[index] = message.totalTurns;
            result.totalTurns = turnsByWorker.reduce((sum, value) => sum + value, 0);
            if (message.kind === "game") {
              appendFileSync(join(args.directory, "selfplay-games.jsonl"),
                             JSON.stringify(message.game) + "\n");
              result.completed++;
              for (const sample of message.samples) {
                result.x.push(sample.x);
                result.history.push(sample.history);
                result.y.push(sample.actor === message.winner ? 1 : -1);
              }
            } else {
              appendFileSync(join(args.directory, "truncated-games.jsonl"),
                             JSON.stringify(message.game) + "\n");
              result.truncated++;
            }
            writeProgress();
          } else if (message.kind === "done") {
            finished = true;
            resolve();
          } else if (message.kind === "error") reject(Error(message.error));
        });
        worker.on("error", reject);
        worker.on("exit", (code) => {
          if (!finished) reject(Error(`DouZero actor exited ${code} before completion`));
        });
      });
    });
    await Promise.all(done);
    if (result.completed + result.truncated !== args.games)
      throw Error("Parallel actors returned the wrong game count");
    return result;
  } finally {
    if (timer) clearTimeout(timer);
    await Promise.all(workers.map((worker) => worker.terminate()));
  }
}

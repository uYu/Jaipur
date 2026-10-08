import { appendFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { addRoundMetrics, emptyRoundMetrics } from "./douzero-round-metrics.ts";
import type { RoundMetrics } from "./douzero-round-metrics.ts";

type ScoreRow = { state: number[]; actions: number[][]; history: number[][] };
type ScoreRequest = { worker: Worker; id: number; rows: ScoreRow[] };
type ScoreClient = { call(request: object): Promise<any> };
type Batch = {
  x: number[][];
  history: number[][][];
  y: number[];
  completed: number;
  rounds: number;
  truncated: number;
  totalTurns: number;
  roundMetrics: RoundMetrics;
};

/** Run independent game engines on CPU threads; batch their legal-action scores. */
export async function parallelDouzeroBatch(args: {
  client: ScoreClient;
  scoreClients?: ScoreClient[];
  directory: string;
  iteration: number;
  version: number;
  epsilon: number;
  fullSaleOnly: boolean;
  saveGames: boolean;
  games: number;
  actors: number;
  lanesPerActor: number;
  maxTurns: number;
  trainSeed: number;
  cumulativeSamples: number;
  targetSamples: number;
}): Promise<Batch> {
  const count = Math.min(args.actors, args.games);
  const scoreClients = args.scoreClients?.length ? args.scoreClients : [args.client];
  const workers: Worker[] = [];
  const queues: ScoreRequest[][] = scoreClients.map(() => []);
  const launchedByWorker = Array(count).fill(0);
  const turnsByWorker = Array(count).fill(0);
  const result: Batch = { x: [], history: [], y: [], completed: 0, rounds: 0,
    truncated: 0, totalTurns: 0, roundMetrics: emptyRoundMetrics() };
  const flushing = scoreClients.map(() => false);
  const timers: (ReturnType<typeof setTimeout> | undefined)[] = scoreClients.map(() => undefined);
  function schedule(index: number) {
    if (!timers[index] && !flushing[index])
      timers[index] = setTimeout(() => { timers[index] = undefined; void flush(index); }, 1);
  }
  async function flush(index: number) {
    if (flushing[index] || !queues[index].length) return;
    flushing[index] = true;
    const requests = queues[index].splice(0);
    try {
      const rows = requests.flatMap((request) => request.rows);
      const answer = await scoreClients[index].call({ op: "act", rows, epsilon: args.epsilon });
      if (answer.version !== args.version)
        throw Error(`Actor scorer version ${answer.version} differs from self-play version ${args.version}`);
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
      flushing[index] = false;
      if (queues[index].length) schedule(index);
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
          fullSaleOnly: args.fullSaleOnly,
          saveGames: args.saveGames,
        },
      });
      offset += games;
      workers.push(worker);
      return new Promise<void>((resolve, reject) => {
        let finished = false;
        worker.on("message", (message: any) => {
          if (message.kind === "act") {
            const scorer = index % scoreClients.length;
            queues[scorer].push({ worker, id: message.id, rows: message.rows });
            schedule(scorer);
          } else if (message.kind === "game" || message.kind === "truncated") {
            launchedByWorker[index] = message.launched;
            turnsByWorker[index] = message.totalTurns;
            result.totalTurns = turnsByWorker.reduce((sum, value) => sum + value, 0);
            if (message.kind === "game") {
              if (args.saveGames)
                appendFileSync(join(args.directory, "selfplay-games.jsonl"),
                               JSON.stringify(message.game) + "\n");
              result.completed++;
              result.rounds += message.rounds;
              addRoundMetrics(result.roundMetrics, message.roundMetrics);
              for (const sample of message.samples) {
                result.x.push(sample.x);
                result.history.push(sample.history);
                result.y.push(sample.actor === message.winner ? 1 : -1);
              }
            } else {
              if (args.saveGames)
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
    for (const timer of timers) if (timer) clearTimeout(timer);
    await Promise.all(workers.map((worker) => worker.terminate()));
  }
}

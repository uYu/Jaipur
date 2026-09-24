import { mkdirSync, writeFileSync, appendFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  newGame,
  applyAction,
  nextRound,
  actionError,
} from "../src/game/engine.ts";
import { observe, chooseAction } from "../src/game/ai.ts";
import { dmcActions, dmcState, dmcAction } from "../src/game/dmc.ts";
import type { State, Event } from "../src/game/types.ts";
import { dmcClient } from "./dmc-client.ts";
import { swanlabTracker } from "./dmc-swanlab.ts";
import { finalDmcEvaluation } from "./dmc-final-eval.ts";

const directory = process.argv[2] ?? "analysis/dmc-selfplay-2026-09-24";
const iterations = Number(process.argv[3] ?? 12),
  gamesPerIteration = Number(process.argv[4] ?? 128);
const targetSamples = Number(process.env.DMC_TARGET_SAMPLES ?? 0),
  evalEvery = Number(process.env.DMC_EVAL_EVERY ?? 3),
  devPairs = Number(process.env.DMC_DEV_PAIRS ?? 4);
for (const [name, value] of Object.entries({
  iterations,
  gamesPerIteration,
  evalEvery,
  devPairs,
}))
  if (!Number.isSafeInteger(value) || value <= 0)
    throw Error(`Invalid ${name}`);
if (!Number.isSafeInteger(targetSamples) || targetSamples < 0)
  throw Error("Invalid DMC_TARGET_SAMPLES");
const maxTurns = 700,
  lanes = 16,
  trainSeed = 1_000_000,
  devSeed = 3_000_000_000;
if (existsSync(join(directory, "config.json")))
  throw Error(
    "Use a fresh output directory; optional fifth argument resumes a checkpoint",
  );
mkdirSync(directory, { recursive: true });
const client = dmcClient(directory, process.argv[5]);
let tracker: ReturnType<typeof swanlabTracker> | undefined;
const log = async (x: object) => {
  const s = JSON.stringify(x);
  console.log(s);
  appendFileSync(join(directory, "training.jsonl"), s + "\n");
  await tracker?.log(x);
};
const context = (s: State) => ({
  ownSeals: s.seals[s.current],
  opponentSeals: s.seals[1 - s.current],
  round: s.round,
});
type Episode = {
  state: State;
  events: Event[];
  samples: { x: number[]; actor: number }[];
  turns: number;
  id: number;
};
function prepare(e: Episode) {
  if (e.state.phase === "roundEnd") {
    e.state = nextRound(e.state);
    e.events.push({ type: "next" });
  }
  const o = observe(e.state, e.events, 0.75),
    actions = dmcActions(o);
  return {
    actions,
    row: {
      state: dmcState(o, context(e.state)),
      actions: actions.map((a) => dmcAction(o, a)),
    },
  };
}
async function arena() {
  const wins = [0, 0];
  let truncated = 0;
  for (let seed = devSeed; seed < devSeed + devPairs; seed++)
    for (let seat = 0; seat < 2; seat++) {
      const e: Episode = {
        state: newGame(seed),
        events: [],
        samples: [],
        turns: 0,
        id: seed,
      };
      while (e.state.phase !== "finished" && e.turns++ < maxTurns) {
        const p = prepare(e);
        const a =
          e.state.current === seat
            ? p.actions[
                (await client.call({ op: "act", rows: [p.row], epsilon: 0 }))
                  .indices[0]
              ]
            : chooseAction(observe(e.state, e.events, 0.75), "normal");
        const error = actionError(e.state, a);
        if (error) throw Error(error);
        e.state = applyAction(e.state, a);
        e.events.push(a);
      }
      if (e.state.phase !== "finished") truncated++;
      else wins[e.state.seals[seat] > e.state.seals[1 - seat] ? 0 : 1]++;
    }
  return {
    wins,
    truncated,
    matches: devPairs * 2,
    seeds: [devSeed, devSeed + devPairs - 1],
  };
}

writeFileSync(
  join(directory, "config.json"),
  JSON.stringify(
    {
      iterations,
      gamesPerIteration,
      targetSamples,
      evalEvery,
      devPairs,
      lanes,
      maxTurns,
      trainSeed,
      devSeed,
      target: "completed full-match actor-perspective return; gamma=1",
      initialization: process.argv[5]
        ? "resume checkpoint"
        : "random weights, no teacher or existing game data",
      resumeCheckpoint: process.argv[5] ?? null,
      encoder:
        "public observation + hand posterior + public seals; no hidden truth or seed",
      architecture: [170, 128, 128, 1],
      optimizer: "RMSprop lr=0.0001 alpha=.99 eps=0.00001",
      epochsPerBatch: 4,
      exploration:
        "uniform legal-action epsilon-greedy, epsilon=.2 while policy version <2, then .1",
      actorUpdate:
        "synchronous after each completed batch; shared model for both symmetric seats",
      checkpointSelection: "paired development arena wins, not MSE",
    },
    null,
    2,
  ) + "\n",
);
let succeeded = false;
try {
  if (process.env.SWANLAB_API_KEY || process.env.SWANLAB_MODE) {
    tracker = swanlabTracker(directory);
    await tracker.ready;
  }
  const initial = await client.call({ op: "save" });
  const initialArena = await arena();
  await log({ iteration: 0, ...initial, arena: initialArena });
  let best =
    initialArena.wins[0] - initialArena.wins[1] - initialArena.truncated;
  let bestCheckpoint = initial.checkpoint;
  let cumulativeSamples = 0,
    cumulativeMatches = 0;
  for (let iteration = 0; iteration < iterations; iteration++) {
    const started = performance.now(),
      x: number[][] = [],
      y: number[] = [];
    let launched = 0,
      completed = 0,
      truncated = 0,
      totalTurns = 0;
    const active: Episode[] = [];
    const epsilon = initial.version + iteration < 2 ? 0.2 : 0.1;
    while (completed + truncated < gamesPerIteration) {
      while (active.length < lanes && launched < gamesPerIteration) {
        const id =
          trainSeed + (initial.version + iteration) * 10000 + launched++;
        active.push({
          state: newGame(id),
          events: [],
          samples: [],
          turns: 0,
          id,
        });
      }
      const prepared = active.map(prepare);
      const answer = await client.call({
        op: "act",
        rows: prepared.map((p) => p.row),
        epsilon,
      });
      for (let i = active.length - 1; i >= 0; i--) {
        const e = active[i],
          p = prepared[i],
          index = answer.indices[i],
          a = p.actions[index];
        if (!a) throw Error("DMC selected outside legal mask");
        const error = actionError(e.state, a);
        if (error) throw Error(error);
        e.samples.push({
          actor: e.state.current,
          x: [...p.row.state, ...p.row.actions[index]],
        });
        e.state = applyAction(e.state, a);
        e.events.push(a);
        e.turns++;
        totalTurns++;
        if (e.state.phase === "finished") {
          const winner = e.state.seals[0] > e.state.seals[1] ? 0 : 1;
          for (const sample of e.samples) {
            x.push(sample.x);
            y.push(sample.actor === winner ? 1 : -1);
          }
          appendFileSync(
            join(directory, "selfplay-games.jsonl"),
            JSON.stringify({
              seed: e.id,
              iteration,
              version: answer.version,
              epsilon,
              winner,
              turns: e.turns,
              events: e.events,
            }) + "\n",
          );
          completed++;
          active.splice(i, 1);
        } else if (e.turns >= maxTurns) {
          // Jaipur exchanges can cycle: do not fabricate a draw or terminal label.
          appendFileSync(
            join(directory, "truncated-games.jsonl"),
            JSON.stringify({
              seed: e.id,
              iteration,
              version: answer.version,
              epsilon,
              events: e.events,
            }) + "\n",
          );
          truncated++;
          active.splice(i, 1);
        }
      }
      writeFileSync(
        join(directory, "progress.json"),
        JSON.stringify({
          iteration: iteration + 1,
          launched,
          completed,
          truncated,
          totalTurns,
          samples: x.length,
          cumulativeSamples,
          targetSamples,
        }),
      );
    }
    if (!x.length)
      throw Error("No complete episodes; refusing fabricated labels");
    const learned = await client.call({ op: "learn", x, y, epochs: 4 });
    cumulativeSamples += learned.samples;
    cumulativeMatches += completed;
    const reachedTarget =
      targetSamples > 0 && cumulativeSamples >= targetSamples;
    const evaluate =
      (iteration + 1) % evalEvery === 0 ||
      iteration + 1 === iterations ||
      reachedTarget;
    const result = evaluate ? await arena() : undefined;
    if (result) {
      const score = result.wins[0] - result.wins[1] - result.truncated;
      if (score > best) {
        best = score;
        bestCheckpoint = learned.checkpoint;
      }
    }
    writeFileSync(
      join(directory, "selection.json"),
      JSON.stringify(
        {
          bestCheckpoint,
          bestDevScore: best,
          latestCheckpoint: learned.checkpoint,
          criterion: "paired dev match results; ties keep earlier checkpoint",
          promoted: false,
        },
        null,
        2,
      ) + "\n",
    );
    await log({
      iteration: iteration + 1,
      epsilon,
      completed,
      truncated,
      totalTurns,
      ...learned,
      cumulativeSamples,
      cumulativeMatches,
      arena: result,
      elapsedSeconds: (performance.now() - started) / 1000,
    });
    if (reachedTarget) break;
  }
  if (targetSamples && cumulativeSamples < targetSamples)
    throw Error(
      `Iteration safety limit reached with ${cumulativeSamples}/${targetSamples} samples`,
    );
  writeFileSync(
    join(directory, "completion.json"),
    JSON.stringify(
      {
        phase: "training-complete",
        cumulativeSamples,
        cumulativeMatches,
        targetSamples,
        bestCheckpoint,
      },
      null,
      2,
    ),
  );
  if (process.env.DMC_FINAL_EVAL === "1") {
    await finalDmcEvaluation(directory, bestCheckpoint, initial.checkpoint);
    await tracker?.evaluate();
    writeFileSync(
      join(directory, "completion.json"),
      JSON.stringify(
        {
          phase: "evaluation-complete",
          cumulativeSamples,
          cumulativeMatches,
          targetSamples,
          bestCheckpoint,
          promoted: false,
        },
        null,
        2,
      ),
    );
  }
  succeeded = true;
} finally {
  client.close();
  await tracker?.close(!succeeded);
}

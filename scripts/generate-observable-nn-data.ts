import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  applyAction,
  legalActions,
  newGame,
  nextRound,
} from "../src/game/engine.ts";
import { chooseAction, observe } from "../src/game/ai.ts";
import { encodeObservation } from "../src/game/ai-wasm.ts";
import type { Event } from "../src/game/types.ts";
import { GOODS } from "../src/game/types.ts";

const [output, startArg, gamesArg] = process.argv.slice(2);
const start = Number(startArg),
  games = Number(gamesArg);
if (
  !output ||
  !Number.isInteger(start) ||
  !Number.isInteger(games) ||
  games < 1
)
  throw Error(
    "Usage: generate-observable-nn-data.ts output.f32 startSeed games",
  );
const binary = join(
  process.env.JAIPUR_AI_BIN_DIR ?? join(tmpdir(), "jaipur-ai-research"),
  "observation-features",
);
const processFeatures = spawn(binary, [], {
  stdio: ["pipe", "pipe", "inherit"],
});
const lines = createInterface({ input: processFeatures.stdout });
let pending: ((features: Float32Array) => void) | undefined;
lines.on("line", (line) => {
  const callback = pending;
  pending = undefined;
  if (callback) callback(Float32Array.from(line.split(" ").map(Number)));
});
const featuresOf = (encoded: Int32Array): Promise<Float32Array> => {
  if (pending) throw Error("Feature encoder has an outstanding request");
  return new Promise((resolve) => {
    pending = resolve;
    processFeatures.stdin.write(
      `${encoded.length} ${Array.from(encoded).join(" ")}\n`,
    );
  });
};
const rows: Buffer[] = [];
let finished = 0,
  positions = 0;
try {
  for (let seed = start; seed < start + games; seed++) {
    let state = newGame(seed);
    const events: Event[] = [];
    let roundPositions: { features: Float32Array; observer: number }[] = [];
    let rng = seed >>> 0;
    for (let step = 0; step < 700; step++) {
      if (state.phase !== "playing") {
        const result = state.results.at(-1)!;
        for (const position of roundPositions) {
          const sign = position.observer === 0 ? 1 : -1;
          const margin = (sign * (result.scores[0] - result.scores[1])) / 224;
          const win =
            result.winner === null
              ? 0
              : result.winner === position.observer
                ? 1
                : -1;
          const row = new Float32Array(162);
          row.set(position.features);
          row[160] = margin;
          row[161] = win;
          rows.push(Buffer.from(row.buffer));
          positions++;
        }
        roundPositions = [];
        finished++;
        if (state.phase === "finished") break;
        events.push({ type: "next" });
        state = nextRound(state);
      }
      if (
        state.turn % 6 === 0 ||
        (state.turn % 3 === 0 &&
          GOODS.filter((good) => !state.tokens[good].length).length >= 2)
      ) {
        const observation = observe(state, events, 0.75);
        const features = await featuresOf(encodeObservation(observation, true));
        if (
          features.length !== 160 ||
          features.some((value) => !Number.isFinite(value))
        )
          throw Error(`Invalid features at seed ${seed} turn ${state.turn}`);
        roundPositions.push({ features, observer: state.current });
      }
      const actions = legalActions(state);
      rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
      const action =
        seed % 5 === 0
          ? actions[Math.floor((rng / 4294967296) * actions.length)]
          : chooseAction(observe(state, events), "normal");
      state = applyAction(state, action);
      events.push(action);
    }
    if (state.phase !== "finished")
      throw Error(`Game ${seed} did not finish within 700 events`);
  }
} finally {
  processFeatures.stdin.end();
}
writeFileSync(output, Buffer.concat(rows));
console.error(
  JSON.stringify({ output, games, finishedRounds: finished, positions }),
);
